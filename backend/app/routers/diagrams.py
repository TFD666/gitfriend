import math
import uuid
from datetime import datetime, timezone
from typing import Literal

from arq import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.diagram_artifact import DiagramArtifact
from app.models.project import Project
from app.permissions import require_project_access

router = APIRouter(prefix="/projects", tags=["diagrams"])

DiagramType = Literal["system_architecture", "dependency_graph"]

# Maps diagram_type → (status_col, cooldown_col)
_TYPE_META: dict[str, tuple[str, str]] = {
    "system_architecture": ("diagram_system_status", "last_diagram_system_at"),
    "dependency_graph": ("diagram_dependency_status", "last_diagram_dependency_at"),
}


def _get_arq(request: Request) -> ArqRedis:
    return request.app.state.arq


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class DiagramArtifactOut(BaseModel):
    diagram_type: str
    mermaid_source: str
    generated_at: datetime
    last_requested_at: datetime | None


class DiagramsResponse(BaseModel):
    system_architecture: DiagramArtifactOut | None
    dependency_graph: DiagramArtifactOut | None
    diagram_system_status: str | None
    diagram_dependency_status: str | None
    last_diagram_system_at: datetime | None
    last_diagram_dependency_at: datetime | None


class GenerateAccepted(BaseModel):
    diagram_type: str
    status: str
    message: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/{project_id}/diagrams/{diagram_type}/generate", response_model=GenerateAccepted)
async def generate_diagram(
    diagram_type: DiagramType,
    project: Project = Depends(require_project_access("editor", "diagrams")),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> GenerateAccepted:
    status_col, cooldown_col = _TYPE_META[diagram_type]

    # Reject if already generating.
    current_status = getattr(project, status_col)
    if current_status == "generating":
        raise HTTPException(status_code=409, detail="Diagram generation already in progress")

    # Cooldown check.
    last_at: datetime | None = getattr(project, cooldown_col)
    if last_at is not None:
        elapsed_minutes = (datetime.now(timezone.utc) - last_at).total_seconds() / 60
        if elapsed_minutes < settings.diagram_cooldown_minutes:
            remaining = math.ceil(settings.diagram_cooldown_minutes - elapsed_minutes)
            raise HTTPException(
                status_code=429,
                detail=f"On cooldown — available again in {remaining}m",
            )

    # Set status + cooldown timestamp before enqueue (race-condition guard).
    setattr(project, status_col, "generating")
    setattr(project, cooldown_col, datetime.now(timezone.utc))
    await db.commit()
    await arq.enqueue_job("generate_diagram_artifact", str(project.id), diagram_type)

    return GenerateAccepted(
        diagram_type=diagram_type,
        status="generating",
        message="Diagram generation queued",
    )


@router.get("/{project_id}/diagrams", response_model=DiagramsResponse)
async def get_diagrams(
    project: Project = Depends(require_project_access("viewer", "diagrams")),
    db: AsyncSession = Depends(get_db),
) -> DiagramsResponse:
    result = await db.execute(
        select(DiagramArtifact).where(DiagramArtifact.project_id == project.id)
    )
    rows = {r.diagram_type: r for r in result.scalars().all()}

    def _out(r: DiagramArtifact | None) -> DiagramArtifactOut | None:
        if r is None:
            return None
        return DiagramArtifactOut(
            diagram_type=r.diagram_type,
            mermaid_source=r.mermaid_source,
            generated_at=r.generated_at,
            last_requested_at=r.last_requested_at,
        )

    return DiagramsResponse(
        system_architecture=_out(rows.get("system_architecture")),
        dependency_graph=_out(rows.get("dependency_graph")),
        diagram_system_status=project.diagram_system_status,
        diagram_dependency_status=project.diagram_dependency_status,
        last_diagram_system_at=project.last_diagram_system_at,
        last_diagram_dependency_at=project.last_diagram_dependency_at,
    )
