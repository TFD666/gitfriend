import asyncio
import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import Chunk
from app.services import github, llm

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SKIP_DIR_SEGMENTS = {
    "node_modules", ".git", "__pycache__", "dist", "build",
    ".next", "venv", ".venv",
}

# checked with str.endswith — covers multi-part suffixes like .min.js
_SKIP_SUFFIXES = (
    ".lock", ".min.js", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".svg",
    ".pdf", ".zip", ".exe", ".bin",
    ".woff", ".ttf", ".ico", ".DS_Store",
)

_MAX_FILE_BYTES = 200_000

_LANG_BY_EXT: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascript",
    ".tsx": "typescript",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".rs": "rust",
    ".cpp": "cpp",
    ".c": "c",
    ".cs": "csharp",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".html": "html",
    ".css": "css",
    ".sh": "shell",
    ".bash": "shell",
}

# Patterns that mark the start of a top-level definition.
# Must use re.MULTILINE so ^ anchors to line start.
_CHUNK_PATTERNS: dict[str, str] = {
    "python": r"^(def |class )",
    "javascript": r"^(export |function |class |const \w+ = (?:async )?(?:function|\())",
    "typescript": r"^(export |function |class |const \w+ = (?:async )?(?:function|\())",
    "go": r"^func ",
}

_WINDOW_SIZE = 150       # lines per sliding-window chunk
_WINDOW_OVERLAP = 20     # lines of overlap between adjacent windows
_MIN_CHUNK_LINES = 5
_FETCH_CONCURRENCY = 10


# ---------------------------------------------------------------------------
# Filtering helpers
# ---------------------------------------------------------------------------

def _should_skip(item: dict) -> bool:
    path: str = item["path"]
    parts = path.split("/")

    if any(part in _SKIP_DIR_SEGMENTS for part in parts):
        return True

    if path.endswith(_SKIP_SUFFIXES):
        return True

    if item.get("size", 0) > _MAX_FILE_BYTES:
        return True

    return False


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------

@dataclass
class _FileChunk:
    content: str
    start_line: int
    end_line: int
    language: str | None


def _detect_language(path: str) -> str | None:
    if "." not in path:
        return None
    ext = "." + path.rsplit(".", 1)[-1].lower()
    return _LANG_BY_EXT.get(ext)


def _sliding_window(lines: list[str]) -> list[tuple[int, int, str]]:
    """150-line windows with 20-line overlap. Returns (start_line, end_line, text)."""
    step = _WINDOW_SIZE - _WINDOW_OVERLAP
    results = []
    i = 0
    while i < len(lines):
        window = lines[i : i + _WINDOW_SIZE]
        if len(window) >= _MIN_CHUNK_LINES:
            results.append((i + 1, i + len(window), "".join(window)))
        i += step
    return results


def _regex_split(content: str, pattern: str) -> list[tuple[int, int, str]] | None:
    """Split file on regex boundaries. Returns None when no matches found."""
    matches = list(re.finditer(pattern, content, re.MULTILINE))
    if not matches:
        return None

    positions = [m.start() for m in matches]
    raw: list[tuple[int, int, str]] = []

    # header block before first match (imports, module docstring, etc.)
    if positions[0] > 0:
        raw.append((0, positions[0], content[: positions[0]]))

    for i, pos in enumerate(positions):
        end_pos = positions[i + 1] if i + 1 < len(positions) else len(content)
        raw.append((pos, end_pos, content[pos:end_pos]))

    result = []
    for start_pos, end_pos, text in raw:
        start_line = content[:start_pos].count("\n") + 1
        end_line = content[:end_pos].count("\n")
        if end_line - start_line + 1 >= _MIN_CHUNK_LINES:
            result.append((start_line, end_line, text))

    return result or None  # fall back to window if nothing survived the min-lines filter


def _chunk_file(path: str, content: str) -> list[_FileChunk]:
    language = _detect_language(path)
    pattern = _CHUNK_PATTERNS.get(language or "")

    chunks_data: list[tuple[int, int, str]] | None = None
    if pattern:
        chunks_data = _regex_split(content, pattern)

    if chunks_data is None:
        chunks_data = _sliding_window(content.splitlines(keepends=True))

    return [
        _FileChunk(content=text, start_line=sl, end_line=el, language=language)
        for sl, el, text in chunks_data
    ]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def chunk_repo(
    project_id: uuid.UUID,
    repo_full_name: str,
    github_token: str,
    db: AsyncSession,
) -> dict[str, int]:
    # Step 1 — fetch and filter tree
    logger.info("[%s] Fetching file tree", repo_full_name)
    tree = await github.get_repo_tree(github_token, repo_full_name)

    blobs = [item for item in tree if item["type"] == "blob"]
    to_process = [item for item in blobs if not _should_skip(item)]
    files_skipped = len(blobs) - len(to_process)
    logger.info(
        "[%s] Tree: %d blobs — %d to process, %d skipped",
        repo_full_name, len(blobs), len(to_process), files_skipped,
    )

    if not to_process:
        return {"files_processed": 0, "chunks_created": 0, "files_skipped": files_skipped}

    # Step 2 — fetch file contents in parallel (bounded concurrency)
    logger.info("[%s] Fetching %d files (concurrency=%d)", repo_full_name, len(to_process), _FETCH_CONCURRENCY)
    semaphore = asyncio.Semaphore(_FETCH_CONCURRENCY)

    async def _fetch(item: dict) -> tuple[str, str | None]:
        async with semaphore:
            try:
                content = await github.get_file_content(github_token, repo_full_name, item["path"])
                return item["path"], content
            except Exception as exc:
                logger.warning("[%s] Skipping %s: %s", repo_full_name, item["path"], exc)
                return item["path"], None

    fetch_results: list[tuple[str, str | None]] = await asyncio.gather(
        *[_fetch(item) for item in to_process]
    )

    # Step 3 — chunk each file
    all_chunks: list[tuple[str, _FileChunk]] = []
    files_processed = 0
    fetch_failures = 0
    chunk_failures = 0

    for file_path, content in fetch_results:
        if content is None:
            fetch_failures += 1
            continue

        try:
            file_chunks = _chunk_file(file_path, content)
        except Exception as exc:
            logger.warning("[%s] Chunking failed for %s: %s", repo_full_name, file_path, exc)
            chunk_failures += 1
            continue

        if not file_chunks:
            logger.debug("[%s] No chunks from %s", repo_full_name, file_path)
            continue

        files_processed += 1
        all_chunks.extend((file_path, chunk) for chunk in file_chunks)

    logger.info(
        "[%s] Chunked %d files → %d chunks (%d fetch failures, %d chunk failures)",
        repo_full_name, files_processed, len(all_chunks), fetch_failures, chunk_failures,
    )

    if not all_chunks:
        return {
            "files_processed": 0,
            "chunks_created": 0,
            "files_skipped": files_skipped + fetch_failures + chunk_failures,
        }

    # Step 4 — embed via shared llm wrapper (batching + retry centralized there)
    texts = [chunk.content for _, chunk in all_chunks]
    logger.info("[%s] Embedding %d chunks", repo_full_name, len(texts))
    embeddings = await llm.embed_batch(texts)

    # Filter out chunks whose embedding batch failed
    valid_triples = [
        (file_path, chunk, emb)
        for (file_path, chunk), emb in zip(all_chunks, embeddings)
        if emb is not None
    ]
    embed_failures = len(all_chunks) - len(valid_triples)
    if embed_failures:
        logger.warning("[%s] %d chunks skipped due to embedding failure", repo_full_name, embed_failures)

    # Step 5 — upsert: delete stale chunks per file, then bulk insert
    logger.info("[%s] Upserting chunks to DB", repo_full_name)
    seen_paths: set[str] = set()

    for file_path, _, _ in valid_triples:
        if file_path not in seen_paths:
            await db.execute(
                delete(Chunk).where(
                    Chunk.project_id == project_id,
                    Chunk.file_path == file_path,
                )
            )
            seen_paths.add(file_path)

    new_chunks = [
        Chunk(
            project_id=project_id,
            file_path=file_path,
            start_line=chunk.start_line,
            end_line=chunk.end_line,
            content=chunk.content,
            embedding=embedding,
            language=chunk.language,
        )
        for file_path, chunk, embedding in valid_triples
    ]

    db.add_all(new_chunks)
    await db.commit()

    total_skipped = files_skipped + fetch_failures + chunk_failures + embed_failures
    logger.info(
        "[%s] Done — %d files, %d chunks, %d skipped",
        repo_full_name, files_processed, len(new_chunks), total_skipped,
    )

    return {
        "files_processed": files_processed,
        "chunks_created": len(new_chunks),
        "files_skipped": total_skipped,
    }
