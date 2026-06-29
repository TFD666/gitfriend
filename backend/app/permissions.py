"""
Central project-access permission dependency.

Every route that gates on project ownership or team membership MUST use
require_project_access() — no route may implement its own inline check.

Access logic (in order):
  1. Project not found → 404.
  2. project.user_id == current_user.id (Owner) → full access, short-circuit.
  3. No active TeamMember row for (project_id, current_user.id) → 404.
  4. feature given → check the corresponding *_shared flag on Project; False → 404.
  5. required_role == "editor" and member.role != "editor" → 404.
  6. Otherwise → return Project.

Both the feature flag AND the role must independently pass (AND semantics).
"""
import uuid
from typing import Callable

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.team_member import MemberRole, MemberStatus, TeamMember
from app.models.user import User

# Maps feature string → Project column name.
_FEATURE_FLAG: dict[str, str] = {
    "mentor_chat": "mentor_chat_shared",
    "career_mode": "career_mode_shared",
    "repo_health": "repo_health_shared",
    "diagrams":    "diagrams_shared",
    "pr_review":   "pr_review_shared",
}


async def get_project_access(
    project_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    *,
    required_role: str = "viewer",
    feature: str | None = None,
) -> Project:
    """
    Core permission check — call directly in tests or via require_project_access().

    Args:
        project_id:    Project PK being accessed.
        current_user:  Authenticated user making the request.
        db:            Async DB session.
        required_role: Minimum role needed: "viewer" (editor satisfies it too)
                       or "editor" (viewer does NOT satisfy it).
        feature:       One of "mentor_chat", "career_mode", "repo_health", or None.
                       When given, the corresponding *_shared flag on Project must
                       be True for non-owners to proceed.

    Returns:
        The Project ORM object on success.

    Raises:
        HTTPException 404 for any access denial (missing, not a member,
        sharing flag off, role insufficient) — never 403, per spec.
    """
    if feature is not None and feature not in _FEATURE_FLAG:
        raise ValueError(f"Unknown feature: {feature!r}. Valid: {list(_FEATURE_FLAG)}")

    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Owner bypasses role and sharing-flag checks entirely.
    if project.user_id == current_user.id:
        return project

    # Owner-only route — non-owners never satisfy this requirement.
    if required_role == "owner":
        raise HTTPException(status_code=404, detail="Project not found")

    # Non-owner: must have an active TeamMember row.
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.project_id == project_id,
            TeamMember.user_id == current_user.id,
            TeamMember.status == MemberStatus.active,
        )
    )
    member = result.scalars().first()
    if member is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Feature sharing flag — AND with role; either alone is not enough.
    if feature is not None:
        flag_col = _FEATURE_FLAG[feature]
        if not getattr(project, flag_col):
            raise HTTPException(status_code=404, detail="Project not found")

    # Role check: editor satisfies both; viewer only satisfies viewer.
    if required_role == "editor" and member.role != MemberRole.editor:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


def require_project_access(
    required_role: str = "viewer",
    feature: str | None = None,
) -> Callable:
    """
    FastAPI dependency factory.

    Usage:
        @router.get("/{project_id}/something")
        async def handler(
            project: Project = Depends(require_project_access("viewer", "mentor_chat")),
            db: AsyncSession = Depends(get_db),
        ): ...

    The returned dependency extracts project_id from the path, resolves
    current_user and db via their own dependencies, and calls get_project_access().
    """
    async def _dependency(
        project_id: uuid.UUID,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Project:
        return await get_project_access(
            project_id, current_user, db,
            required_role=required_role,
            feature=feature,
        )

    return _dependency
