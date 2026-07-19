import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IndexStatus(str, enum.Enum):
    pending = "pending"
    indexing = "indexing"
    ready = "ready"
    failed = "failed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    github_repo_full_name: Mapped[str] = mapped_column(String(512), nullable=False)
    index_status: Mapped[IndexStatus] = mapped_column(
        Enum(IndexStatus, name="index_status_enum"), nullable=False, default=IndexStatus.pending
    )
    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_health_analysis_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    health_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    mentor_chat_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    career_mode_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    repo_health_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    diagrams_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pr_review_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # User-controlled overrides — NULL means auto-resolved
    icon_override: Mapped[str | None] = mapped_column(String(64), nullable=True)
    color_override: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_diagram_system_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_diagram_dependency_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    diagram_system_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    diagram_dependency_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
