"""add slug, is_public, published_at to projects

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("slug", sa.String(255), nullable=True))
    op.add_column("projects", sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("projects", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    # unique per user, not globally — composite unique index
    op.create_index("ix_projects_user_id_slug", "projects", ["user_id", "slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_projects_user_id_slug", table_name="projects")
    op.drop_column("projects", "published_at")
    op.drop_column("projects", "is_public")
    op.drop_column("projects", "slug")
