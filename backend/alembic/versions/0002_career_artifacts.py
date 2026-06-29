"""career_artifacts table

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "career_artifacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("artifact_type", sa.String(32), nullable=False),
        sa.Column("content", JSONB, nullable=False),
        sa.Column("model_version", sa.String(128), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_career_artifacts_project_id", "career_artifacts", ["project_id"])
    op.create_unique_constraint(
        "uq_career_artifact_project_type",
        "career_artifacts",
        ["project_id", "artifact_type"],
    )
    op.execute("""
        ALTER TABLE career_artifacts
        ADD CONSTRAINT career_artifacts_type_check
        CHECK (artifact_type IN ('portfolio', 'resume_bullets', 'interview_prep'))
    """)


def downgrade() -> None:
    op.drop_table("career_artifacts")
