from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    redis_url: str = "redis://localhost:6379"

    github_client_id: str
    github_client_secret: str
    github_app_private_key: str = ""

    gemini_api_key: str
    # Override via env if Google deprecates these again — no code change needed
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_generation_model: str = "gemini-2.5-flash"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # base64-encoded Fernet key for encrypting GitHub tokens at rest
    encryption_key: str

    frontend_url: str = "http://localhost:5173"
    environment: str = "development"

    repo_health_max_files: int = 50
    repo_health_cooldown_minutes: int = 10
    repo_health_stale_days: int = 90

    diagram_cooldown_minutes: int = 10
    diagram_max_chunks: int = 80    # cap for system_architecture context
    diagram_max_files: int = 60     # cap for dependency_graph context

    pr_review_max_runs: int = 5
    pr_max_hunk_chars: int = 4000   # per-file hunk truncation limit
    pr_rag_k: int = 3               # retrieved chunks per hunk
    pr_max_context_chars: int = 12000


settings = Settings()  # type: ignore[call-arg]
