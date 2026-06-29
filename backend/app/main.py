import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, career, chat, dashboard, diagrams, health, pr_review, projects, public, summarize
from app.routers.team import invites_router, projects_router as team_projects_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    logger.info("ARQ pool connected")
    yield
    await app.state.arq.aclose()
    logger.info("ARQ pool closed")


app = FastAPI(title="DevKit AI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(career.router, prefix="/api/v1")
app.include_router(summarize.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(diagrams.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(pr_review.router, prefix="/api/v1")
app.include_router(team_projects_router, prefix="/api/v1")
app.include_router(invites_router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
