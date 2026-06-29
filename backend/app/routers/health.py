import math
import uuid
from datetime import datetime, timedelta, timezone

from arq import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.file_health_metric import FileHealthMetric
from app.models.project import Project
from app.permissions import require_project_access

router = APIRouter(prefix="/projects", tags=["health"])


def _get_arq(request: Request) -> ArqRedis:
    return request.app.state.arq


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class HealthFileItem(BaseModel):
    file_path: str
    loc: int
    complexity_score: int
    commit_count: int | None
    last_commit_at: datetime | None
    hotspot_score: float | None


class HealthResponse(BaseModel):
    health_status: str | None
    last_health_analysis_at: datetime | None
    hotspots: list[HealthFileItem]
    stale: list[HealthFileItem]


class AnalyzeAccepted(BaseModel):
    health_status: str
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/{project_id}/health/analyze", response_model=AnalyzeAccepted)
async def trigger_health_analysis(
    project: Project = Depends(require_project_access("editor", "repo_health")),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> AnalyzeAccepted:
    # Reject if job already running.
    if project.health_status == "running":
        raise HTTPException(status_code=409, detail="Analysis already running")

    # Cooldown check — only applies after at least one completed run.
    if project.last_health_analysis_at is not None:
        elapsed_minutes = (
            datetime.now(timezone.utc) - project.last_health_analysis_at
        ).total_seconds() / 60
        if elapsed_minutes < settings.repo_health_cooldown_minutes:
            remaining = math.ceil(settings.repo_health_cooldown_minutes - elapsed_minutes)
            raise HTTPException(
                status_code=429,
                detail=f"On cooldown — available again in {remaining}m",
            )

    project.health_status = "running"
    await db.commit()
    await arq.enqueue_job("analyze_repo_health", str(project.id))
    return AnalyzeAccepted(health_status="running", message="Analysis queued")


@router.get("/{project_id}/health", response_model=HealthResponse)
async def get_health(
    project: Project = Depends(require_project_access("viewer", "repo_health")),
    db: AsyncSession = Depends(get_db),
) -> HealthResponse:
    stale_cutoff = datetime.now(timezone.utc) - timedelta(
        days=settings.repo_health_stale_days
    )

    hotspots_result = await db.execute(
        select(FileHealthMetric)
        .where(
            FileHealthMetric.project_id == project.id,
            FileHealthMetric.hotspot_score.isnot(None),
        )
        .order_by(FileHealthMetric.hotspot_score.desc())
        .limit(20)
    )
    hotspot_rows = hotspots_result.scalars().all()

    stale_result = await db.execute(
        select(FileHealthMetric)
        .where(
            FileHealthMetric.project_id == project.id,
            FileHealthMetric.last_commit_at.isnot(None),
            FileHealthMetric.last_commit_at < stale_cutoff,
        )
        .order_by(FileHealthMetric.last_commit_at.asc())
        .limit(20)
    )
    stale_rows = stale_result.scalars().all()

    def _to_item(m: FileHealthMetric) -> HealthFileItem:
        return HealthFileItem(
            file_path=m.file_path,
            loc=m.loc,
            complexity_score=m.complexity_score,
            commit_count=m.commit_count,
            last_commit_at=m.last_commit_at,
            hotspot_score=m.hotspot_score,
        )

    return HealthResponse(
        health_status=project.health_status,
        last_health_analysis_at=project.last_health_analysis_at,
        hotspots=[_to_item(m) for m in hotspot_rows],
        stale=[_to_item(m) for m in stale_rows],
    )
