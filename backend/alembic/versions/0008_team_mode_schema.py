"""team mode schema — reconcile TeamMember, add Project sharing flags

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-22

Changes:
  team_members:
    - rename created_at -> invited_at
    - drop role CHECK constraint (owner/member) -> (editor/viewer)
    - add status TEXT NOT NULL DEFAULT 'pending' CHECK IN ('pending','active')
    - add accepted_at TIMESTAMPTZ nullable

  projects:
    - add mentor_chat_shared BOOLEAN NOT NULL DEFAULT false
    - add career_mode_shared BOOLEAN NOT NULL DEFAULT false
    - add repo_health_shared BOOLEAN NOT NULL DEFAULT false
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # team_members
    # ------------------------------------------------------------------

    # 1. Rename created_at -> invited_at
    op.alter_column("team_members", "created_at", new_column_name="invited_at")

    # 2. Drop the old role CHECK constraint (owner/member).
    #    The constraint was created inline in 0001 — Postgres names it
    #    "team_members_role_check" (the name used in the 0001 migration).
    op.drop_constraint("team_members_role_check", "team_members", type_="check")

    # 3. Any stale rows with role='owner' or role='member' (table has never
    #    had an active endpoint so should be empty, but guard against it).
    op.execute("DELETE FROM team_members WHERE role NOT IN ('editor', 'viewer')")

    # 4. Add new role CHECK constraint.
    op.create_check_constraint(
        "team_members_role_check",
        "team_members",
        "role IN ('editor', 'viewer')",
    )

    # 5. Add status column — NOT NULL with server default so existing rows
    #    (if any survived the delete above) get a safe value.
    op.add_column(
        "team_members",
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="pending",
        ),
    )
    op.create_check_constraint(
        "team_members_status_check",
        "team_members",
        "status IN ('pending', 'active')",
    )

    # 6. Add accepted_at — nullable, no default.
    op.add_column(
        "team_members",
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ------------------------------------------------------------------
    # projects — three sharing-flag booleans, all default false
    # ------------------------------------------------------------------
    op.add_column(
        "projects",
        sa.Column(
            "mentor_chat_shared",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "career_mode_shared",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "repo_health_shared",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    # projects — remove sharing flags
    op.drop_column("projects", "repo_health_shared")
    op.drop_column("projects", "career_mode_shared")
    op.drop_column("projects", "mentor_chat_shared")

    # team_members — reverse in opposite order
    op.drop_column("team_members", "accepted_at")
    op.drop_constraint("team_members_status_check", "team_members", type_="check")
    op.drop_column("team_members", "status")
    op.drop_constraint("team_members_role_check", "team_members", type_="check")
    op.create_check_constraint(
        "team_members_role_check",
        "team_members",
        "role IN ('owner', 'member')",
    )
    op.alter_column("team_members", "invited_at", new_column_name="created_at")
