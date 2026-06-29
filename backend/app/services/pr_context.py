"""
PR diff splitter and RAG context builder for Phase 11 PR Review.

split_diff_into_hunks(diff_str)
  → list[DiffHunk]. Splits raw unified diff into per-file sections.
    Binary files are skipped. Deleted files are included with a note.
    Each hunk is truncated at settings.pr_max_hunk_chars.

build_review_context(project_id, diff_str, db)
  → str. For each hunk: embed → pgvector search → deduplicate across hunks.
    Returns diff hunks interleaved with retrieved codebase context.
    Caps total at settings.pr_max_context_chars by dropping least-relevant
    retrieved chunks (last in each hunk's similarity-ranked list) first.
"""
import logging
import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services import llm

logger = logging.getLogger(__name__)

# Matches the "diff --git a/X b/X" header line that starts each file section.
_DIFF_SPLIT_RE = re.compile(r"(?=^diff --git )", re.MULTILINE)

# Extracts the b-side (new) file path from the header.
_DIFF_HEADER_RE = re.compile(r"^diff --git a/.+ b/(.+)$", re.MULTILINE)


@dataclass
class DiffHunk:
    file_path: str
    hunk_text: str
    is_deleted: bool = False


def split_diff_into_hunks(diff_str: str) -> list[DiffHunk]:
    """Split a raw unified diff string into per-file DiffHunk objects.

    Rules:
    - Binary files are skipped entirely.
    - Deleted files are included; hunk_text is prefixed with [DELETED FILE].
    - Each hunk_text is capped at settings.pr_max_hunk_chars.
    """
    if not diff_str or not diff_str.strip():
        return []

    parts = _DIFF_SPLIT_RE.split(diff_str)
    hunks: list[DiffHunk] = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        header_match = _DIFF_HEADER_RE.match(part)
        if not header_match:
            continue
        file_path = header_match.group(1).strip()

        # Binary files carry no diff content useful for review — skip.
        if "Binary files" in part:
            logger.debug("Skipping binary file in diff: %s", file_path)
            continue

        is_deleted = "+++ /dev/null" in part

        if is_deleted:
            hunk_text = f"[DELETED FILE: {file_path}]\n{part}"
        else:
            hunk_text = part

        if len(hunk_text) > settings.pr_max_hunk_chars:
            hunk_text = hunk_text[: settings.pr_max_hunk_chars] + "\n... [truncated]"

        hunks.append(DiffHunk(file_path=file_path, hunk_text=hunk_text, is_deleted=is_deleted))

    logger.info("split_diff_into_hunks: %d file(s) extracted", len(hunks))
    return hunks


async def build_review_context(
    project_id: uuid.UUID,
    diff_str: str,
    db: AsyncSession,
) -> str:
    """Embed each diff hunk, run pgvector search, deduplicate, build context string.

    Returns a single string suitable for injection into the Gemini review prompt.
    Total length is capped at settings.pr_max_context_chars by iteratively dropping
    the least-relevant retrieved chunk (last in similarity order) until the string fits.
    """
    hunks = split_diff_into_hunks(diff_str)
    if not hunks:
        return "(empty diff — no file changes detected)"

    seen_chunk_ids: set[str] = set()
    # List of (hunk, [retrieved_chunk_dicts]) — chunks are similarity-ranked,
    # most relevant first, so dropping from the tail removes least-relevant first.
    hunk_results: list[tuple[DiffHunk, list[dict]]] = []

    for hunk in hunks:
        vec = await llm.embed(hunk.hunk_text)
        vec_literal = "[" + ",".join(str(x) for x in vec) + "]"

        result = await db.execute(
            text("""
                SELECT id, file_path, start_line, end_line, content, language
                FROM   chunks
                WHERE  project_id = :project_id
                ORDER  BY embedding <=> CAST(:query_vec AS vector)
                LIMIT  :k
            """),
            {"query_vec": vec_literal, "project_id": project_id, "k": settings.pr_rag_k},
        )

        new_chunks: list[dict] = []
        for row in result.mappings():
            cid = str(row["id"])
            if cid not in seen_chunk_ids:
                seen_chunk_ids.add(cid)
                new_chunks.append(dict(row))

        hunk_results.append((hunk, new_chunks))
        logger.debug(
            "Hunk %s: %d unique chunk(s) retrieved", hunk.file_path, len(new_chunks)
        )

    def _render(pairs: list[tuple[DiffHunk, list[dict]]]) -> str:
        sections: list[str] = []
        for hunk, chunks in pairs:
            section_parts = [f"=== DIFF: {hunk.file_path} ===\n{hunk.hunk_text}"]
            for chunk in chunks:
                section_parts.append(
                    f"--- Codebase context: {chunk['file_path']} "
                    f"(lines {chunk['start_line']}-{chunk['end_line']}) ---\n"
                    f"```{chunk['language'] or ''}\n{chunk['content']}\n```"
                )
            sections.append("\n\n".join(section_parts))
        return "\n\n".join(sections)

    # Trim least-relevant retrieved chunks until context fits the limit.
    while True:
        ctx = _render(hunk_results)
        if len(ctx) <= settings.pr_max_context_chars:
            break

        # Find the hunk that still has retrieved chunks and drop its last (least relevant).
        trimmed = False
        for i in range(len(hunk_results) - 1, -1, -1):
            hunk, chunks = hunk_results[i]
            if chunks:
                hunk_results[i] = (hunk, chunks[:-1])
                trimmed = True
                break

        if not trimmed:
            # No chunks left to drop — hard-truncate the raw string.
            ctx = ctx[: settings.pr_max_context_chars] + "\n... [context truncated]"
            break

    total_chunks = sum(len(c) for _, c in hunk_results)
    logger.info(
        "build_review_context: %d hunk(s), %d unique chunk(s) in final context, %d chars",
        len(hunk_results),
        total_chunks,
        len(ctx),
    )
    return ctx
