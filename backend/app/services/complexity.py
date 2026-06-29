import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.models.file_health_metric import FileHealthMetric

logger = logging.getLogger(__name__)

# Language-agnostic control-flow token count — explicit heuristic proxy,
# NOT cyclomatic complexity. Word boundaries on keywords; raw match on operators.
_COMPLEXITY_RE = re.compile(
    r"\b(if|for|while|case|catch|elif|except|switch)\b|&&|\|\||\?:"
)


async def run_complexity(
    project_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, tuple[int, int]]:
    """
    Compute loc and complexity_score for every file in the project's chunk set.

    - loc: max(end_line) across all chunks for the file — best proxy for total
      line count without double-counting overlapping sliding-window chunks.
    - complexity_score: count of control-flow token matches across all chunk
      content for the file (heuristic proxy, not cyclomatic complexity).

    Upserts into FileHealthMetric, preserving any existing churn columns
    (commit_count, last_commit_at, hotspot_score) so the complexity pass
    can run independently of the churn pass.

    Deletes FileHealthMetric rows for file paths that no longer appear in
    the chunk set (files removed from the repo since last index).

    Returns {file_path: (loc, complexity_score)} for the caller to use when
    selecting the top-N files for churn analysis.
    """
    result = await db.execute(
        select(Chunk.file_path, Chunk.end_line, Chunk.content)
        .where(Chunk.project_id == project_id)
    )
    rows = result.fetchall()

    # Aggregate per file in Python — one pass.
    files: dict[str, dict[str, int]] = {}
    for file_path, end_line, content in rows:
        if file_path not in files:
            files[file_path] = {"loc": 0, "complexity": 0}
        if end_line > files[file_path]["loc"]:
            files[file_path]["loc"] = end_line
        files[file_path]["complexity"] += len(_COMPLEXITY_RE.findall(content))

    logger.info(
        "[%s] Complexity pass: %d files from chunk set", project_id, len(files)
    )

    # Delete stale rows — files no longer in the current chunk set.
    if files:
        await db.execute(
            delete(FileHealthMetric).where(
                FileHealthMetric.project_id == project_id,
                FileHealthMetric.file_path.not_in(list(files.keys())),
            )
        )
    else:
        # All files gone (e.g. empty re-index) — wipe everything.
        await db.execute(
            delete(FileHealthMetric).where(FileHealthMetric.project_id == project_id)
        )
        await db.commit()
        return {}

    # Upsert current files, preserving churn columns.
    now = datetime.now(timezone.utc)
    for file_path, stats in files.items():
        stmt = (
            pg_insert(FileHealthMetric)
            .values(
                id=uuid.uuid4(),
                project_id=project_id,
                file_path=file_path,
                loc=stats["loc"],
                complexity_score=stats["complexity"],
                computed_at=now,
            )
            .on_conflict_do_update(
                constraint="uq_file_health_project_path",
                set_={
                    "loc": stats["loc"],
                    "complexity_score": stats["complexity"],
                    "computed_at": now,
                    # commit_count / last_commit_at / hotspot_score intentionally
                    # not touched here — churn service owns those columns.
                },
            )
        )
        await db.execute(stmt)

    await db.commit()

    logger.info(
        "[%s] Complexity pass complete: %d files upserted", project_id, len(files)
    )
    return {fp: (s["loc"], s["complexity"]) for fp, s in files.items()}
