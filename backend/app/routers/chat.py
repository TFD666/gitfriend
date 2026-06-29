import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models.chat_message import ChatMessage
from app.models.project import IndexStatus, Project
from app.permissions import require_project_access
from app.services import rag

router = APIRouter(prefix="/chat", tags=["chat"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",  # prevents nginx from buffering SSE chunks
}


class ChatRequest(BaseModel):
    question: str


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    citations: list | None
    created_at: datetime


@router.post("/{project_id}")
async def chat(
    body: ChatRequest,
    project: Project = Depends(require_project_access("editor", "mentor_chat")),
) -> StreamingResponse:
    if project.index_status != IndexStatus.ready:
        raise HTTPException(status_code=400, detail="Project not indexed yet")

    # Pass the factory — rag.query_codebase opens its own short-lived sessions
    # so no connection is held idle during the 30-60s generation call.
    return StreamingResponse(
        rag.query_codebase(body.question, str(project.id), AsyncSessionLocal),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/{project_id}/history", response_model=list[ChatMessageResponse])
async def chat_history(
    project: Project = Depends(require_project_access("viewer", "mentor_chat")),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessage]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.project_id == project.id)
        .order_by(ChatMessage.created_at, ChatMessage.seq)
    )
    return list(result.scalars().all())
