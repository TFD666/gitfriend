import uuid
from datetime import datetime

from cryptography.fernet import Fernet
from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id: Mapped[int] = mapped_column(unique=True, nullable=False, index=True)
    github_username: Mapped[str] = mapped_column(String(255), nullable=False)
    github_access_token_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def set_github_token(self, token: str, encryption_key: str) -> None:
        f = Fernet(encryption_key.encode())
        self.github_access_token_encrypted = f.encrypt(token.encode())

    def get_github_token(self, encryption_key: str) -> str | None:
        if not self.github_access_token_encrypted:
            return None
        f = Fernet(encryption_key.encode())
        return f.decrypt(self.github_access_token_encrypted).decode()
