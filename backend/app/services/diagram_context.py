"""
Diagram context builders — pure DB reads, no Gemini calls.

build_system_context   → structured string for system_architecture prompt
build_dependency_context → structured string for dependency_graph prompt

Both pull from already-indexed Chunk data only; no GitHub API calls.
"""
import re
import uuid
from pathlib import PurePosixPath

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chunk import Chunk

# ---------------------------------------------------------------------------
# Import-extraction regexes (language-agnostic, applied to raw chunk text)
# ---------------------------------------------------------------------------

_IMPORT_PATTERNS = [
    # Python: from x import y  /  import x
    re.compile(r'^\s*from\s+([\w./][^\s;]+)\s+import', re.MULTILINE),
    re.compile(r'^\s*import\s+([\w./][^\s;,]+)', re.MULTILINE),
    # JS/TS: import ... from 'x'  /  require('x')
    re.compile(r"""import\s+(?:[\w{},*\s]+\s+from\s+)?['"]([^'"]+)['"]"""),
    re.compile(r"""require\s*\(\s*['"]([^'"]+)['"]\s*\)"""),
    # Go: import "x"  (single)
    re.compile(r'^\s*import\s+"([^"]+)"', re.MULTILINE),
    # Go: import block entries
    re.compile(r'^\s+"([^"]+)"', re.MULTILINE),
]

# Files whose first chunk gives useful layer signal
_README_RE = re.compile(r'(?i)(^|/)readme(\.\w+)?$')


def _is_internal(import_path: str, all_paths_set: set[str]) -> bool:
    """Return True if import_path refers to a file inside this repo."""
    # Relative imports are always internal
    if import_path.startswith('.'):
        return True

    # Bare module names (no '/') are third-party packages — never internal.
    # e.g. 'react', 'fastapi', 'input-otp' → skip.
    # (Relative imports with '/' were already handled above.)
    if '/' not in import_path:
        return False

    # Strip common path prefixes: @/, ~/, / and src aliases like @src/
    cleaned = import_path
    for prefix in ('@/', '~/', '/'):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
    # Also handle bare '@' (e.g. '@/lib/utils' after stripping '@/' above
    # shouldn't have bare '@' left, but guard anyway)
    cleaned = cleaned.lstrip('@').lstrip('/')

    if not cleaned:
        return False

    # Check whether any repo path contains this import path as a tail segment.
    # e.g. '@/lib/utils' → 'lib/utils' matches 'lib/utils.ts' stem.
    for path in all_paths_set:
        stem = PurePosixPath(path).with_suffix('').as_posix()
        if stem.endswith(cleaned) or path.endswith(cleaned):
            return True

    return False


def _extract_imports(content: str) -> list[str]:
    """Extract all import path strings from a chunk."""
    found = []
    for pat in _IMPORT_PATTERNS:
        for m in pat.finditer(content):
            val = m.group(1).strip()
            if val and not val.startswith('#'):
                found.append(val)
    return found


# ---------------------------------------------------------------------------
# Public builders
# ---------------------------------------------------------------------------

async def build_system_context(
    project_id: uuid.UUID,
    repo_name: str,
    db: AsyncSession,
) -> str:
    """
    Returns a structured prompt-context string for system_architecture generation.

    Strategy:
      1. For each file, select the chunk with the lowest start_line (first chunk).
      2. README files get all their chunks included (usually small, high signal).
      3. Cap total chunks at settings.diagram_max_chunks.
      4. Output: one section per file with path header + content snippet.
    """
    # All distinct file paths in the project, ordered so READMEs come first
    path_result = await db.execute(
        select(Chunk.file_path)
        .where(Chunk.project_id == project_id)
        .distinct()
        .order_by(Chunk.file_path)
    )
    all_paths = [r[0] for r in path_result.all()]

    readme_paths = [p for p in all_paths if _README_RE.search(p)]
    other_paths  = [p for p in all_paths if not _README_RE.search(p)]

    sections: list[str] = []
    chunk_budget = settings.diagram_max_chunks

    # README chunks first — include all chunks
    for path in readme_paths:
        if chunk_budget <= 0:
            break
        result = await db.execute(
            select(Chunk.content)
            .where(Chunk.project_id == project_id, Chunk.file_path == path)
            .order_by(Chunk.start_line)
        )
        chunks = [r[0] for r in result.all()]
        for content in chunks:
            if chunk_budget <= 0:
                break
            sections.append(f"--- FILE: {path} ---\n{content.strip()}")
            chunk_budget -= 1

    # First chunk of every other file
    for path in other_paths:
        if chunk_budget <= 0:
            break
        result = await db.execute(
            select(Chunk.content)
            .where(Chunk.project_id == project_id, Chunk.file_path == path)
            .order_by(Chunk.start_line)
            .limit(1)
        )
        row = result.scalars().first()
        if row:
            sections.append(f"--- FILE: {path} ---\n{row.strip()}")
            chunk_budget -= 1

    total_files = len(readme_paths) + len(other_paths)
    analyzed    = settings.diagram_max_chunks - chunk_budget

    header = (
        f"=== SYSTEM ARCHITECTURE CONTEXT ===\n"
        f"Repository: {repo_name}\n"
        f"Total files in repo: {total_files}\n"
        f"Files included in context: {analyzed}\n"
    )
    return header + "\n\n" + "\n\n".join(sections)


async def build_dependency_context(
    project_id: uuid.UUID,
    repo_name: str,
    db: AsyncSession,
) -> str:
    """
    Returns a structured prompt-context string for dependency_graph generation.

    Strategy:
      1. Collect all unique file paths (to identify internal imports).
      2. For each file, scan all its chunks for import statements.
      3. Keep only imports that resolve to another file in the repo.
      4. Cap at settings.diagram_max_files files.
      5. Output: one line per file listing its internal imports.
    """
    path_result = await db.execute(
        select(Chunk.file_path)
        .where(Chunk.project_id == project_id)
        .distinct()
        .order_by(Chunk.file_path)
    )
    all_paths = [r[0] for r in path_result.all()]
    all_paths_set = set(all_paths)

    # Build import map: file_path -> sorted list of internal imports
    import_map: dict[str, list[str]] = {}

    for path in all_paths[: settings.diagram_max_files]:
        result = await db.execute(
            select(Chunk.content)
            .where(Chunk.project_id == project_id, Chunk.file_path == path)
            .order_by(Chunk.start_line)
        )
        all_content = "\n".join(r[0] for r in result.all())
        raw_imports = _extract_imports(all_content)

        internal = sorted({
            imp for imp in raw_imports
            if _is_internal(imp, all_paths_set)
        })
        if internal:
            import_map[path] = internal

    files_with_deps = len(import_map)
    total_files = len(all_paths)

    lines = [f"  {path} -> {deps}" for path, deps in sorted(import_map.items())]

    header = (
        f"=== DEPENDENCY GRAPH CONTEXT ===\n"
        f"Repository: {repo_name}\n"
        f"Total files in repo: {total_files}\n"
        f"Files with internal imports (capped at {settings.diagram_max_files}): {files_with_deps}\n"
        f"\n--- IMPORT MAP (file -> [internal imports]) ---"
    )
    return header + "\n" + "\n".join(lines)
