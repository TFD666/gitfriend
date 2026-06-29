"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE index_status_enum AS ENUM ('pending', 'indexing', 'ready', 'failed');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE member_role_enum AS ENUM ('owner', 'member');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("github_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("github_username", sa.String(255), nullable=False),
        sa.Column("github_access_token_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_users_github_id", "users", ["github_id"])

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("github_repo_full_name", sa.String(512), nullable=False),
        sa.Column("index_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("last_indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])

    op.create_table(
        "team_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Text(), nullable=False, server_default="member"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "user_id", name="uq_team_member_project_user"),
    )
    op.create_index("ix_team_members_project_id", "team_members", ["project_id"])
    op.create_index("ix_team_members_user_id", "team_members", ["user_id"])

    op.create_table(
        "chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(768), nullable=True),
        sa.Column("language", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_chunks_project_id", "chunks", ["project_id"])
    op.execute(
        "CREATE INDEX ix_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)"
    )

    op.execute("""
        ALTER TABLE projects
        ADD CONSTRAINT projects_index_status_check
        CHECK (index_status IN ('pending', 'indexing', 'ready', 'failed'))
    """)

    op.execute("""
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_role_check
        CHECK (role IN ('owner', 'member'))
    """)


def downgrade() -> None:
    op.drop_table("chunks")
    op.drop_table("team_members")
    op.drop_table("projects")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS member_role_enum")
    op.execute("DROP TYPE IF EXISTS index_status_enum")
    op.execute("DROP EXTENSION IF EXISTS vector")