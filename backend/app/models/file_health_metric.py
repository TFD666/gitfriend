import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileHealthMetric(Base):
    __tablename__ = "file_health_metrics"
    __table_args__ = (
        UniqueConstraint("project_id", "file_path", name="uq_file_health_project_path"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    loc: Mapped[int] = mapped_column(Integer, nullable=False)
    # Heuristic proxy for complexity — not cyclomatic complexity
    complexity_score: Mapped[int] = mapped_column(Integer, nullable=False)
    commit_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hotspot_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
