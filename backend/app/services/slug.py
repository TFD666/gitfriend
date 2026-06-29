import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


def slugify(name: str) -> str:
    """Convert a string to a URL-safe kebab-case slug."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "project"


async def generate_unique_slug(
    db: AsyncSession,
    user_id: uuid.UUID,
    base_name: str,
    exclude_project_id: uuid.UUID | None = None,
) -> str:
    """
    Return a slug unique within the user's projects.
    Deduplicates with numeric suffix: my-app, my-app-2, my-app-3, ...
    Pass exclude_project_id to skip the project being updated (idempotent re-publish).
    """
    base = slugify(base_name)

    q = select(Project.slug).where(
        Project.user_id == user_id,
        Project.slug.isnot(None),
    )
    if exclude_project_id is not None:
        q = q.where(Project.id != exclude_project_id)

    result = await db.execute(q)
    existing = {row[0] for row in result.fetchall()}

    if base not in existing:
        return base

    counter = 2
    while True:
        candidate = f"{base}-{counter}"
        if candidate not in existing:
            return candidate
        counter += 1
