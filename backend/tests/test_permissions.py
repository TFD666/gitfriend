"""
Unit tests for the central project-access permission dependency.

No real DB, no network — all DB calls are mocked via AsyncMock/MagicMock.
Covers every branch in get_project_access() in isolation.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.project import Project
from app.models.team_member import MemberRole, MemberStatus, TeamMember
from app.models.user import User
from app.permissions import get_project_access


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(user_id: uuid.UUID | None = None) -> User:
    u = MagicMock(spec=User)
    u.id = user_id or uuid.uuid4()
    return u


def _make_project(
    owner_id: uuid.UUID,
    *,
    mentor_chat_shared: bool = False,
    career_mode_shared: bool = False,
    repo_health_shared: bool = False,
) -> Project:
    p = MagicMock(spec=Project)
    p.id = uuid.uuid4()
    p.user_id = owner_id
    p.mentor_chat_shared = mentor_chat_shared
    p.career_mode_shared = career_mode_shared
    p.repo_health_shared = repo_health_shared
    return p


def _make_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role: MemberRole,
    status: MemberStatus = MemberStatus.active,
) -> TeamMember:
    m = MagicMock(spec=TeamMember)
    m.project_id = project_id
    m.user_id = user_id
    m.role = role
    m.status = status
    return m


def _db_with_project(project: Project | None, member: TeamMember | None = None) -> AsyncMock:
    """Build a mock AsyncSession that returns the given project and/or member."""
    db = AsyncMock()
    db.get = AsyncMock(return_value=project)

    # Mock db.execute(...).scalars().first() → member
    scalars_mock = MagicMock()
    scalars_mock.first.return_value = member
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars_mock
    db.execute = AsyncMock(return_value=execute_result)

    return db


# ---------------------------------------------------------------------------
# 1. Project not found
# ---------------------------------------------------------------------------

async def test_project_not_found_raises_404():
    db = _db_with_project(project=None)
    user = _make_user()
    with pytest.raises(HTTPException) as exc:
        await get_project_access(uuid.uuid4(), user, db)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 2. Owner — short-circuits all checks
# ---------------------------------------------------------------------------

async def test_owner_gets_access_no_member_row_needed():
    owner = _make_user()
    project = _make_project(owner.id)
    # No member row at all — should still pass because user is owner.
    db = _db_with_project(project, member=None)
    result = await get_project_access(project.id, owner, db)
    assert result is project


async def test_owner_bypasses_sharing_flag_off():
    owner = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=False)
    db = _db_with_project(project, member=None)
    result = await get_project_access(project.id, owner, db, feature="mentor_chat")
    assert result is project


async def test_owner_bypasses_editor_role_requirement():
    owner = _make_user()
    project = _make_project(owner.id)
    db = _db_with_project(project, member=None)
    result = await get_project_access(project.id, owner, db, required_role="editor")
    assert result is project


# ---------------------------------------------------------------------------
# 3. Non-owner with no TeamMember row → 404
# ---------------------------------------------------------------------------

async def test_non_owner_no_member_row_raises_404():
    owner = _make_user()
    stranger = _make_user()
    project = _make_project(owner.id)
    db = _db_with_project(project, member=None)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, stranger, db)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 4. Pending TeamMember (not yet accepted) → 404
# ---------------------------------------------------------------------------

async def test_pending_member_raises_404():
    owner = _make_user()
    invitee = _make_user()
    project = _make_project(owner.id)
    # DB query filters on status='active', so a pending row looks like "no row"
    # to the query — simulate by returning None (the WHERE clause excludes pending).
    db = _db_with_project(project, member=None)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, invitee, db)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 5. Active member + feature flag off → 404 (AND semantics)
# ---------------------------------------------------------------------------

async def test_active_viewer_feature_flag_off_raises_404():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=False)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, viewer_user, db, feature="mentor_chat")
    assert exc.value.status_code == 404


async def test_active_editor_feature_flag_off_raises_404():
    owner = _make_user()
    editor_user = _make_user()
    project = _make_project(owner.id, career_mode_shared=False)
    member = _make_member(project.id, editor_user.id, MemberRole.editor)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, editor_user, db, feature="career_mode")
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 6. Active viewer + flag on + required_role=viewer → granted
# ---------------------------------------------------------------------------

async def test_active_viewer_flag_on_viewer_required_granted():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=True)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    result = await get_project_access(
        project.id, viewer_user, db, required_role="viewer", feature="mentor_chat"
    )
    assert result is project


# ---------------------------------------------------------------------------
# 7. Active viewer + required_role=editor → 404
# ---------------------------------------------------------------------------

async def test_active_viewer_editor_required_raises_404():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=True)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(
            project.id, viewer_user, db, required_role="editor", feature="mentor_chat"
        )
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 8. Active editor + required_role=editor + flag on → granted
# ---------------------------------------------------------------------------

async def test_active_editor_editor_required_flag_on_granted():
    owner = _make_user()
    editor_user = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=True)
    member = _make_member(project.id, editor_user.id, MemberRole.editor)
    db = _db_with_project(project, member)
    result = await get_project_access(
        project.id, editor_user, db, required_role="editor", feature="mentor_chat"
    )
    assert result is project


# ---------------------------------------------------------------------------
# 9. Active editor satisfies viewer requirement (editor >= viewer)
# ---------------------------------------------------------------------------

async def test_active_editor_satisfies_viewer_requirement():
    owner = _make_user()
    editor_user = _make_user()
    project = _make_project(owner.id, repo_health_shared=True)
    member = _make_member(project.id, editor_user.id, MemberRole.editor)
    db = _db_with_project(project, member)
    result = await get_project_access(
        project.id, editor_user, db, required_role="viewer", feature="repo_health"
    )
    assert result is project


# ---------------------------------------------------------------------------
# 10. No feature → role check only, no flag check
# ---------------------------------------------------------------------------

async def test_no_feature_skips_sharing_flag_check():
    owner = _make_user()
    viewer_user = _make_user()
    # All sharing flags are off — irrelevant when feature=None.
    project = _make_project(
        owner.id,
        mentor_chat_shared=False,
        career_mode_shared=False,
        repo_health_shared=False,
    )
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    result = await get_project_access(project.id, viewer_user, db, required_role="viewer")
    assert result is project


async def test_no_feature_editor_required_viewer_has_raises_404():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, viewer_user, db, required_role="editor")
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 11. All three feature flags — verify correct column is checked
# ---------------------------------------------------------------------------

async def test_mentor_chat_flag_checked_independently():
    owner = _make_user()
    viewer_user = _make_user()
    # mentor_chat off, others on — only mentor_chat check matters here.
    project = _make_project(
        owner.id,
        mentor_chat_shared=False,
        career_mode_shared=True,
        repo_health_shared=True,
    )
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException):
        await get_project_access(project.id, viewer_user, db, feature="mentor_chat")


async def test_career_mode_flag_checked_independently():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(
        owner.id,
        mentor_chat_shared=True,
        career_mode_shared=False,
        repo_health_shared=True,
    )
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException):
        await get_project_access(project.id, viewer_user, db, feature="career_mode")


async def test_repo_health_flag_checked_independently():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(
        owner.id,
        mentor_chat_shared=True,
        career_mode_shared=True,
        repo_health_shared=False,
    )
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException):
        await get_project_access(project.id, viewer_user, db, feature="repo_health")


# ---------------------------------------------------------------------------
# 12. required_role="owner" — non-owner always denied, owner always passes
# ---------------------------------------------------------------------------

async def test_owner_required_owner_granted():
    owner = _make_user()
    project = _make_project(owner.id)
    db = _db_with_project(project)
    result = await get_project_access(project.id, owner, db, required_role="owner")
    assert result is project


async def test_owner_required_active_editor_raises_404():
    owner = _make_user()
    editor_user = _make_user()
    project = _make_project(owner.id)
    member = _make_member(project.id, editor_user.id, MemberRole.editor)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, editor_user, db, required_role="owner")
    assert exc.value.status_code == 404


async def test_owner_required_active_viewer_raises_404():
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, viewer_user, db, required_role="owner")
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 14. Unknown feature string → ValueError (programmer error, not 404)
# ---------------------------------------------------------------------------

async def test_unknown_feature_raises_value_error():
    owner = _make_user()
    user = _make_user()
    project = _make_project(owner.id)
    db = _db_with_project(project)
    with pytest.raises(ValueError, match="Unknown feature"):
        await get_project_access(project.id, user, db, feature="nonexistent")


# ---------------------------------------------------------------------------
# 15. 404 detail is always "Project not found" — never leaks reason
# ---------------------------------------------------------------------------

async def test_all_denials_return_project_not_found_detail():
    """No denial path should reveal the actual reason (member vs flag vs role)."""
    owner = _make_user()
    viewer_user = _make_user()
    project = _make_project(owner.id, mentor_chat_shared=True)
    member = _make_member(project.id, viewer_user.id, MemberRole.viewer)
    db = _db_with_project(project, member)

    # role insufficient
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, viewer_user, db, required_role="editor")
    assert exc.value.detail == "Project not found"

    # no member row
    db2 = _db_with_project(project, member=None)
    stranger = _make_user()
    with pytest.raises(HTTPException) as exc:
        await get_project_access(project.id, stranger, db2)
    assert exc.value.detail == "Project not found"
