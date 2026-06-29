import asyncio
import base64
import logging
import time

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_API_BASE = "https://api.github.com"
_GITHUB_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
_RATE_LIMIT_BUFFER = 10  # sleep when remaining drops below this


def _auth_headers(token: str) -> dict[str, str]:
    return {**_GITHUB_HEADERS, "Authorization": f"Bearer {token}"}


async def _check_rate_limit(resp: httpx.Response) -> None:
    """Sleep until reset if remaining requests are dangerously low."""
    try:
        remaining = int(resp.headers.get("X-RateLimit-Remaining", 999))
        reset_at = int(resp.headers.get("X-RateLimit-Reset", 0))
    except ValueError:
        return

    if remaining < _RATE_LIMIT_BUFFER:
        sleep_secs = max(reset_at - int(time.time()), 0) + 1
        logger.warning("GitHub rate limit low (%d remaining). Sleeping %ds.", remaining, sleep_secs)
        await asyncio.sleep(sleep_secs)


def _is_rate_limit_403(resp: httpx.Response) -> bool:
    """True when GitHub returns 403 specifically due to rate exhaustion."""
    if resp.status_code != 403:
        return False
    try:
        return int(resp.headers.get("X-RateLimit-Remaining", 1)) == 0
    except ValueError:
        return False


def _raise_for_github_status(resp: httpx.Response) -> None:
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub token invalid or expired")
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="GitHub access forbidden — check token scopes")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="GitHub resource not found")
    resp.raise_for_status()


async def exchange_code_for_token(code: str) -> str:
    from app.config import settings

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _GITHUB_TOKEN_URL,
            json={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        logger.error("GitHub token exchange error: %s", data.get("error_description"))
        raise HTTPException(status_code=400, detail="GitHub OAuth token exchange failed")

    return data["access_token"]


async def get_authenticated_user(token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/user",
            headers=_auth_headers(token),
            timeout=10,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)
        return resp.json()


async def get_user_repos(token: str) -> list[dict]:
    """Return repos sorted by last update, up to 100."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/user/repos",
            headers=_auth_headers(token),
            params={"sort": "updated", "per_page": 100},
            timeout=15,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)

    return [
        {
            "full_name": r["full_name"],
            "private": r["private"],
            "language": r.get("language"),
            "description": r.get("description"),
            "updated_at": r["updated_at"],
        }
        for r in resp.json()
    ]


async def get_repo_tree(token: str, repo_full_name: str) -> list[dict]:
    """Return flat recursive tree — blobs only (files, not subtrees)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/repos/{repo_full_name}/git/trees/HEAD",
            headers=_auth_headers(token),
            params={"recursive": "1"},
            timeout=30,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)

    data = resp.json()
    if data.get("truncated"):
        logger.warning("Repo tree truncated for %s — large repo", repo_full_name)

    return [
        {
            "path": item["path"],
            "type": item["type"],
            "sha": item["sha"],
            "size": item.get("size", 0),  # bytes; only present for blobs
        }
        for item in data.get("tree", [])
    ]


async def get_file_content(token: str, repo_full_name: str, path: str) -> str:
    """Fetch a single file and return its decoded text content.

    Retries once if GitHub returns a rate-limit 403 (X-RateLimit-Remaining=0).
    Permission-based 403s are raised immediately without retrying.
    """
    async with httpx.AsyncClient() as client:
        for attempt in range(2):
            resp = await client.get(
                f"{_GITHUB_API_BASE}/repos/{repo_full_name}/contents/{path}",
                headers=_auth_headers(token),
                timeout=15,
            )
            await _check_rate_limit(resp)  # sleep proactively if remaining < buffer

            if _is_rate_limit_403(resp):
                if attempt == 0:
                    logger.warning(
                        "Rate-limit 403 fetching %s/%s — retrying after backoff", repo_full_name, path
                    )
                    continue  # _check_rate_limit already slept; retry now
                # second attempt still rate-limited: fall through and raise
            _raise_for_github_status(resp)
            break

    data = resp.json()
    encoding = data.get("encoding")
    if encoding != "base64":
        raise HTTPException(
            status_code=422,
            detail=f"Unexpected encoding '{encoding}' for {path}",
        )

    raw = data["content"].replace("\n", "")
    return base64.b64decode(raw).decode("utf-8", errors="replace")


async def get_file_commits(
    token: str,
    repo_full_name: str,
    file_path: str,
) -> tuple[int, str | None]:
    """
    Return (commit_count, last_commit_iso) for a single file path.

    Uses `per_page=1` so GitHub returns only the latest commit, then reads
    the Link header's `rel="last"` page number as the total commit count —
    one API call per file regardless of history depth.

    Link header is absent when there is exactly one page → count = 1.
    Empty commit list (file has no history) → (0, None).
    404 (file renamed/deleted between index and analysis) → raises HTTPException(404).
    """
    import re as _re

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/repos/{repo_full_name}/commits",
            headers=_auth_headers(token),
            params={"path": file_path, "per_page": 1},
            timeout=15,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)

    commits = resp.json()
    if not commits:
        return 0, None

    # Most recent commit timestamp — prefer committer date, fall back to author date.
    head = commits[0]
    last_commit_iso: str | None = (
        head.get("commit", {}).get("committer", {}).get("date")
        or head.get("commit", {}).get("author", {}).get("date")
    )

    # Parse total commit count from Link header.
    link = resp.headers.get("Link", "")
    if not link:
        # No pagination → exactly 1 page → 1 commit.
        return 1, last_commit_iso

    match = _re.search(r'[?&]page=(\d+)[^>]*>;\s*rel="last"', link)
    if match:
        return int(match.group(1)), last_commit_iso

    # Link header present but no rel="last" — shouldn't happen with per_page=1
    # when there are commits, but treat as 1 to avoid returning 0.
    logger.warning(
        "Unexpected Link header for %s/%s — no rel=last: %s", repo_full_name, file_path, link
    )
    return 1, last_commit_iso


async def get_pull_request_info(
    token: str, repo_full_name: str, pr_number: int
) -> dict:
    """Return basic PR metadata: title and author login.

    Returns {"title": str | None, "author": str | None}.
    Raises HTTPException on 404 (PR not found) or auth errors.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/repos/{repo_full_name}/pulls/{pr_number}",
            headers=_auth_headers(token),
            timeout=30,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)
        data = resp.json()
    return {
        "title": data.get("title"),
        "author": data.get("user", {}).get("login"),
    }


async def get_pull_request_diff(token: str, repo_full_name: str, pr_number: int) -> str:
    """Return raw unified diff for a pull request."""
    diff_headers = {
        **_auth_headers(token),
        "Accept": "application/vnd.github.diff",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_GITHUB_API_BASE}/repos/{repo_full_name}/pulls/{pr_number}",
            headers=diff_headers,
            timeout=30,
        )
        await _check_rate_limit(resp)
        _raise_for_github_status(resp)

    return resp.text
