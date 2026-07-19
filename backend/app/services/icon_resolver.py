"""
Icon + color resolver for projects.

Priority order (first applicable tier wins per field):
  Tier 1 — Manual override     (icon_override / color_override on project record, independently)
  Tier 2 — Stack detection     (deps from manifest chunks already in DB)
  Tier 3 — Keyword fallback    (repo name / description keywords)
  Tier 4 — Seeded-random       (deterministic hash of project.id)

Each override field is resolved independently: a project with only icon_override
set gets that icon but still auto-resolves its color (Tier 2/3/4).

Public API
----------
  resolve_icon_color(project, deps) -> {"icon": str, "color": str}
  extract_deps_from_chunk_rows(rows)  -> set[str]
  VALID_ICONS   — frozenset of accepted icon keys
  VALID_COLORS  — frozenset of accepted color keys
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import uuid
from typing import Sequence

# ---------------------------------------------------------------------------
# Canonical registries — single source of truth for both backend validation
# and frontend rendering.
# ---------------------------------------------------------------------------

# All icon keys the system knows about.
# Maps key → Lucide component name (informational; enforcement is on frontend).
ICON_META: dict[str, str] = {
    "code-brackets": "Code2",        # React / Next / Vue frontend
    "terminal":      "Terminal",     # Python web frameworks
    "server":        "Server",       # Node / Express backend
    "chart":         "BarChart2",    # ML / Data science
    "folder":        "Folder",       # generic fallback
    "box":           "Box",          # generic fallback
    "layers":        "Layers",       # generic fallback
    "puzzle-piece":  "Puzzle",       # generic fallback
    "clipboard":     "ClipboardList",# todo / task / planner keyword
    "pulse":         "Activity",     # health / medical keyword
}

VALID_ICONS: frozenset[str] = frozenset(ICON_META)

# Maps color key → hex.  All 6 keys are valid in the picker;
# "blue-white" is keyword-only and excluded from the random-fallback pool.
COLOR_HEX: dict[str, str] = {
    "purple":     "#818CF8",
    "blue":       "#60A5FA",
    "teal":       "#2DD4BF",
    "green":      "#34D399",
    "orange":     "#FB923C",
    "blue-white": "#93C5FD",   # keyword-only; never drawn in random pool
}

VALID_COLORS: frozenset[str] = frozenset(COLOR_HEX)

# Ordered sequence used for the seeded-random pool (excludes blue-white).
_RANDOM_ICON_POOL: list[str] = ["folder", "box", "layers", "puzzle-piece"]
_RANDOM_COLOR_POOL: list[str] = ["purple", "blue", "orange", "teal", "green"]


# ---------------------------------------------------------------------------
# Tier-2 stack-detection rules
# ---------------------------------------------------------------------------

# Frontend frameworks (checked against dep names)
_FRONTEND_DEPS: frozenset[str] = frozenset({"react", "next", "nextjs", "vue", "nuxt", "svelte"})
# Python web frameworks
_PYTHON_WEB_DEPS: frozenset[str] = frozenset({"fastapi", "django", "flask"})
# Node backend
_NODE_BACKEND_DEPS: frozenset[str] = frozenset({"express", "koa", "hapi", "fastify"})
# ML / Data science
_ML_DEPS: frozenset[str] = frozenset({"torch", "tensorflow", "sklearn", "scikit-learn", "pandas", "numpy", "keras"})

def _detect_stack(deps: frozenset[str]) -> tuple[str, str] | None:
    """Return (icon, color) from deps, or None if no rule matches."""
    if deps & _FRONTEND_DEPS:
        return "code-brackets", "purple"
    if deps & _PYTHON_WEB_DEPS:
        return "terminal", "blue"
    if deps & _NODE_BACKEND_DEPS:
        return "server", "teal"
    if deps & _ML_DEPS:
        return "chart", "green"
    return None


# ---------------------------------------------------------------------------
# Tier-3 keyword rules (applied to repo name)
# ---------------------------------------------------------------------------

_HEALTH_KW = re.compile(r"\b(health|cancer|medical|screening|clinic|hospital|patient)\b", re.I)
_TASK_KW   = re.compile(r"\b(todo|task|planner|kanban|checklist|agenda)\b", re.I)

def _detect_keyword(repo_name: str) -> tuple[str, str] | None:
    """Return (icon, color) from repo name keywords, or None."""
    name_only = repo_name.split("/")[-1].replace("-", " ").replace("_", " ")
    if _HEALTH_KW.search(name_only):
        return "pulse", "orange"
    if _TASK_KW.search(name_only):
        return "clipboard", "blue-white"
    return None


# ---------------------------------------------------------------------------
# Tier-4 seeded-random fallback
# ---------------------------------------------------------------------------

def _seeded_random(project_id: uuid.UUID) -> tuple[str, str]:
    """Return a deterministic (icon, color) pair seeded by project UUID."""
    seed = int.from_bytes(hashlib.md5(str(project_id).encode()).digest(), "big")
    rng = random.Random(seed)
    icon  = rng.choice(_RANDOM_ICON_POOL)
    color = rng.choice(_RANDOM_COLOR_POOL)
    return icon, color


# ---------------------------------------------------------------------------
# Public resolver
# ---------------------------------------------------------------------------

class _Unresolved:
    """Sentinel so we can distinguish "not yet resolved" from None."""

_UNRESOLVED = _Unresolved()


def resolve_icon_color(
    project_id: uuid.UUID,
    repo_full_name: str,
    icon_override: str | None,
    color_override: str | None,
    deps: frozenset[str],
) -> dict[str, str]:
    """
    Resolve icon and color for a project according to the 4-tier spec.

    Each field (icon / color) is resolved independently:
      - If icon_override is set and valid, use it.
      - If color_override is set and valid, use it.
      - Otherwise fall through Tier 2 → 3 → 4 for that field.

    Args:
        project_id:     UUID of the project (for seeded-random).
        repo_full_name: "owner/repo" string (for keyword detection).
        icon_override:  Stored icon key or None.
        color_override: Stored color key or None.
        deps:           Lowercased dep names extracted from manifest files.

    Returns:
        {"icon": str, "color": str}
    """
    icon: str | _Unresolved  = _UNRESOLVED
    color: str | _Unresolved = _UNRESOLVED

    # ── Tier 1: manual override (each field independent) ─────────────────────
    if icon_override and icon_override in VALID_ICONS:
        icon = icon_override
    if color_override and color_override in VALID_COLORS:
        color = color_override

    # If both already resolved, we're done.
    if not isinstance(icon, _Unresolved) and not isinstance(color, _Unresolved):
        return {"icon": icon, "color": color}

    # ── Tier 2: stack detection ───────────────────────────────────────────────
    stack_icon: str | None = None
    stack_color: str | None = None
    if isinstance(icon, _Unresolved) or isinstance(color, _Unresolved):
        result = _detect_stack(deps)
        if result:
            stack_icon, stack_color = result

    if isinstance(icon, _Unresolved) and stack_icon:
        icon = stack_icon
    if isinstance(color, _Unresolved) and stack_color:
        color = stack_color

    if not isinstance(icon, _Unresolved) and not isinstance(color, _Unresolved):
        return {"icon": icon, "color": color}

    # ── Tier 3: keyword fallback ──────────────────────────────────────────────
    kw_icon: str | None = None
    kw_color: str | None = None
    if isinstance(icon, _Unresolved) or isinstance(color, _Unresolved):
        result = _detect_keyword(repo_full_name)
        if result:
            kw_icon, kw_color = result

    if isinstance(icon, _Unresolved) and kw_icon:
        icon = kw_icon
    if isinstance(color, _Unresolved) and kw_color:
        color = kw_color

    if not isinstance(icon, _Unresolved) and not isinstance(color, _Unresolved):
        return {"icon": icon, "color": color}

    # ── Tier 4: seeded-random (fills whatever is still unresolved) ────────────
    rand_icon, rand_color = _seeded_random(project_id)
    if isinstance(icon, _Unresolved):
        icon = rand_icon
    if isinstance(color, _Unresolved):
        color = rand_color

    return {"icon": icon, "color": color}  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Dependency extraction from manifest chunk content
# ---------------------------------------------------------------------------

# Manifest filenames we look for (matched against chunk file_path suffix).
MANIFEST_FILENAMES: tuple[str, ...] = (
    "package.json",
    "requirements.txt",
    "Pipfile",
    "pyproject.toml",
)


def _parse_package_json(content: str) -> set[str]:
    """Extract dep names from package.json content."""
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return set()
    deps: set[str] = set()
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        deps.update(k.lower() for k in data.get(section, {}).keys())
    return deps


def _parse_requirements_txt(content: str) -> set[str]:
    """Extract package names from requirements.txt (strips version specifiers)."""
    deps: set[str] = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-")):
            continue
        # Strip extras: pkg[extra] and version: pkg>=1.0, pkg==1.0, pkg~=1.0
        name = re.split(r"[>=<!~\[\s;]", line)[0].strip().lower()
        if name:
            deps.add(name)
    return deps


def _parse_pipfile(content: str) -> set[str]:
    """Extract dep names from Pipfile [packages] / [dev-packages] sections."""
    deps: set[str] = set()
    in_section = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped in ("[packages]", "[dev-packages]"):
            in_section = True
            continue
        if stripped.startswith("[") and in_section:
            in_section = False
            continue
        if in_section and "=" in stripped:
            name = stripped.split("=")[0].strip().strip('"\'').lower()
            if name:
                deps.add(name)
    return deps


def _parse_pyproject_toml(content: str) -> set[str]:
    """Extract dep names from pyproject.toml (poetry / PEP 621 format)."""
    deps: set[str] = set()
    # Match lines like: package = ">=1.0" or package = {version = ...}
    # Also handles [tool.poetry.dependencies] and [project] dependencies arrays.
    in_section = False
    for line in content.splitlines():
        stripped = line.strip()
        if stripped in (
            "[tool.poetry.dependencies]",
            "[tool.poetry.dev-dependencies]",
            "[build-system]",
        ):
            in_section = True
            continue
        if stripped == "[project]":
            in_section = False  # handled differently below
            continue
        if stripped.startswith("[") and in_section:
            in_section = False
            continue
        if in_section and "=" in stripped:
            name = re.split(r"[=\s\[{]", stripped)[0].strip().strip('"\'').lower()
            if name and name not in ("python", ""):
                deps.add(name)

    # Also pick up PEP 621 style: dependencies = ["pkg>=1.0", ...]
    for match in re.finditer(r'"([A-Za-z0-9_\-]+)\s*[>=<!~\[]', content):
        deps.add(match.group(1).lower())

    return deps


def extract_deps_from_chunk_rows(rows: Sequence[tuple[str, str]]) -> frozenset[str]:
    """
    Parse dependency names from manifest chunk rows.

    Args:
        rows: Sequence of (file_path, content) tuples for manifest files
              (as returned by the correlated subquery in list_projects).

    Returns:
        frozenset of lowercased dependency names.
    """
    deps: set[str] = set()
    for file_path, content in rows:
        path_lower = file_path.lower()
        if path_lower.endswith("package.json"):
            deps |= _parse_package_json(content)
        elif path_lower.endswith("requirements.txt"):
            deps |= _parse_requirements_txt(content)
        elif path_lower.endswith("pipfile"):
            deps |= _parse_pipfile(content)
        elif path_lower.endswith("pyproject.toml"):
            deps |= _parse_pyproject_toml(content)
    return frozenset(deps)
