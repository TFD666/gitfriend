import logging
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.diagram_artifact import DiagramArtifact
from app.models.project import Project
from app.services.diagram import DiagramGenerationError, generate_diagram
from app.services.diagram_context import build_dependency_context, build_system_context

logger = logging.getLogger(__name__)

# Maps diagram_type → (status_col, cooldown_col, context_builder)
_TYPE_META = {
    "system_architecture": (
        "diagram_system_status",
        "last_diagram_system_at",
        build_system_context,
    ),
    "dependency_graph": (
        "diagram_dependency_status",
        "last_diagram_dependency_at",
        build_dependency_context,
    ),
}


async def generate_diagram_artifact(ctx: dict, project_id: str, diagram_type: str) -> None:
    pid = uuid.UUID(project_id)
    project: Project | None = None
    db = AsyncSessionLocal()

    status_col, cooldown_col, build_context = _TYPE_META[diagram_type]

    try:
        project = await db.get(Project, pid)
        if project is None:
            logger.error("generate_diagram_artifact: project %s not found", project_id)
            return

        repo = project.github_repo_full_name
        logger.info(
            "Diagram generation started — project=%s repo=%s type=%s",
            project_id, repo, diagram_type,
        )

        # Build context (pure DB reads)
        context_str = await build_context(pid, repo, db)

        # Generate + validate (with retry)
        mermaid_source = await generate_diagram(diagram_type, context_str)

        # Upsert DiagramArtifact
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(DiagramArtifact).where(
                DiagramArtifact.project_id == pid,
                DiagramArtifact.diagram_type == diagram_type,
            )
        )
        artifact = result.scalars().first()
        if artifact is None:
            artifact = DiagramArtifact(
                project_id=pid,
                diagram_type=diagram_type,
                mermaid_source=mermaid_source,
                generated_at=now,
                last_requested_at=now,
            )
            db.add(artifact)
        else:
            artifact.mermaid_source = mermaid_source
            artifact.generated_at = now
            artifact.last_requested_at = now

        setattr(project, status_col, "ready")
        await db.commit()

        logger.info(
            "Diagram generation complete — project=%s type=%s",
            project_id, diagram_type,
        )

    except DiagramGenerationError as exc:
        logger.error(
            "Diagram generation validation failed — project=%s type=%s: %s",
            project_id, diagram_type, exc,
        )
        if project is not None:
            try:
                setattr(project, status_col, "failed")
                await db.commit()
            except Exception:
                logger.error("Failed to persist %s=failed for project %s", status_col, project_id)

    except Exception:
        logger.error(
            "Diagram generation error — project=%s type=%s\n%s",
            project_id, diagram_type, traceback.format_exc(),
        )
        if project is not None:
            try:
                setattr(project, status_col, "failed")
                await db.commit()
            except Exception:
                logger.error("Failed to persist %s=failed for project %s", status_col, project_id)

    finally:
        await db.close()
