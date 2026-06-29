import uuid

from arq import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.project import Project
from app.permissions import require_project_access
from app.services import summarize

router = APIRouter(prefix="/summarize", tags=["summarize"])


# --- Schemas ---

class FileSummarizeRequest(BaseModel):
    file_path: str


class PRSummarizeRequest(BaseModel):
    pr_number: int


class SummaryResponse(BaseModel):
    summary: str
    cached: bool


# --- Internal dependency ---

def _get_arq(request: Request) -> ArqRedis:
    return request.app.state.arq


# --- Routes ---

@router.post(
    "/{project_id}/file",
    response_model=SummaryResponse,
    status_code=status.HTTP_200_OK,
)
async def summarize_file(
    body: FileSummarizeRequest,
    force: bool = False,
    project: Project = Depends(require_project_access("editor")),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> SummaryResponse:
    try:
        result = await summarize.summarize_file(
            project_id=project.id,
            file_path=body.file_path,
            db=db,
            arq=arq,
            force=force,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini generation failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Summarization failed: {exc}") from exc

    return SummaryResponse(**result)


@router.post(
    "/{project_id}/pr",
    response_model=SummaryResponse,
    status_code=status.HTTP_200_OK,
)
async def summarize_pr(
    body: PRSummarizeRequest,
    force: bool = False,
    project: Project = Depends(require_project_access("editor")),
    db: AsyncSession = Depends(get_db),
    arq: ArqRedis = Depends(_get_arq),
) -> SummaryResponse:
    # Use the project owner's GitHub token — the owner's account has repo access.
    # Team editors are authorized to use the project but may not have direct GitHub access.
    from sqlalchemy import select
    from app.models.user import User
    result = await db.execute(select(User).where(User.id == project.user_id))
    owner = result.scalars().first()
    if owner is None:
        raise HTTPException(status_code=500, detail="Project owner not found")

    github_token = owner.get_github_token(settings.encryption_key)
    if not github_token:
        raise HTTPException(status_code=400, detail="No GitHub token on file — re-authenticate")

    try:
        result_data = await summarize.summarize_pr(
            project_id=project.id,
            pr_number=body.pr_number,
            repo_full_name=project.github_repo_full_name,
            github_token=github_token,
            arq=arq,
            force=force,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini generation failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Summarization failed: {exc}") from exc

    return SummaryResponse(**result_data)
