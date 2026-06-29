"""pr_review tables and pr_review_shared on projects

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-24

Changes:
  pr_reviews (new table):
    - id UUID PK
    - project_id FK -> projects CASCADE
    - pr_number INT NOT NULL
    - run_number INT NOT NULL
    - pr_title TEXT nullable
    - pr_author TEXT nullable
    - verdict TEXT CHECK IN ('approve','request_changes','comment')
    - summary TEXT NOT NULL
    - reviewed_at TIMESTAMPTZ NOT NULL
    - UNIQUE (project_id, pr_number, run_number)
    - INDEX (project_id, pr_number)

  pr_review_comments (new table):
    - id UUID PK
    - review_id FK -> pr_reviews CASCADE
    - file_path TEXT NOT NULL
    - line_number INT nullable
    - comment_type TEXT CHECK IN ('issue','suggestion','praise','nitpick')
    - body TEXT NOT NULL
    - github_posted BOOLEAN NOT NULL DEFAULT false
    - INDEX (review_id)

  projects (addition):
    - pr_review_shared BOOLEAN NOT NULL DEFAULT false
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # pr_reviews table
    # ------------------------------------------------------------------
    op.create_table(
        "pr_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pr_number", sa.Integer(), nullable=False),
        sa.Column("run_number", sa.Integer(), nullable=False),
        sa.Column("pr_title", sa.Text(), nullable=True),
        sa.Column("pr_author", sa.Text(), nullable=True),
        sa.Column("verdict", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pr_reviews_project_id", "pr_reviews", ["project_id"])
    op.create_index("ix_pr_reviews_project_pr", "pr_reviews", ["project_id", "pr_number"])
    op.create_unique_constraint(
        "uq_pr_review_run",
        "pr_reviews",
        ["project_id", "pr_number", "run_number"],
    )
    op.create_check_constraint(
        "pr_reviews_verdict_check",
        "pr_reviews",
        "verdict IN ('approve', 'request_changes', 'comment')",
    )

    # ------------------------------------------------------------------
    # pr_review_comments table
    # ------------------------------------------------------------------
    op.create_table(
        "pr_review_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "review_id",
            UUID(as_uuid=True),
            sa.ForeignKey("pr_reviews.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=True),
        sa.Column("comment_type", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("github_posted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_pr_review_comments_review_id", "pr_review_comments", ["review_id"])
    op.create_check_constraint(
        "pr_review_comments_type_check",
        "pr_review_comments",
        "comment_type IN ('issue', 'suggestion', 'praise', 'nitpick')",
    )

    # ------------------------------------------------------------------
    # projects — PR review sharing flag
    # ------------------------------------------------------------------
    op.add_column(
        "projects",
        sa.Column(
            "pr_review_shared",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "pr_review_shared")
    op.drop_table("pr_review_comments")
    op.drop_table("pr_reviews")
