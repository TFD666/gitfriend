import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_EMBED_OUTPUT_DIM = 768  # must match Vector(768) column — output_dimensionality is required,
                         # Gemini's native output is 3072-dim for gemini-embedding-001

_GENERATE_TIMEOUT = 180.0
_EMBED_TIMEOUT = 30.0
_EMBED_BATCH_SIZE = 100
_MAX_RETRIES = 3
_RETRY_BASE_S = 1.0

# Gemini occasionally wraps JSON-mode output in markdown fences despite
# responseMimeType=application/json being set — strip before parsing.
_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*)\n```\s*$", re.DOTALL)


def _parse_json(text: str) -> Any:
    text = text.strip()
    m = _FENCE_RE.match(text)
    if m:
        text = m.group(1)
    return json.loads(text)


async def generate(prompt: str, *, json_mode: bool = False) -> str | Any:
    """Single-shot Gemini generation (generateContent, not streaming).

    Returns parsed object when json_mode=True, plain str otherwise.
    Retries up to _MAX_RETRIES on transient errors; raises RuntimeError on
    exhaustion so callers can surface a clean 502.
    """
    url = f"{_GEMINI_API_BASE}/{settings.gemini_generation_model}:generateContent"
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
    }
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}

    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=_GENERATE_TIMEOUT) as client:
                resp = await client.post(
                    url,
                    params={"key": settings.gemini_api_key},
                    json=payload,
                )
                resp.raise_for_status()
                text_out = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                return _parse_json(text_out) if json_mode else text_out
        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                delay = _RETRY_BASE_S * (2 ** attempt)
                logger.warning(
                    "Gemini generate failed (attempt %d/%d), retrying in %.1fs: %s",
                    attempt + 1, _MAX_RETRIES, delay, exc,
                )
                await asyncio.sleep(delay)

    raise RuntimeError(
        f"Gemini generate failed after {_MAX_RETRIES} attempts: {last_exc}"
    ) from last_exc


async def embed(text: str) -> list[float]:
    """Embed a single text string (used for query vectorization in RAG)."""
    url = f"{_GEMINI_API_BASE}/{settings.gemini_embedding_model}:embedContent"
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=_EMBED_TIMEOUT) as client:
                resp = await client.post(
                    url,
                    params={"key": settings.gemini_api_key},
                    json={
                        "model": f"models/{settings.gemini_embedding_model}",
                        "content": {"parts": [{"text": text}]},
                        "output_dimensionality": _EMBED_OUTPUT_DIM,
                    },
                )
                resp.raise_for_status()
                return resp.json()["embedding"]["values"]
        except Exception as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                delay = _RETRY_BASE_S * (2 ** attempt)
                logger.warning(
                    "Gemini embed failed (attempt %d/%d), retrying in %.1fs: %s",
                    attempt + 1, _MAX_RETRIES, delay, exc,
                )
                await asyncio.sleep(delay)

    raise RuntimeError(
        f"Gemini embed failed after {_MAX_RETRIES} attempts: {last_exc}"
    ) from last_exc


async def embed_batch(texts: list[str]) -> list[list[float] | None]:
    """Batch-embed texts via batchEmbedContents.

    Returns a list aligned with `texts`. Positions whose batch fails all
    retries are filled with None so callers can skip those chunks.
    """
    results: list[list[float] | None] = [None] * len(texts)
    batch_url = f"{_GEMINI_API_BASE}/{settings.gemini_embedding_model}:batchEmbedContents"
    model_path = f"models/{settings.gemini_embedding_model}"
    total_batches = (len(texts) + _EMBED_BATCH_SIZE - 1) // _EMBED_BATCH_SIZE

    async with httpx.AsyncClient(timeout=_EMBED_TIMEOUT) as client:
        for i in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[i : i + _EMBED_BATCH_SIZE]
            batch_num = i // _EMBED_BATCH_SIZE + 1
            logger.info("Embedding batch %d/%d (%d texts)", batch_num, total_batches, len(batch))

            payload = {
                "requests": [
                    {
                        "model": model_path,
                        "content": {"parts": [{"text": t}]},
                        "output_dimensionality": _EMBED_OUTPUT_DIM,
                    }
                    for t in batch
                ]
            }

            last_exc: Exception | None = None
            for attempt in range(_MAX_RETRIES):
                try:
                    resp = await client.post(
                        batch_url,
                        params={"key": settings.gemini_api_key},
                        json=payload,
                    )
                    resp.raise_for_status()
                    for j, emb in enumerate(resp.json()["embeddings"]):
                        results[i + j] = emb["values"]
                    break
                except Exception as exc:
                    last_exc = exc
                    if attempt < _MAX_RETRIES - 1:
                        delay = _RETRY_BASE_S * (2 ** attempt)
                        logger.warning(
                            "Embed batch %d/%d failed (attempt %d/%d), retrying in %.1fs: %s",
                            batch_num, total_batches, attempt + 1, _MAX_RETRIES, delay, exc,
                        )
                        await asyncio.sleep(delay)
            else:
                logger.error(
                    "Embed batch %d/%d failed after %d attempts — skipping %d chunks: %s",
                    batch_num, total_batches, _MAX_RETRIES, len(batch), last_exc,
                )

    return results
