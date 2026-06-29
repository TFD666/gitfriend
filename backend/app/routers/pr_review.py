"""
PR Review Assistant endpoints — Phase 11.

Routes:
  POST   /projects/{id}/pr-reviews                        — owner only; enqueue ARQ job
  GET    /projects/{id}/pr-reviews                        — viewer + pr_review; history index
  GET    /projects/{id}/pr-reviews/{pr_number}            — viewer + pr_review; all runs
  POST   /projects/{id}/pr-reviews/{pr_number}/runs/{run_id}/post-to-github  — owner only

Design notes:
- No cooldown in v1; owners can submit multiple back-to-back reviews.
- Frontend polls GET /pr-reviews/{pr_number} until a new run appears.
- Editors may not trigger reviews (owner-only per spec).
- post-to-github is a separate explicit action; not triggered automatically.
"""
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.pr_review import PRReview, PRReviewComment
from app.models.project import Project
from app.models.user import User
from app.permissions import require_project_access
from app.services.github_review import post_github_review
from app.config import settings

router = APIRouter(prefix="/projects", tags=["pr_review"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EnqueueRequest(BaseModel):
    pr_number: int


class PRReviewCommentOut(BaseModel):
    id: uuid.UUID
    file_path: str
    line_number: int | None
    comment_type: str
    body: str
    github_posted: bool

    model_config = {"from_attributes": True}


class PRReviewOut(BaseModel):
    id: uuid.UUID
    pr_number: int
    run_number: int
    pr_title: str | None
    pr_author: str | None
    verdict: str
    summary: str
    reviewed_at: str
    comments: list[PRReviewCommentOut]

    model_config = {"from_attributes": True}


class PRReviewSummaryOut(BaseModel):
    """Lightweight row for the history index — no comments."""
    id: uuid.UUID
    pr_number: int
    run_number: int
    pr_title: str | None
    pr_author: str | None
    verdict: str
    reviewed_at: str

    model_config = {"from_attributes": True}


class PostToGithubResponse(BaseModel):
    posted_count: int
    failures: list[str]


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _review_to_out(review: PRReview) -> dict[str, Any]:
    return {
        "id": review.id,
        "pr_number": review.pr_number,
        "run_number": review.run_number,
        "pr_title": review.pr_title,
        "pr_author": review.pr_author,
        "verdict": review.verdict,
        "summary": review.summary,
        "reviewed_at": review.reviewed_at.isoformat(),
        "comments": [
            {
                "id": c.id,
                "file_path": c.file_path,
                "line_number": c.line_number,
                "comment_type": c.comment_type,
                "body": c.body,
                "github_posted": c.github_posted,
            }
            for c in review.comments
        ],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/{project_id}/pr-reviews", status_code=202)
async def enqueue_pr_review(
    body: EnqueueRequest,
    request: Request,
    project: Project = Depends(require_project_access("owner")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Enqueue an ARQ job to review the given PR. Owner only."""
    if body.pr_number < 1:
        raise HTTPException(status_code=422, detail="pr_number must be a positive integer")

    await request.app.state.arq.enqueue_job(
        "run_pr_review",
        str(project.id),
        body.pr_number,
    )
    return {"status": "queued", "pr_number": str(body.pr_number)}


@router.get("/{project_id}/pr-reviews")
async def list_pr_reviews(
    project: Project = Depends(require_project_access("viewer", "pr_review")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return summary rows (no comments) for all reviewed PRs, newest first."""
    result = await db.execute(
        select(
            PRReview.id,
            PRReview.pr_number,
            PRReview.run_number,
            PRReview.pr_title,
            PRReview.pr_author,
            PRReview.verdict,
            PRReview.reviewed_at,
        )
        .where(PRReview.project_id == project.id)
        .order_by(PRReview.reviewed_at.desc())
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "pr_number": r["pr_number"],
            "run_number": r["run_number"],
            "pr_title": r["pr_title"],
            "pr_author": r["pr_author"],
            "verdict": r["verdict"],
            "reviewed_at": r["reviewed_at"].isoformat(),
        }
        for r in rows
    ]


@router.get("/{project_id}/pr-reviews/{pr_number}")
async def get_pr_reviews(
    pr_number: int,
    project: Project = Depends(require_project_access("viewer", "pr_review")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return all runs for a given PR number, with full comments, newest run first."""
    result = await db.execute(
        select(PRReview)
        .where(PRReview.project_id == project.id, PRReview.pr_number == pr_number)
        .order_by(PRReview.run_number.desc())
    )
    reviews = result.scalars().all()

    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found for this PR")

    # Eagerly load comments for each review.
    out = []
    for review in reviews:
        comments_result = await db.execute(
            select(PRReviewComment).where(PRReviewComment.review_id == review.id)
        )
        review.comments = list(comments_result.scalars().all())
        out.append(_review_to_out(review))
    return out


@router.post("/{project_id}/pr-reviews/{pr_number}/runs/{run_id}/post-to-github")
async def post_review_to_github(
    pr_number: int,
    run_id: uuid.UUID,
    project: Project = Depends(require_project_access("owner")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PostToGithubResponse:
    """Post an existing review run to GitHub as a pull request review. Owner only."""
    review = await db.get(PRReview, run_id)
    if review is None or review.project_id != project.id or review.pr_number != pr_number:
        raise HTTPException(status_code=404, detail="Review run not found")

    comments_result = await db.execute(
        select(PRReviewComment).where(PRReviewComment.review_id == run_id)
    )
    comments = list(comments_result.scalars().all())

    token = current_user.get_github_token(settings.encryption_key)
    if not token:
        raise HTTPException(status_code=400, detail="No GitHub token available")

    result = await post_github_review(
        token=token,
        repo_full_name=project.github_repo_full_name,
        pr_number=pr_number,
        verdict=review.verdict,
        summary=review.summary,
        comments=comments,
        db=db,
    )
    return PostToGithubResponse(**result)
