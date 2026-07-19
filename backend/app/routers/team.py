"""
Team management endpoints for Phase 9.

Route groups:
  /projects/{id}/team          — roster, invite, remove, sharing settings
  /invites/{team_member_id}    — accept / decline (invitee only)
  /me/invites                  — current user's pending invites inbox

Access rules enforced via the central permission dependency (permissions.py).
Every route that touches a project first goes through require_project_access().
The only exception is /invites/* and /me/invites which gate on the TeamMember
row's user_id directly — those are not project-level gates.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.team_member import MemberRole, MemberStatus, TeamMember
from app.models.user import User
from app.permissions import get_project_access, require_project_access

# Two routers — wired separately in main.py so prefixes stay clean.
projects_router = APIRouter(prefix="/projects", tags=["team"])
invites_router = APIRouter(tags=["team"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class InviteRequest(BaseModel):
    github_username: str
    role: str  # "editor" | "viewer"


class SharingSettingsRequest(BaseModel):
    mentor_chat_shared: bool
    career_mode_shared: bool
    repo_health_shared: bool
    diagrams_shared: bool = False
    pr_review_shared: bool = False


class UserInfo(BaseModel):
    id: uuid.UUID
    github_username: str


class TeamMemberResponse(BaseModel):
    id: uuid.UUID
    user: UserInfo
    role: str
    status: str
    invited_at: datetime
    accepted_at: datetime | None


class TeamRosterResponse(BaseModel):
    owner: UserInfo
    members: list[TeamMemberResponse]


class SharingSettingsResponse(BaseModel):
    mentor_chat_shared: bool
    career_mode_shared: bool
    repo_health_shared: bool
    diagrams_shared: bool
    pr_review_shared: bool


class PendingInviteResponse(BaseModel):
    team_member_id: uuid.UUID
    project_id: uuid.UUID
    github_repo_full_name: str
    role: str
    invited_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_role(role: str) -> MemberRole:
    try:
        return MemberRole(role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role '{role}'. Must be 'editor' or 'viewer'.")


# ---------------------------------------------------------------------------
# /projects/{id}/team  — roster
# ---------------------------------------------------------------------------

@projects_router.get("/{project_id}/team", response_model=TeamRosterResponse)
async def get_team_roster(
    project: Project = Depends(require_project_access("viewer")),
    db: AsyncSession = Depends(get_db),
) -> TeamRosterResponse:
    owner = await db.get(User, project.user_id)
    if owner is None:
        raise HTTPException(status_code=500, detail="Project owner not found")

    result = await db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.project_id == project.id)
        .order_by(TeamMember.invited_at.asc())
    )
    rows = result.all()

    return TeamRosterResponse(
        owner=UserInfo(id=owner.id, github_username=owner.github_username),
        members=[
            TeamMemberResponse(
                id=m.id,
                user=UserInfo(id=u.id, github_username=u.github_username),
                role=m.role,
                status=m.status,
                invited_at=m.invited_at,
                accepted_at=m.accepted_at,
            )
            for m, u in rows
        ],
    )


# ---------------------------------------------------------------------------
# /projects/{id}/team/invite  — owner invites by GitHub username
# ---------------------------------------------------------------------------

@projects_router.post("/{project_id}/team/invite", status_code=201, response_model=TeamMemberResponse)
async def invite_team_member(
    body: InviteRequest,
    project: Project = Depends(require_project_access("owner")),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberResponse:
    role = _validate_role(body.role)

    # Look up invitee by github_username — no shadow users, ever.
    result = await db.execute(
        select(User).where(User.github_username == body.github_username)
    )
    invitee = result.scalars().first()
    if invitee is None:
        raise HTTPException(
            status_code=400,
            detail=f"No account found for GitHub username '{body.github_username}'. "
                   "They must sign in to DevKit AI at least once before they can be invited.",
        )

    # Can't invite the owner.
    if invitee.id == project.user_id:
        raise HTTPException(status_code=400, detail="User is already the project owner.")

    # Duplicate check — pending OR active row already exists.
    existing = await db.execute(
        select(TeamMember).where(
            TeamMember.project_id == project.id,
            TeamMember.user_id == invitee.id,
        )
    )
    if existing.scalars().first() is not None:
        raise HTTPException(status_code=409, detail="User is already a team member or has a pending invite.")

    member = TeamMember(
        project_id=project.id,
        user_id=invitee.id,
        role=role,
        status=MemberStatus.pending,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return TeamMemberResponse(
        id=member.id,
        user=UserInfo(id=invitee.id, github_username=invitee.github_username),
        role=member.role,
        status=member.status,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )


# ---------------------------------------------------------------------------
# /projects/{id}/team/{team_member_id}  — remove member
# ---------------------------------------------------------------------------

@projects_router.delete("/{project_id}/team/{team_member_id}", status_code=204)
async def remove_team_member(
    project_id: uuid.UUID,
    team_member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Use get_project_access directly so we can accept viewer role —
    # any member (even viewer) can remove themselves.
    project = await get_project_access(project_id, current_user, db, required_role="viewer")

    result = await db.execute(
        select(TeamMember).where(
            TeamMember.id == team_member_id,
            TeamMember.project_id == project_id,
        )
    )
    member = result.scalars().first()
    if member is None:
        raise HTTPException(status_code=404, detail="Team member not found")

    is_owner = project.user_id == current_user.id
    is_self = member.user_id == current_user.id

    if not is_owner and not is_self:
        raise HTTPException(status_code=404, detail="Team member not found")

    await db.delete(member)
    await db.commit()


# ---------------------------------------------------------------------------
# /projects/{id}/team/{team_member_id}  — update member role
# ---------------------------------------------------------------------------

class UpdateMemberRoleRequest(BaseModel):
    role: str


@projects_router.patch("/{project_id}/team/{team_member_id}", response_model=TeamMemberResponse)
async def update_team_member_role(
    project_id: uuid.UUID,
    team_member_id: uuid.UUID,
    body: UpdateMemberRoleRequest,
    project: Project = Depends(require_project_access("owner")),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberResponse:
    role = _validate_role(body.role)

    result = await db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(
            TeamMember.id == team_member_id,
            TeamMember.project_id == project_id,
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Team member not found")

    member, user = row
    member.role = role
    await db.commit()
    await db.refresh(member)

    return TeamMemberResponse(
        id=member.id,
        user=UserInfo(id=user.id, github_username=user.github_username),
        role=member.role,
        status=member.status,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )


# ---------------------------------------------------------------------------
# /projects/{id}/settings/sharing  — owner toggles sharing flags
# ---------------------------------------------------------------------------

@projects_router.patch("/{project_id}/settings/sharing", response_model=SharingSettingsResponse)
async def update_sharing_settings(
    body: SharingSettingsRequest,
    project: Project = Depends(require_project_access("owner")),
    db: AsyncSession = Depends(get_db),
) -> SharingSettingsResponse:
    project.mentor_chat_shared = body.mentor_chat_shared
    project.career_mode_shared = body.career_mode_shared
    project.repo_health_shared = body.repo_health_shared
    project.diagrams_shared = body.diagrams_shared
    project.pr_review_shared = body.pr_review_shared
    await db.commit()

    return SharingSettingsResponse(
        mentor_chat_shared=project.mentor_chat_shared,
        career_mode_shared=project.career_mode_shared,
        repo_health_shared=project.repo_health_shared,
        diagrams_shared=project.diagrams_shared,
        pr_review_shared=project.pr_review_shared,
    )


# ---------------------------------------------------------------------------
# /invites/{team_member_id}/accept  — invitee accepts
# ---------------------------------------------------------------------------

@invites_router.post("/invites/{team_member_id}/accept", response_model=TeamMemberResponse)
async def accept_invite(
    team_member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TeamMemberResponse:
    result = await db.execute(
        select(TeamMember).where(TeamMember.id == team_member_id)
    )
    member = result.scalars().first()

    if member is None or member.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invite not found")

    if member.status != MemberStatus.pending:
        raise HTTPException(status_code=400, detail="Invite is not pending")

    member.status = MemberStatus.active
    member.accepted_at = datetime.now(timezone.utc)
    await db.commit()

    return TeamMemberResponse(
        id=member.id,
        user=UserInfo(id=current_user.id, github_username=current_user.github_username),
        role=member.role,
        status=member.status,
        invited_at=member.invited_at,
        accepted_at=member.accepted_at,
    )


# ---------------------------------------------------------------------------
# /invites/{team_member_id}/decline  — invitee declines (row deleted)
# ---------------------------------------------------------------------------

@invites_router.post("/invites/{team_member_id}/decline", status_code=204)
async def decline_invite(
    team_member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(TeamMember).where(TeamMember.id == team_member_id)
    )
    member = result.scalars().first()

    if member is None or member.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Invite not found")

    if member.status != MemberStatus.pending:
        raise HTTPException(status_code=400, detail="Invite is not pending")

    await db.delete(member)
    await db.commit()


# ---------------------------------------------------------------------------
# /me/invites  — pending invites inbox for current user
# ---------------------------------------------------------------------------

@invites_router.get("/me/invites", response_model=list[PendingInviteResponse])
async def list_my_invites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PendingInviteResponse]:
    result = await db.execute(
        select(TeamMember, Project)
        .join(Project, Project.id == TeamMember.project_id)
        .where(
            TeamMember.user_id == current_user.id,
            TeamMember.status == MemberStatus.pending,
        )
        .order_by(TeamMember.invited_at.desc())
    )
    rows = result.all()

    return [
        PendingInviteResponse(
            team_member_id=m.id,
            project_id=p.id,
            github_repo_full_name=p.github_repo_full_name,
            role=m.role,
            invited_at=m.invited_at,
        )
        for m, p in rows
    ]
