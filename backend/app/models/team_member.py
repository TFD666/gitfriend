import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MemberRole(str, enum.Enum):
    editor = "editor"
    viewer = "viewer"


class MemberStatus(str, enum.Enum):
    pending = "pending"
    active = "active"


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_team_member_project_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MemberRole] = mapped_column(Text, nullable=False)
    status: Mapped[MemberStatus] = mapped_column(Text, nullable=False, default=MemberStatus.pending)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
