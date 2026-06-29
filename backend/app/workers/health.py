import logging
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.file_health_metric import FileHealthMetric
from app.models.project import Project
from app.models.user import User
from app.services.complexity import run_complexity
from app.services.churn import run_churn

logger = logging.getLogger(__name__)


async def analyze_repo_health(ctx: dict, project_id: str) -> None:
    pid = uuid.UUID(project_id)
    project: Project | None = None
    db = AsyncSessionLocal()

    try:
        project = await db.get(Project, pid)
        if project is None:
            logger.error("analyze_repo_health: project %s not found", project_id)
            return

        user = await db.get(User, project.user_id)
        if user is None:
            logger.error("analyze_repo_health: owner not found for project %s", project_id)
            return

        github_token = user.get_github_token(settings.encryption_key)
        if not github_token:
            raise ValueError(f"GitHub token missing for user {user.id}")

        repo = project.github_repo_full_name
        project.health_status = "running"
        await db.commit()
        logger.info("Health analysis started — project=%s repo=%s", project_id, repo)

        # ---------------------------------------------------------------
        # Step 1: complexity pass — pure DB, all indexed files
        # ---------------------------------------------------------------
        file_stats = await run_complexity(pid, db)
        # file_stats: {file_path: (loc, complexity_score)}

        if not file_stats:
            logger.info("Health analysis: no indexed files for %s", repo)
            project.health_status = "ready"
            project.last_health_analysis_at = datetime.now(timezone.utc)
            await db.commit()
            return

        # ---------------------------------------------------------------
        # Step 2: select top-N by LOC — this bounds all subsequent API cost
        # ---------------------------------------------------------------
        n = settings.repo_health_max_files
        top_paths = [
            path for path, (loc, _) in
            sorted(file_stats.items(), key=lambda x: x[1][0], reverse=True)[:n]
        ]
        logger.info(
            "[%s] Top-%d files selected (of %d total) for churn analysis",
            repo, len(top_paths), len(file_stats),
        )

        # ---------------------------------------------------------------
        # Step 3: churn pass — exactly top-N GitHub API calls
        # ---------------------------------------------------------------
        await run_churn(pid, repo, github_token, top_paths, db)

        # ---------------------------------------------------------------
        # Step 4: hotspot_score — min-max normalize across top-N set only
        # ---------------------------------------------------------------
        metrics_result = await db.execute(
            select(FileHealthMetric).where(
                FileHealthMetric.project_id == pid,
                FileHealthMetric.file_path.in_(top_paths),
            )
        )
        metrics = metrics_result.scalars().all()

        # Only files with commit_count >= 1 participate; files with 0 or
        # null commit_count get hotspot_score = null (absent from both views).
        eligible = [
            m for m in metrics
            if m.commit_count is not None and m.commit_count > 0
        ]

        if eligible:
            complexities = [m.complexity_score for m in eligible]
            commits = [m.commit_count for m in eligible]  # type: ignore[misc]
            min_c, max_c = min(complexities), max(complexities)
            min_n, max_n = min(commits), max(commits)

            for m in eligible:
                c_norm = (
                    (m.complexity_score - min_c) / (max_c - min_c)
                    if max_c > min_c else 0.0
                )
                n_norm = (
                    (m.commit_count - min_n) / (max_n - min_n)  # type: ignore[operator]
                    if max_n > min_n else 0.0
                )
                m.hotspot_score = c_norm * n_norm

        # Explicitly null out hotspot_score for top-N files that have no
        # commit data — prevents stale scores from a previous run leaking.
        for m in metrics:
            if m.commit_count is None or m.commit_count == 0:
                m.hotspot_score = None

        # ---------------------------------------------------------------
        # Step 5: mark project done
        # ---------------------------------------------------------------
        project.health_status = "ready"
        project.last_health_analysis_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            "[%s] Health analysis complete — %d files analyzed, %d with hotspot scores",
            repo, len(metrics), len(eligible),
        )

    except Exception:
        logger.error(
            "Health analysis failed — project=%s\n%s",
            project_id,
            traceback.format_exc(),
        )
        if project is not None:
            try:
                project.health_status = "failed"
                await db.commit()
            except Exception:
                logger.error(
                    "Failed to persist health_status=failed for project %s", project_id
                )
    finally:
        await db.close()
