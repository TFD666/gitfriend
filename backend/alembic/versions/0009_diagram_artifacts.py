"""diagram_artifacts table and project diagram columns

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-22

Changes:
  diagram_artifacts (new table):
    - id UUID PK
    - project_id FK -> projects
    - diagram_type TEXT CHECK IN ('system_architecture', 'dependency_graph')
    - mermaid_source TEXT
    - generated_at TIMESTAMPTZ NOT NULL
    - last_requested_at TIMESTAMPTZ nullable
    - UNIQUE (project_id, diagram_type)

  projects (additions):
    - diagrams_shared BOOLEAN NOT NULL DEFAULT false
    - last_diagram_system_at TIMESTAMPTZ nullable
    - last_diagram_dependency_at TIMESTAMPTZ nullable
    - diagram_system_status TEXT nullable
    - diagram_dependency_status TEXT nullable
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # diagram_artifacts table
    # ------------------------------------------------------------------
    op.create_table(
        "diagram_artifacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("diagram_type", sa.Text(), nullable=False),
        sa.Column("mermaid_source", sa.Text(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_diagram_artifacts_project_id", "diagram_artifacts", ["project_id"])
    op.create_unique_constraint(
        "uq_diagram_artifact_project_type",
        "diagram_artifacts",
        ["project_id", "diagram_type"],
    )
    op.create_check_constraint(
        "diagram_artifacts_type_check",
        "diagram_artifacts",
        "diagram_type IN ('system_architecture', 'dependency_graph')",
    )

    # ------------------------------------------------------------------
    # projects — diagram sharing flag + cooldown timestamps + status cols
    # ------------------------------------------------------------------
    op.add_column(
        "projects",
        sa.Column(
            "diagrams_shared",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "projects",
        sa.Column("last_diagram_system_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("last_diagram_dependency_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("diagram_system_status", sa.Text(), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("diagram_dependency_status", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # projects
    op.drop_column("projects", "diagram_dependency_status")
    op.drop_column("projects", "diagram_system_status")
    op.drop_column("projects", "last_diagram_dependency_at")
    op.drop_column("projects", "last_diagram_system_at")
    op.drop_column("projects", "diagrams_shared")

    # diagram_artifacts
    op.drop_table("diagram_artifacts")
