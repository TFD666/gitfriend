import logging
import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import github, llm

logger = logging.getLogger(__name__)

_CACHE_TTL = 86_400  # 24 h
_MAX_CONTENT_CHARS = 40_000


def _file_cache_key(project_id: uuid.UUID, file_path: str) -> str:
    return f"summary:file:{project_id}:{file_path}"


def _pr_cache_key(project_id: uuid.UUID, pr_number: int) -> str:
    return f"summary:pr:{project_id}:{pr_number}"


async def _get_cached(key: str, arq: Any) -> str | None:
    value = await arq.get(key)
    if value is None:
        return None
    return value.decode() if isinstance(value, bytes) else value


async def _set_cached(key: str, value: str, arq: Any) -> None:
    await arq.setex(key, _CACHE_TTL, value)


async def summarize_file(
    project_id: uuid.UUID,
    file_path: str,
    db: AsyncSession,
    arq: Any,
    *,
    force: bool = False,
) -> dict:
    cache_key = _file_cache_key(project_id, file_path)

    if not force:
        cached = await _get_cached(cache_key, arq)
        if cached is not None:
            return {"summary": cached, "cached": True}

    result = await db.execute(
        text("""
            SELECT content
            FROM   chunks
            WHERE  project_id = :pid
              AND  file_path   = :fp
            ORDER  BY start_line
        """),
        {"pid": project_id, "fp": file_path},
    )
    rows = result.mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No indexed chunks for file: {file_path}")

    combined = "\n".join(r["content"] for r in rows)[:_MAX_CONTENT_CHARS]

    prompt = (
        f"You are a senior software engineer explaining code to a teammate. "
        f"Summarize the file `{file_path}` in plain language: what it does, "
        f"its key functions or classes, and how it fits into the larger codebase.\n\n"
        f"Write 2–4 sentences. No bullet points. No markdown.\n\n"
        f"File content:\n{combined}"
    )

    logger.info("Summarizing file %s in project %s", file_path, project_id)
    summary: str = await llm.generate(prompt)
    await _set_cached(cache_key, summary, arq)
    return {"summary": summary, "cached": False}


async def summarize_pr(
    project_id: uuid.UUID,
    pr_number: int,
    repo_full_name: str,
    github_token: str,
    arq: Any,
    *,
    force: bool = False,
) -> dict:
    """Fetch and summarize a pull request diff.

    Spec omitted repo_full_name from the signature, but github.get_pull_request_diff
    requires it. Router passes it after fetching the project for the ownership check.
    """
    cache_key = _pr_cache_key(project_id, pr_number)

    if not force:
        cached = await _get_cached(cache_key, arq)
        if cached is not None:
            return {"summary": cached, "cached": True}

    diff = await github.get_pull_request_diff(github_token, repo_full_name, pr_number)
    truncated = len(diff) > _MAX_CONTENT_CHARS
    diff = diff[:_MAX_CONTENT_CHARS]

    trunc_note = "\n\n(Note: diff was truncated to fit context limits.)" if truncated else ""

    prompt = (
        f"You are a senior software engineer reviewing a pull request. "
        f"Based on the unified diff below for PR #{pr_number}, explain in plain language:\n"
        f"1. What changed (which files, what kind of changes)\n"
        f"2. Why the change likely exists (the intent or goal)\n"
        f"3. Any notable patterns or risks visible in the diff\n\n"
        f"Write 3–5 sentences. No markdown, no bullet points.{trunc_note}\n\n"
        f"Diff:\n{diff}"
    )

    logger.info("Summarizing PR #%d in project %s", pr_number, project_id)
    summary: str = await llm.generate(prompt)
    await _set_cached(cache_key, summary, arq)
    return {"summary": summary, "cached": False}
