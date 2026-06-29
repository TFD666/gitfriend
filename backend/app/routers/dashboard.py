import uuid
from datetime import datetime

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
    project_count: int
    total_chunks: int
    pr_reviews_count: int
    artifacts_count: int


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

    # Owned project IDs subquery (reused across counts)
    owned_ids = select(Project.id).where(Project.user_id == uid).scalar_subquery()

    project_count_q = await db.execute(
        select(func.count()).where(Project.user_id == uid)
    )
    project_count = project_count_q.scalar_one()

    chunks_q = await db.execute(
        select(func.count()).where(Chunk.project_id.in_(owned_ids))
    )
    total_chunks = chunks_q.scalar_one()

    pr_q = await db.execute(
        select(func.count(PRReview.pr_number.distinct())).where(
            PRReview.project_id.in_(owned_ids)
        )
    )
    pr_reviews_count = pr_q.scalar_one()

    art_q = await db.execute(
        select(func.count()).where(CareerArtifact.project_id.in_(owned_ids))
    )
    artifacts_count = art_q.scalar_one()

    return StatsResponse(
        project_count=project_count,
        total_chunks=total_chunks,
        pr_reviews_count=pr_reviews_count,
        artifacts_count=artifacts_count,
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
