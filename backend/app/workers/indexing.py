import logging
import traceback
import uuid
from datetime import datetime, timezone

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.project import IndexStatus, Project
from app.models.user import User
from app.services import ingestion

logger = logging.getLogger(__name__)


async def index_repository(ctx: dict, project_id: str) -> None:
    pid = uuid.UUID(project_id)
    project: Project | None = None
    db = AsyncSessionLocal()

    try:
        project = await db.get(Project, pid)
        if project is None:
            logger.error("index_repository: project %s not found", project_id)
            return

        user = await db.get(User, project.user_id)
        if user is None:
            logger.error("index_repository: owner not found for project %s", project_id)
            return

        project.index_status = IndexStatus.indexing
        await db.commit()
        logger.info("Indexing started — project=%s repo=%s", project_id, project.github_repo_full_name)

        github_token = user.get_github_token(settings.encryption_key)
        if not github_token:
            raise ValueError(f"GitHub token missing for user {user.id}")

        result = await ingestion.chunk_repo(
            project_id=pid,
            repo_full_name=project.github_repo_full_name,
            github_token=github_token,
            db=db,
        )
        logger.info("Indexing complete — project=%s result=%s", project_id, result)

        project.index_status = IndexStatus.ready
        project.last_indexed_at = datetime.now(timezone.utc)
        await db.commit()

    except Exception:
        logger.error(
            "Indexing failed — project=%s\n%s",
            project_id,
            traceback.format_exc(),
        )
        if project is not None:
            try:
                project.index_status = IndexStatus.failed
                await db.commit()
            except Exception:
                logger.error("Failed to persist index_status=failed for project %s", project_id)

    finally:
        await db.close()
