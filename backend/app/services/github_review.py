"""
GitHub PR Review post service for Phase 11.

post_github_review(...) — submits a stored PRReview as a GitHub pull request
review via POST /repos/{owner}/{repo}/pulls/{pr}/reviews.

Design decisions:
- File-level comments (line_number=None) are folded into the review body text
  because GitHub inline comments require a valid diff position.
- Inline comments (line_number set) are submitted as review comments with
  side="RIGHT". Gemini line numbers may not match actual diff positions;
  the spec says store as-is and not validate them, so invalid positions may
  cause GitHub to return 422.
- On 422 (invalid inline comment positions): retry as a body-only review
  (no inline comments array), log which comments were dropped.
  File-level comments are always included in the body.
- On any other non-2xx: raises HTTPException to the caller.
"""
import logging
import uuid

import httpx
from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pr_review import PRReviewComment
from app.services.github import (
    _GITHUB_API_BASE,
    _auth_headers,
    _check_rate_limit,
    _raise_for_github_status,
)

logger = logging.getLogger(__name__)

_VERDICT_MAP = {
    "approve": "APPROVE",
    "request_changes": "REQUEST_CHANGES",
    "comment": "COMMENT",
}

_TYPE_PREFIX = {
    "issue": "[ISSUE]",
    "suggestion": "[SUGGESTION]",
    "praise": "[PRAISE]",
    "nitpick": "[NITPICK]",
}


async def post_github_review(
    token: str,
    repo_full_name: str,
    pr_number: int,
    verdict: str,
    summary: str,
    comments: list[PRReviewComment],
    db: AsyncSession,
) -> dict:
    """Post a PR review to GitHub and mark comments as posted in the DB.

    Returns {"posted_count": int, "failures": list[str]}.
    posted_count = number of PRReviewComment rows whose github_posted was set True.
    failures = list of human-readable descriptions of comments that could not be posted.
    """
    event = _VERDICT_MAP.get(verdict, "COMMENT")

    # Partition: file-level (folded into body) vs inline (submitted as review comments).
    file_level = [c for c in comments if c.line_number is None]
    inline = [c for c in comments if c.line_number is not None]

    # Build review body: summary, then any file-level comments.
    body_parts = [summary]
    for c in file_level:
        prefix = _TYPE_PREFIX.get(c.comment_type, "")
        body_parts.append(f"**{c.file_path}** — {prefix} {c.body}")
    review_body = "\n\n".join(body_parts)

    # Build inline comment payloads for the GitHub API.
    inline_payloads = [
        {
            "path": c.file_path,
            "line": c.line_number,
            "side": "RIGHT",
            "body": f"{_TYPE_PREFIX.get(c.comment_type, '')} {c.body}".strip(),
        }
        for c in inline
    ]

    posted_ids: list[uuid.UUID] = []
    failures: list[str] = []

    url = f"{_GITHUB_API_BASE}/repos/{repo_full_name}/pulls/{pr_number}/reviews"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers=_auth_headers(token),
            json={"body": review_body, "event": event, "comments": inline_payloads},
        )
        await _check_rate_limit(resp)

        if resp.status_code == 422 and inline_payloads:
            # One or more inline comment positions are invalid — retry without them.
            # File-level comments are already embedded in review_body so still posted.
            failures = [
                f"{c.file_path}:{c.line_number} ({c.comment_type})" for c in inline
            ]
            logger.warning(
                "GitHub rejected inline comments for %s PR #%d (422). "
                "Retrying as body-only. Dropped: %s",
                repo_full_name, pr_number, failures,
            )
            resp = await client.post(
                url,
                headers=_auth_headers(token),
                json={"body": review_body, "event": event, "comments": []},
            )
            await _check_rate_limit(resp)
            _raise_for_github_status(resp)
            # Only file-level comments made it (embedded in body).
            posted_ids = [c.id for c in file_level]
        else:
            _raise_for_github_status(resp)
            posted_ids = [c.id for c in comments]

    # Mark successfully posted comments in DB.
    if posted_ids:
        await db.execute(
            update(PRReviewComment)
            .where(PRReviewComment.id.in_(posted_ids))
            .values(github_posted=True)
        )
        await db.commit()

    logger.info(
        "Posted GitHub review for %s PR #%d: event=%s, posted_count=%d, failures=%d",
        repo_full_name, pr_number, event, len(posted_ids), len(failures),
    )
    return {"posted_count": len(posted_ids), "failures": failures}
