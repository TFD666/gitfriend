"""
Set required env vars BEFORE any app module is imported.
pydantic-settings reads from the environment at Settings() instantiation time (module
import), so these must be in place before the first `from app...` in any test file.
"""
import os

# Minimal required fields (no defaults in Settings)
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/testdb")
os.environ.setdefault("GITHUB_CLIENT_ID", "test_client_id")
os.environ.setdefault("GITHUB_CLIENT_SECRET", "test_client_secret")
os.environ.setdefault("GEMINI_API_KEY", "test_gemini_key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only")
# Valid Fernet key: URL-safe base64 of 32 zero bytes (44 chars)
os.environ.setdefault("ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
