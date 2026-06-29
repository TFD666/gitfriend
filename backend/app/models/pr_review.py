import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PRReview(Base):
    __tablename__ = "pr_reviews"
    __table_args__ = (
        UniqueConstraint("project_id", "pr_number", "run_number", name="uq_pr_review_run"),
        CheckConstraint(
            "verdict IN ('approve', 'request_changes', 'comment')",
            name="pr_reviews_verdict_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pr_number: Mapped[int] = mapped_column(Integer, nullable=False)
    run_number: Mapped[int] = mapped_column(Integer, nullable=False)
    pr_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    verdict: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PRReviewComment(Base):
    __tablename__ = "pr_review_comments"
    __table_args__ = (
        CheckConstraint(
            "comment_type IN ('issue', 'suggestion', 'praise', 'nitpick')",
            name="pr_review_comments_type_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pr_reviews.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    # line_number from Gemini is stored as-is — LLM line numbers may not
    # correspond to actual diff positions; do not validate against the diff.
    line_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment_type: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    github_posted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
