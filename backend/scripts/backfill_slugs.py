"""
Backfill slugs for existing projects that have slug IS NULL.
Sets slug from the repo name part of github_repo_full_name.
Does NOT touch is_public — all backfilled projects stay private.

Run from the backend/ directory:
    python scripts/backfill_slugs.py
"""
import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.project import Project
from app.services.slug import slugify

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


async def backfill() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(
            select(Project).where(Project.slug.is_(None))
        )
        projects = result.scalars().all()

        if not projects:
            logger.info("No projects need backfilling.")
            return

        logger.info("Backfilling %d project(s)...", len(projects))

        # Track slugs assigned in this run, keyed by user_id, to handle
        # collisions across projects in the same batch.
        assigned: dict[str, set[str]] = {}

        for project in projects:
            user_key = str(project.user_id)
            if user_key not in assigned:
                # Fetch slugs already in DB for this user.
                existing_result = await db.execute(
                    select(Project.slug).where(
                        Project.user_id == project.user_id,
                        Project.slug.isnot(None),
                    )
                )
                assigned[user_key] = {row[0] for row in existing_result.fetchall()}

            repo_name = project.github_repo_full_name.split("/")[-1]
            base = slugify(repo_name)

            slug = base
            counter = 2
            while slug in assigned[user_key]:
                slug = f"{base}-{counter}"
                counter += 1

            assigned[user_key].add(slug)
            project.slug = slug
            logger.info("  %s → slug=%r", project.github_repo_full_name, slug)

        await db.commit()
        logger.info("Done. %d project(s) updated.", len(projects))

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill())
