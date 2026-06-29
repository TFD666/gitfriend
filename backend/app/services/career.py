import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.career_artifact import ArtifactType, CareerArtifact
from app.models.project import Project
from app.services import llm

logger = logging.getLogger(__name__)

# Rough char budget for context sent to Gemini (~80K chars ≈ 20K tokens,
# comfortably within gemini-3.5-flash's context window).
_MAX_CONTEXT_CHARS = 80_000


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

async def _build_context(project_id: uuid.UUID, db: AsyncSession) -> str:
    """Pull README + top-file-per-language + sample chunks into a single string."""

    # README first — highest signal for portfolio/summary generation
    readme_result = await db.execute(
        text("""
            SELECT file_path, start_line, end_line, content
            FROM   chunks
            WHERE  project_id = :pid
              AND  lower(file_path) LIKE '%readme%'
            ORDER  BY (end_line - start_line) DESC
            LIMIT  3
        """),
        {"pid": project_id},
    )
    readme_rows = readme_result.mappings().all()

    # Largest chunk per language — proxy for the "main" files
    top_result = await db.execute(
        text("""
            SELECT DISTINCT ON (language)
                   file_path, start_line, end_line, content, language
            FROM   chunks
            WHERE  project_id = :pid
              AND  language IS NOT NULL
              AND  lower(file_path) NOT LIKE '%readme%'
            ORDER  BY language, (end_line - start_line) DESC
        """),
        {"pid": project_id},
    )
    top_rows = top_result.mappings().all()

    # Broad sample for tech-stack detection
    sample_result = await db.execute(
        text("""
            SELECT file_path, content
            FROM   chunks
            WHERE  project_id = :pid
            ORDER  BY created_at
            LIMIT  20
        """),
        {"pid": project_id},
    )
    sample_rows = sample_result.mappings().all()

    parts: list[str] = []
    total = 0

    for row in readme_rows:
        block = f"### {row['file_path']}\n{row['content']}\n"
        if total + len(block) > _MAX_CONTEXT_CHARS:
            break
        parts.append(block)
        total += len(block)

    for row in top_rows:
        block = (
            f"### {row['file_path']} (lines {row['start_line']}-{row['end_line']})\n"
            f"{row['content']}\n"
        )
        if total + len(block) > _MAX_CONTEXT_CHARS:
            break
        parts.append(block)
        total += len(block)

    for row in sample_rows:
        block = f"### {row['file_path']}\n{row['content']}\n"
        if total + len(block) > _MAX_CONTEXT_CHARS:
            break
        parts.append(block)
        total += len(block)

    if not parts:
        return "(no code context available)"

    logger.info(
        "Career context for project %s: %d chars from %d blocks",
        project_id, total, len(parts),
    )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Upsert helper
# ---------------------------------------------------------------------------

async def _upsert_artifact(
    project_id: uuid.UUID,
    artifact_type: ArtifactType,
    content: dict,
    db: AsyncSession,
) -> CareerArtifact:
    now = datetime.now(timezone.utc)
    stmt = (
        pg_insert(CareerArtifact)
        .values(
            id=uuid.uuid4(),
            project_id=project_id,
            artifact_type=artifact_type.value,
            content=content,
            model_version=settings.gemini_generation_model,
            generated_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_career_artifact_project_type",
            set_={
                "content": content,
                "model_version": settings.gemini_generation_model,
                "updated_at": now,
            },
        )
    )
    await db.execute(stmt)
    await db.commit()

    row = await db.execute(
        select(CareerArtifact).where(
            CareerArtifact.project_id == project_id,
            CareerArtifact.artifact_type == artifact_type.value,
        )
    )
    return row.scalars().one()


# ---------------------------------------------------------------------------
# Generation functions
# ---------------------------------------------------------------------------

async def generate_portfolio(
    project: Project, context: str, db: AsyncSession
) -> CareerArtifact:
    repo = project.github_repo_full_name
    prompt = f"""\
You are analyzing a software project from its source code. Based on the code \
context below, generate a portfolio summary for the project "{repo}".

Return ONLY valid JSON matching this exact shape:
{{
  "summary": "<2-3 sentence description of what the project does and its key technical approach>",
  "tech_stack": ["<technology>", "..."],
  "highlights": ["<notable feature or technical decision>", "..."]
}}

Rules:
- tech_stack: list the actual technologies, frameworks, and languages present in the code
- highlights: 3-5 specific, concrete things this project does well
- Output the JSON object only — no markdown fences, no explanation

Code context:
{context}"""

    logger.info("Generating portfolio for project %s", project.id)
    content: dict = await llm.generate(prompt, json_mode=True)
    return await _upsert_artifact(project.id, ArtifactType.portfolio, content, db)


async def generate_resume_bullets(
    project: Project, context: str, db: AsyncSession
) -> CareerArtifact:
    repo = project.github_repo_full_name
    prompt = f"""\
You are a technical resume writer. Based on the source code below for the \
project "{repo}", write 3–5 STAR-format resume bullets \
(Situation → Task → Action → Result).

Return ONLY valid JSON matching this exact shape:
{{
  "bullets": [
    "<starts with action verb, names specific tech from the code, ends with concrete result>",
    "..."
  ]
}}

Rules:
- Each bullet starts with a strong action verb (Built, Designed, Implemented, Reduced, etc.)
- Each bullet names specific technologies actually present in the code
- Each bullet ends with a concrete result or metric where possible
- 3–5 bullets total
- Output the JSON object only — no markdown fences, no explanation

Code context:
{context}"""

    logger.info("Generating resume bullets for project %s", project.id)
    content: dict = await llm.generate(prompt, json_mode=True)
    return await _upsert_artifact(project.id, ArtifactType.resume_bullets, content, db)


async def generate_interview_prep(
    project: Project, context: str, db: AsyncSession
) -> CareerArtifact:
    repo = project.github_repo_full_name
    prompt = f"""\
You are a technical interviewer. Based on the source code below for the \
project "{repo}", generate 5 technical interview questions a candidate \
would need to answer about this codebase.

Return ONLY valid JSON matching this exact shape:
{{
  "questions": [
    {{
      "question": "<specific technical question about this codebase>",
      "answer": "<detailed answer referencing actual code, 2-4 sentences>",
      "file_refs": ["<file_path>", "..."]
    }}
  ]
}}

Rules:
- Questions must be specific to this codebase, not generic interview questions
- Answers must reference actual code patterns, functions, or architectural choices visible in the context
- file_refs: file paths most relevant to the question (empty list if none apply)
- Generate exactly 5 questions
- Output the JSON object only — no markdown fences, no explanation

Code context:
{context}"""

    logger.info("Generating interview prep for project %s", project.id)
    content: dict = await llm.generate(prompt, json_mode=True)
    return await _upsert_artifact(project.id, ArtifactType.interview_prep, content, db)
