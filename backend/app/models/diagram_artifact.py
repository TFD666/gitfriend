import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DiagramArtifact(Base):
    __tablename__ = "diagram_artifacts"
    __table_args__ = (
        UniqueConstraint("project_id", "diagram_type", name="uq_diagram_artifact_project_type"),
        CheckConstraint(
            "diagram_type IN ('system_architecture', 'dependency_graph')",
            name="diagram_artifacts_type_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    diagram_type: Mapped[str] = mapped_column(Text, nullable=False)
    mermaid_source: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
