"""project icon and color override fields

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-19

Changes:
  projects (addition):
    - icon_override  VARCHAR(64) nullable — user-selected icon key
    - color_override VARCHAR(64) nullable — user-selected color key

  Both columns default to NULL (auto-resolution active when NULL).
  Independent partial override is supported: setting only one column
  causes the other to remain auto-resolved.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("icon_override", sa.String(64), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column("color_override", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "color_override")
    op.drop_column("projects", "icon_override")
