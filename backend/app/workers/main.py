from arq.connections import RedisSettings

from app.config import settings
from app.workers.diagrams import generate_diagram_artifact
from app.workers.health import analyze_repo_health
from app.workers.indexing import index_repository
from app.workers.pr_review import run_pr_review


class WorkerSettings:
    functions = [index_repository, analyze_repo_health, generate_diagram_artifact, run_pr_review]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 5
    job_timeout = 3600
