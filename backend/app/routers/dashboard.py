import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.career_artifact import CareerArtifact
from app.models.chunk import Chunk
from app.models.diagram_artifact import DiagramArtifact
from app.models.pr_review import PRReview
from app.models.project import Project
from app.models.user import User

router = APIRouter(tags=["dashboard"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    # ── Projects ──────────────────────────────────────────────────────────────
    # Cumulative count vs count before 7 days ago. created_at is immutable.
    project_count: int
    project_count_prev: int | None = None

    # ── Chunks ────────────────────────────────────────────────────────────────
    # Live codebase size metric only — no trend. Chunks are deleted/re-created
    # on every re-index so created_at does NOT represent historical growth.
    total_chunks: int

    # ── PRs Reviewed ──────────────────────────────────────────────────────────
    # Rolling 7-day window: reviews this week vs reviews the prior week.
    # reviewed_at is immutable and set by the worker.
    pr_reviews_this_week: int
    pr_reviews_prev_week: int | None = None

    # ── Artifacts ─────────────────────────────────────────────────────────────
    # Activity metric: artifacts updated this week vs prior week.
    # updated_at is refreshed on every regeneration via upsert.
    artifacts_this_week: int
    artifacts_prev_week: int | None = None


class ActivityEvent(BaseModel):
    type: str
    project_name: str
    project_id: uuid.UUID
    ts: datetime


# ── /stats ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatsResponse:
    uid = current_user.id
    now = datetime.now(timezone.utc)
    one_week_ago  = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    # Owned project IDs subquery (reused across counts)
    owned_ids = select(Project.id).where(Project.user_id == uid).scalar_subquery()

    # ── Projects ──────────────────────────────────────────────────────────────
    # Cumulative count: how many projects exist now vs 7 days ago.
    # created_at is immutable — never modified after insert.
    project_count_q = await db.execute(
        select(func.count()).where(Project.user_id == uid)
    )
    project_count = project_count_q.scalar_one()

    project_count_prev_q = await db.execute(
        select(func.count()).where(Project.user_id == uid, Project.created_at < one_week_ago)
    )
    project_count_prev = project_count_prev_q.scalar_one()

    # ── Chunks Indexed ────────────────────────────────────────────────────────
    # Live total only — no trend. Chunks are deleted and re-inserted on every
    # re-index, so created_at reflects the last indexing run, NOT repository
    # growth history. Any trend derived from it would be fabricated.
    chunks_q = await db.execute(
        select(func.count()).where(Chunk.project_id.in_(owned_ids))
    )
    total_chunks = chunks_q.scalar_one()

    # ── PRs Reviewed ──────────────────────────────────────────────────────────
    # Rolling 7-day window: distinct PRs reviewed this week vs the prior week.
    # reviewed_at is set once by the PR review worker and never overwritten.
    pr_this_week_q = await db.execute(
        select(func.count(PRReview.pr_number.distinct())).where(
            PRReview.project_id.in_(owned_ids),
            PRReview.reviewed_at >= one_week_ago,
        )
    )
    pr_reviews_this_week = pr_this_week_q.scalar_one()

    pr_prev_week_q = await db.execute(
        select(func.count(PRReview.pr_number.distinct())).where(
            PRReview.project_id.in_(owned_ids),
            PRReview.reviewed_at >= two_weeks_ago,
            PRReview.reviewed_at <  one_week_ago,
        )
    )
    pr_reviews_prev_week = pr_prev_week_q.scalar_one()

    # ── Artifacts Activity ────────────────────────────────────────────────────
    # Rolling 7-day window: artifacts updated this week vs the prior week.
    # updated_at is refreshed on every regeneration (see career._upsert_artifact),
    # so this captures both new creation and regeneration activity.
    art_this_week_q = await db.execute(
        select(func.count()).where(
            CareerArtifact.project_id.in_(owned_ids),
            CareerArtifact.updated_at >= one_week_ago,
        )
    )
    artifacts_this_week = art_this_week_q.scalar_one()

    art_prev_week_q = await db.execute(
        select(func.count()).where(
            CareerArtifact.project_id.in_(owned_ids),
            CareerArtifact.updated_at >= two_weeks_ago,
            CareerArtifact.updated_at <  one_week_ago,
        )
    )
    artifacts_prev_week = art_prev_week_q.scalar_one()

    return StatsResponse(
        project_count=project_count,
        project_count_prev=project_count_prev,
        total_chunks=total_chunks,
        pr_reviews_this_week=pr_reviews_this_week,
        pr_reviews_prev_week=pr_reviews_prev_week,
        artifacts_this_week=artifacts_this_week,
        artifacts_prev_week=artifacts_prev_week,
    )


# ── /activity ─────────────────────────────────────────────────────────────────

@router.get("/activity", response_model=list[ActivityEvent])
async def get_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityEvent]:
    uid = str(current_user.id)

    # UNION ALL of 5 event streams, ordered by ts desc, limit 20.
    # Each subquery has an inline LIMIT to cap rows before the UNION sort.
    # All filter on user_id via projects — projects.user_id is indexed.
    sql = text("""
        (SELECT 'indexed'            AS type,
                p.github_repo_full_name AS project_name,
                p.id::text              AS project_id,
                p.last_indexed_at       AS ts
         FROM   projects p
         WHERE  p.user_id = :uid AND p.index_status = 'ready'
           AND  p.last_indexed_at IS NOT NULL
         ORDER BY p.last_indexed_at DESC LIMIT 20)
        UNION ALL
        (SELECT 'pr_reviewed'        AS type,
                p.github_repo_full_name,
                r.project_id::text,
                r.reviewed_at
         FROM   pr_reviews r
         JOIN   projects p ON p.id = r.project_id
         WHERE  p.user_id = :uid
         ORDER BY r.reviewed_at DESC LIMIT 20)
        UNION ALL
        (SELECT 'artifact_generated' AS type,
                p.github_repo_full_name,
                a.project_id::text,
                a.updated_at
         FROM   career_artifacts a
         JOIN   projects p ON p.id = a.project_id
         WHERE  p.user_id = :uid
         ORDER BY a.updated_at DESC LIMIT 20)
        UNION ALL
        (SELECT 'diagram_generated'  AS type,
                p.github_repo_full_name,
                d.project_id::text,
                d.generated_at
         FROM   diagram_artifacts d
         JOIN   projects p ON p.id = d.project_id
         WHERE  p.user_id = :uid
         ORDER BY d.generated_at DESC LIMIT 20)
        UNION ALL
        (SELECT 'health_analyzed'    AS type,
                p.github_repo_full_name,
                p.id::text,
                p.last_health_analysis_at
         FROM   projects p
         WHERE  p.user_id = :uid AND p.last_health_analysis_at IS NOT NULL
         ORDER BY p.last_health_analysis_at DESC LIMIT 20)
        ORDER BY ts DESC
        LIMIT 20
    """)

    result = await db.execute(sql, {"uid": uid})
    rows = result.mappings().all()

    return [
        ActivityEvent(
            type=row["type"],
            project_name=row["project_name"],
            project_id=uuid.UUID(row["project_id"]),
            ts=row["ts"],
        )
        for row in rows
    ]
