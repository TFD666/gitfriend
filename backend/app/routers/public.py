import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.career_artifact import CareerArtifact
from app.models.diagram_artifact import DiagramArtifact
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/public", tags=["public"])

_DESCRIPTION_MAX = 150


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class PublicProjectSummary(BaseModel):
    slug: str
    name: str
    github_repo_full_name: str
    published_at: datetime | None
    description: str | None


class PublicProfileResponse(BaseModel):
    username: str
    projects: list[PublicProjectSummary]


class PublicArtifact(BaseModel):
    artifact_type: str
    content: Any
    generated_at: datetime
    updated_at: datetime


class PublicDiagram(BaseModel):
    diagram_type: str
    mermaid_source: str
    generated_at: datetime


class PublicProjectResponse(BaseModel):
    slug: str
    name: str
    github_repo_full_name: str
    published_at: datetime | None
    artifacts: list[PublicArtifact]
    diagrams: list[PublicDiagram]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_user_by_username(db: AsyncSession, username: str) -> Any:
    result = await db.execute(
        select(User.id, User.github_username).where(User.github_username == username)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return row


def _project_name(github_repo_full_name: str) -> str:
    return github_repo_full_name.split("/")[-1]


def _truncate_description(text: str, max_chars: int = _DESCRIPTION_MAX) -> str:
    """Trim to max_chars at a word boundary; append ellipsis if truncated."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Walk back to the last whitespace so we don't cut mid-word.
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:") + "…"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/users/{username}", response_model=PublicProfileResponse)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> PublicProfileResponse:
    user = await _get_user_by_username(db, username)

    proj_result = await db.execute(
        select(
            Project.id,
            Project.slug,
            Project.github_repo_full_name,
            Project.published_at,
        ).where(
            Project.user_id == user.id,
            Project.is_public.is_(True),
            Project.slug.isnot(None),
        )
    )
    projects = proj_result.fetchall()

    if not projects:
        return PublicProfileResponse(username=username, projects=[])

    # Fetch portfolio artifacts for all public projects in one query.
    project_ids = [p.id for p in projects]
    artifact_result = await db.execute(
        select(CareerArtifact.project_id, CareerArtifact.content).where(
            CareerArtifact.project_id.in_(project_ids),
            CareerArtifact.artifact_type == "portfolio",
        )
    )
    portfolio_by_project: dict[uuid.UUID, dict] = {
        row.project_id: row.content for row in artifact_result.fetchall()
    }

    summaries: list[PublicProjectSummary] = []
    for p in projects:
        artifact_content = portfolio_by_project.get(p.id)
        raw_summary = (artifact_content or {}).get("summary") if artifact_content else None
        description = _truncate_description(raw_summary) if raw_summary else None

        summaries.append(
            PublicProjectSummary(
                slug=p.slug,
                name=_project_name(p.github_repo_full_name),
                github_repo_full_name=p.github_repo_full_name,
                published_at=p.published_at,
                description=description,
            )
        )

    return PublicProfileResponse(username=username, projects=summaries)


@router.get("/users/{username}/projects/{slug}", response_model=PublicProjectResponse)
async def get_public_project(
    username: str,
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> PublicProjectResponse:
    user = await _get_user_by_username(db, username)

    proj_result = await db.execute(
        select(
            Project.id,
            Project.slug,
            Project.github_repo_full_name,
            Project.published_at,
            Project.is_public,
            Project.diagrams_shared,
        ).where(
            Project.user_id == user.id,
            Project.slug == slug,
        )
    )
    project = proj_result.one_or_none()

    # 404 whether project missing OR is_public=false — don't distinguish
    if project is None or not project.is_public:
        raise HTTPException(status_code=404, detail="Project not found")

    artifacts_result = await db.execute(
        select(
            CareerArtifact.artifact_type,
            CareerArtifact.content,
            CareerArtifact.generated_at,
            CareerArtifact.updated_at,
        ).where(CareerArtifact.project_id == project.id)
    )
    artifact_rows = artifacts_result.fetchall()

    # Diagrams only exposed when diagrams_shared=True on this public project.
    diagram_rows: list = []
    if project.diagrams_shared:
        diag_result = await db.execute(
            select(
                DiagramArtifact.diagram_type,
                DiagramArtifact.mermaid_source,
                DiagramArtifact.generated_at,
            ).where(DiagramArtifact.project_id == project.id)
        )
        diagram_rows = diag_result.fetchall()

    return PublicProjectResponse(
        slug=project.slug,
        name=_project_name(project.github_repo_full_name),
        github_repo_full_name=project.github_repo_full_name,
        published_at=project.published_at,
        artifacts=[
            PublicArtifact(
                artifact_type=row.artifact_type,
                content=row.content,
                generated_at=row.generated_at,
                updated_at=row.updated_at,
            )
            for row in artifact_rows
        ],
        diagrams=[
            PublicDiagram(
                diagram_type=row.diagram_type,
                mermaid_source=row.mermaid_source,
                generated_at=row.generated_at,
            )
            for row in diagram_rows
        ],
    )
