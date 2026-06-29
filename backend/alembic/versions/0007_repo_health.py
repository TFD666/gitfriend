"""add FileHealthMetric table and health columns to Project

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("last_health_analysis_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("projects", sa.Column("health_status", sa.String(16), nullable=True))

    op.create_table(
        "file_health_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("loc", sa.Integer(), nullable=False),
        sa.Column("complexity_score", sa.Integer(), nullable=False),
        sa.Column("commit_count", sa.Integer(), nullable=True),
        sa.Column("last_commit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hotspot_score", sa.Float(), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "file_path", name="uq_file_health_project_path"),
    )
    op.create_index("ix_file_health_metrics_project_id", "file_health_metrics", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_file_health_metrics_project_id", table_name="file_health_metrics")
    op.drop_table("file_health_metrics")
    op.drop_column("projects", "health_status")
    op.drop_column("projects", "last_health_analysis_at")
