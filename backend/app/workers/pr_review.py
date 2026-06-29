import logging
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.pr_review import PRReview, PRReviewComment
from app.models.project import Project
from app.models.user import User
from app.services.github import get_pull_request_diff, get_pull_request_info
from app.services.pr_context import build_review_context
from app.services.pr_review import PRReviewGenerationError, generate_review

logger = logging.getLogger(__name__)


async def run_pr_review(ctx: dict, project_id: str, pr_number: int) -> None:
    """ARQ task: fetch PR diff, RAG-augment, generate review, persist.

    No status column on Project for this feature — callers poll
    GET /projects/{id}/pr-reviews/{pr_number} until a new run appears.
    """
    pid = uuid.UUID(project_id)
    db = AsyncSessionLocal()

    try:
        project = await db.get(Project, pid)
        if project is None:
            logger.error("run_pr_review: project %s not found", project_id)
            return

        user = await db.get(User, project.user_id)
        if user is None:
            logger.error("run_pr_review: owner not found for project %s", project_id)
            return

        token = user.get_github_token(settings.encryption_key)
        if not token:
            logger.error("run_pr_review: no GitHub token for user %s", user.id)
            return

        repo = project.github_repo_full_name
        logger.info("PR review started — project=%s repo=%s pr=%d", project_id, repo, pr_number)

        # Fetch PR metadata + diff in parallel-ish (sequential is fine; diff is larger)
        pr_info = await get_pull_request_info(token, repo, pr_number)
        diff = await get_pull_request_diff(token, repo, pr_number)

        # Build RAG context (embed each hunk, vector search, deduplicate)
        context_str = await build_review_context(pid, diff, db)

        # Generate structured review via Gemini (with retry on validation failure)
        review_data = await generate_review(context_str)

        # Compute run_number: MAX existing + 1, or 1 for first run on this PR.
        max_run_result = await db.execute(
            select(func.max(PRReview.run_number)).where(
                PRReview.project_id == pid,
                PRReview.pr_number == pr_number,
            )
        )
        run_number = (max_run_result.scalar() or 0) + 1

        # Insert PRReview row.
        now = datetime.now(timezone.utc)
        review = PRReview(
            id=uuid.uuid4(),
            project_id=pid,
            pr_number=pr_number,
            run_number=run_number,
            pr_title=pr_info.get("title"),
            pr_author=pr_info.get("author"),
            verdict=review_data["verdict"],
            summary=review_data["summary"],
            reviewed_at=now,
        )
        db.add(review)
        await db.flush()  # get review.id before inserting comments

        # Insert PRReviewComment rows.
        for comment in review_data.get("comments", []):
            db.add(PRReviewComment(
                id=uuid.uuid4(),
                review_id=review.id,
                file_path=comment["file_path"],
                line_number=comment.get("line_number"),
                comment_type=comment["comment_type"],
                body=comment["body"],
                github_posted=False,
            ))

        await db.flush()

        # Enforce max runs: delete oldest if count exceeds limit.
        count_result = await db.execute(
            select(func.count(PRReview.id)).where(
                PRReview.project_id == pid,
                PRReview.pr_number == pr_number,
            )
        )
        run_count = count_result.scalar() or 0

        if run_count > settings.pr_review_max_runs:
            excess = run_count - settings.pr_review_max_runs
            oldest_result = await db.execute(
                select(PRReview.id)
                .where(PRReview.project_id == pid, PRReview.pr_number == pr_number)
                .order_by(PRReview.run_number.asc())
                .limit(excess)
            )
            old_ids = [row[0] for row in oldest_result.fetchall()]
            await db.execute(delete(PRReview).where(PRReview.id.in_(old_ids)))
            logger.info(
                "Pruned %d oldest run(s) for project=%s pr=%d (max_runs=%d)",
                excess, project_id, pr_number, settings.pr_review_max_runs,
            )

        await db.commit()
        logger.info(
            "PR review complete — project=%s pr=%d run=%d verdict=%s comments=%d",
            project_id, pr_number, run_number,
            review_data["verdict"], len(review_data.get("comments", [])),
        )

    except PRReviewGenerationError as exc:
        logger.error(
            "PR review generation failed — project=%s pr=%d: %s",
            project_id, pr_number, exc,
        )

    except Exception:
        logger.error(
            "PR review error — project=%s pr=%d\n%s",
            project_id, pr_number, traceback.format_exc(),
        )

    finally:
        await db.close()
