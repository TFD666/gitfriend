import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Callable

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chat_message import ChatMessage
from app.services import llm

logger = logging.getLogger(__name__)

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_SYSTEM_PROMPT = (
    "You are an expert code assistant. Answer questions about the codebase "
    "using ONLY the code snippets provided. If the answer isn't in the "
    "provided snippets, say so."
)


async def query_codebase(
    question: str,
    project_id: str,
    session_factory: Callable[[], AsyncSession],
) -> AsyncGenerator[str, None]:
    """RAG pipeline with session-factory pattern.

    Three DB touches, each in its own short-lived session:
      1. Vector search (before generation)
      2. ChatMessage insert (after generation, failure never surfaces to user)
    No session is held open during the Gemini streaming call.
    """
    citations: list[dict] = []
    accumulated: list[str] = []

    try:
        # --- Step 1: embed question ---
        query_vector = await llm.embed(question)
        vec_literal = "[" + ",".join(str(x) for x in query_vector) + "]"

        # --- Step 2: vector search — open, query, close ---
        async with session_factory() as db:
            db_result = await db.execute(
                text("""
                    SELECT id,
                           file_path,
                           start_line,
                           end_line,
                           content,
                           language,
                           1 - (embedding <=> CAST(:query_vec AS vector)) AS similarity
                    FROM   chunks
                    WHERE  project_id = :project_id
                    ORDER  BY embedding <=> CAST(:query_vec AS vector)
                    LIMIT  8
                """),
                {"query_vec": vec_literal, "project_id": uuid.UUID(project_id)},
            )
            rows = db_result.mappings().all()
        # session closed — no connection held during generation

        logger.info("RAG: %d chunks retrieved for project %s", len(rows), project_id)

        # --- Step 3: emit citations before generation ---
        citations = [
            {
                "file_path": row["file_path"],
                "start_line": row["start_line"],
                "end_line": row["end_line"],
            }
            for row in rows
        ]
        yield f"data: {json.dumps({'citations': citations})}\n\n"

        # --- Step 4: build prompt ---
        if rows:
            context_blocks = "\n\n".join(
                f"--- {row['file_path']} (lines {row['start_line']}-{row['end_line']}) ---\n"
                f"```{row['language'] or ''}\n{row['content']}\n```"
                for row in rows
            )
        else:
            context_blocks = "(no relevant code found)"

        full_prompt = (
            f"{_SYSTEM_PROMPT}\n\n"
            f"Code context:\n\n{context_blocks}\n\n"
            f"Question: {question}"
        )

        # --- Step 5: stream from Gemini, accumulate for persistence ---
        stream_url = (
            f"{_GEMINI_API_BASE}/{settings.gemini_generation_model}:streamGenerateContent"
        )
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                stream_url,
                params={"key": settings.gemini_api_key, "alt": "sse"},
                json={"contents": [{"parts": [{"text": full_prompt}]}]},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk = json.loads(line[6:])
                        delta = chunk["candidates"][0]["content"]["parts"][0]["text"]
                    except (KeyError, IndexError, json.JSONDecodeError):
                        continue
                    if delta:
                        accumulated.append(delta)
                        yield f"data: {json.dumps({'delta': delta})}\n\n"

        # --- Step 6: persist chat turn — failure must not surface to user ---
        try:
            async with session_factory() as db:
                db.add(ChatMessage(
                    id=uuid.uuid4(),
                    project_id=uuid.UUID(project_id),
                    role="user",
                    content=question,
                    citations=None,
                ))
                db.add(ChatMessage(
                    id=uuid.uuid4(),
                    project_id=uuid.UUID(project_id),
                    role="assistant",
                    content="".join(accumulated),
                    citations=citations or None,
                ))
                await db.commit()
            logger.info("Persisted chat turn for project %s", project_id)
        except Exception:
            logger.exception("Failed to persist chat messages for project %s", project_id)

    except Exception as exc:
        logger.exception("RAG pipeline failed for project %s", project_id)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    yield f"data: {json.dumps({'done': True})}\n\n"
