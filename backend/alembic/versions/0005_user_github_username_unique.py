"""add unique index on users.github_username

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-21

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_users_github_username_unique", "users", ["github_username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_github_username_unique", table_name="users")
