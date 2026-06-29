import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file_health_metric import FileHealthMetric
from app.services import github

logger = logging.getLogger(__name__)

_CHURN_CONCURRENCY = 5  # conservative — each call costs 1 API request against the rate limit


async def run_churn(
    project_id: uuid.UUID,
    repo_full_name: str,
    github_token: str,
    file_paths: list[str],
    db: AsyncSession,
) -> None:
    """
    Fetch commit history for each file in file_paths (already bounded to top-N
    by the ARQ task) and update their FileHealthMetric rows with commit_count
    and last_commit_at.

    Files that 404 mid-run (renamed/deleted between index and analysis) are
    logged and skipped — their metric row keeps the complexity columns but
    commit_count stays null, so they won't appear in either Hotspots or Stale.

    Does NOT compute hotspot_score — the ARQ task does that after this returns,
    once all commit counts are known across the full top-N set.
    """
    if not file_paths:
        return

    semaphore = asyncio.Semaphore(_CHURN_CONCURRENCY)

    async def _fetch_one(file_path: str) -> tuple[str, int, str | None] | None:
        async with semaphore:
            try:
                count, last_iso = await github.get_file_commits(
                    github_token, repo_full_name, file_path
                )
                logger.debug(
                    "[%s] churn %s: %d commits, last=%s",
                    repo_full_name, file_path, count, last_iso,
                )
                return file_path, count, last_iso
            except HTTPException as exc:
                if exc.status_code == 404:
                    logger.warning(
                        "[%s] churn: %s returned 404 (renamed/deleted mid-run) — skipping",
                        repo_full_name, file_path,
                    )
                    return None
                raise  # re-raise non-404 HTTP errors (rate-limit 403, etc.)
            except Exception:
                logger.exception(
                    "[%s] churn: unexpected error fetching commits for %s",
                    repo_full_name, file_path,
                )
                return None

    logger.info(
        "[%s] Churn pass: %d files (concurrency=%d)", repo_full_name, len(file_paths), _CHURN_CONCURRENCY
    )
    results = await asyncio.gather(*[_fetch_one(fp) for fp in file_paths])

    # Update FileHealthMetric rows for successful fetches.
    now = datetime.now(timezone.utc)
    updated = 0
    for result in results:
        if result is None:
            continue
        file_path, commit_count, last_iso = result

        last_commit_at: datetime | None = None
        if last_iso:
            try:
                last_commit_at = datetime.fromisoformat(last_iso.replace("Z", "+00:00"))
            except ValueError:
                logger.warning("[%s] Unparseable commit date for %s: %r", repo_full_name, file_path, last_iso)

        row_result = await db.execute(
            select(FileHealthMetric).where(
                FileHealthMetric.project_id == project_id,
                FileHealthMetric.file_path == file_path,
            )
        )
        metric = row_result.scalar_one_or_none()
        if metric is None:
            logger.warning(
                "[%s] churn: no FileHealthMetric row for %s — skipping update",
                repo_full_name, file_path,
            )
            continue

        metric.commit_count = commit_count
        metric.last_commit_at = last_commit_at
        metric.computed_at = now
        updated += 1

    await db.commit()
    logger.info("[%s] Churn pass complete: %d/%d files updated", repo_full_name, updated, len(file_paths))
