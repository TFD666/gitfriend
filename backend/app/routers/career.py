import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.career_artifact import ArtifactType, CareerArtifact
from app.models.project import IndexStatus, Project
from app.permissions import require_project_access
from app.services import career

router = APIRouter(prefix="/career", tags=["career"])


# --- Schemas ---

class ArtifactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    artifact_type: str
    content: dict
    model_version: str
    generated_at: datetime
    updated_at: datetime


_GENERATORS = {
    ArtifactType.portfolio: career.generate_portfolio,
    ArtifactType.resume_bullets: career.generate_resume_bullets,
    ArtifactType.interview_prep: career.generate_interview_prep,
}


# --- Routes ---

@router.post(
    "/{project_id}/{artifact_type}",
    response_model=ArtifactResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_artifact(
    artifact_type: ArtifactType,
    project: Project = Depends(require_project_access("editor", "career_mode")),
    db: AsyncSession = Depends(get_db),
) -> CareerArtifact:
    if project.index_status != IndexStatus.ready:
        raise HTTPException(status_code=400, detail="Project not indexed yet")

    try:
        context = await career._build_context(project.id, db)
        artifact = await _GENERATORS[artifact_type](project, context, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini generation failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Generation failed: {exc}") from exc

    return artifact


@router.get("/{project_id}/{artifact_type}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_type: ArtifactType,
    project: Project = Depends(require_project_access("viewer", "career_mode")),
    db: AsyncSession = Depends(get_db),
) -> CareerArtifact:
    result = await db.execute(
        select(CareerArtifact).where(
            CareerArtifact.project_id == project.id,
            CareerArtifact.artifact_type == artifact_type.value,
        )
    )
    artifact = result.scalars().first()
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not generated yet")
    return artifact


@router.get("/{project_id}", response_model=list[ArtifactResponse])
async def list_artifacts(
    project: Project = Depends(require_project_access("viewer", "career_mode")),
    db: AsyncSession = Depends(get_db),
) -> list[CareerArtifact]:
    result = await db.execute(
        select(CareerArtifact)
        .where(CareerArtifact.project_id == project.id)
        .order_by(CareerArtifact.generated_at)
    )
    return list(result.scalars().all())
