import uuid
from datetime import datetime, timezone

from arq import ArqRedis
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.career_artifact import CareerArtifact
from app.models.pr_review import PRReview
from app.models.project import IndexStatus, Project
from app.models.team_member import MemberStatus, TeamMember
from app.models.user import User
from app.permissions import require_project_access
from app.services.slug import generate_unique_slug

router = APIRouter(prefix="/projects", tags=["projects"])


# --- Schemas ---

class CreateProjectRequest(BaseModel):
    github_repo_full_name: str


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    github_repo_full_name: str
    index_status: IndexStatus
    last_indexed_at: datetime | None
    is_private: bool
    is_public: bool
    slug: str | None
    published_at: datetime | None
    mentor_chat_shared: bool
    career_mode_shared: bool
    repo_health_shared: bool
    created_at: datetime
    # Quick-action extras (null when no data exists yet)
    last_pr_number: int | None = None
    last_pr_verdict: str | None = None
    last_artifact_type: str | None = None


class IndexJobAccepted(BaseModel):
    project_id: uuid.UUID
    status: str


class PublishRequest(BaseModel):
    is_public: bool


class PublishResponse(BaseModel):
    is_public: bool
    slug: str | None
    public_url: str | None


# --- Internal dependency ---

def _get_arq(request: Request) -> ArqRedis:
    return request.app.state.arq


# --- Routes ---

@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=IndexJobAccepted)
async def create_project(
    body: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> IndexJobAccepted:
    project = Project(
        user_id=current_user.id,
        github_repo_full_name=body.github_repo_full_name,
        index_status=IndexStatus.pending,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    await arq.enqueue_job("index_repository", str(project.id))

    return IndexJobAccepted(project_id=project.id, status=IndexStatus.pending)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectResponse]:
    # Own projects OR projects where the user has an active TeamMember row.
    # Three correlated scalar subqueries add last PR + artifact data in ONE query
    # (not N+1 — the DB executes a single statement with correlated subqueries).
    uid = current_user.id

    # Correlated subquery: latest pr_number for this project
    last_pr_number_sq = (
        select(PRReview.pr_number)
        .where(PRReview.project_id == Project.id)
        .order_by(PRReview.reviewed_at.desc())
        .limit(1)
        .correlate(Project)
        .scalar_subquery()
    )

    # Correlated subquery: verdict for the same latest review
    last_pr_verdict_sq = (
        select(PRReview.verdict)
        .where(PRReview.project_id == Project.id)
        .order_by(PRReview.reviewed_at.desc())
        .limit(1)
        .correlate(Project)
        .scalar_subquery()
    )

    # Correlated subquery: most recent career artifact type
    last_artifact_type_sq = (
        select(CareerArtifact.artifact_type)
        .where(CareerArtifact.project_id == Project.id)
        .order_by(CareerArtifact.updated_at.desc())
        .limit(1)
        .correlate(Project)
        .scalar_subquery()
    )

    stmt = (
        select(
            Project,
            last_pr_number_sq.label("last_pr_number"),
            last_pr_verdict_sq.label("last_pr_verdict"),
            last_artifact_type_sq.label("last_artifact_type"),
        )
        .where(
            or_(
                Project.user_id == uid,
                exists(
                    select(TeamMember.id).where(
                        TeamMember.project_id == Project.id,
                        TeamMember.user_id == uid,
                        TeamMember.status == MemberStatus.active,
                    )
                ),
            )
        )
        .order_by(Project.created_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        ProjectResponse(
            **{
                c.name: getattr(project, c.name)
                for c in Project.__table__.columns
            },
            last_pr_number=last_pr_num,
            last_pr_verdict=last_pr_verd,
            last_artifact_type=last_art_type,
        )
        for project, last_pr_num, last_pr_verd, last_art_type in rows
    ]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project: Project = Depends(require_project_access("viewer")),
) -> Project:
    return project


@router.post("/{project_id}/index", status_code=status.HTTP_202_ACCEPTED, response_model=IndexJobAccepted)
async def reindex_project(
    project: Project = Depends(require_project_access("editor")),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> IndexJobAccepted:
    project.index_status = IndexStatus.pending
    await db.commit()

    await arq.enqueue_job("index_repository", str(project.id))

    return IndexJobAccepted(project_id=project.id, status=IndexStatus.pending)


@router.patch("/{project_id}/publish", response_model=PublishResponse)
async def publish_project(
    body: PublishRequest,
    project: Project = Depends(require_project_access("owner")),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PublishResponse:
    if body.is_public:
        if project.slug is None:
            repo_name = project.github_repo_full_name.split("/")[-1]
            project.slug = await generate_unique_slug(
                db, current_user.id, repo_name, exclude_project_id=project.id
            )
        if project.published_at is None:
            project.published_at = datetime.now(timezone.utc)
        project.is_public = True
        public_url = f"{settings.frontend_url}/u/{current_user.github_username}/{project.slug}"
    else:
        project.is_public = False
        project.published_at = None
        public_url = None

    await db.commit()

    return PublishResponse(
        is_public=project.is_public,
        slug=project.slug,
        public_url=public_url,
    )
