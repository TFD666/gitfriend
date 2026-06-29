"""
Gemini diagram generation service.

generate_diagram(diagram_type, context_str)
  → calls Gemini (non-streaming), returns validated Mermaid source string.
  Retries once with a "fix the syntax" prompt if validation fails.
  Raises DiagramGenerationError if both attempts fail validation.

validate_mermaid(source)
  → lightweight structural check — not a full parser. Catches Gemini's
    common failure modes: missing graph declaration, no edges, unclosed
    brackets, markdown fences left in output, bare quoted node IDs.
"""
import logging
import re

from app.services.llm import generate as llm_generate

logger = logging.getLogger(__name__)


class DiagramGenerationError(Exception):
    pass


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_SYSTEM_ARCH_PROMPT = """\
You are a software architect.

Given the repository context below, generate a Mermaid system architecture \
diagram using `graph TD` (top-down). Group related nodes into subgraphs by \
architectural layer (e.g., Frontend, Backend, Database, External APIs, \
Workers). Use short node labels. Include the most important components; \
omit trivial utility nodes.

Rules:
- Output ONLY valid Mermaid source. No markdown fences (no ```). No \
explanation. No preamble. No trailing text.
- Start the very first line with: graph TD
- Each edge: NodeA --> NodeB or NodeA --> |label| NodeB
- Subgraph syntax: subgraph LayerName ... end

REPOSITORY CONTEXT:
{context}
"""

_DEP_GRAPH_PROMPT = """\
You are a software architect.

Given the import map below, generate a Mermaid dependency graph using \
`graph LR` (left-to-right). Each node is a file/module; each edge is an \
import relationship. Use short node labels (last path segment is fine). \
If many files import the same utility, collapse them into one shared node \
rather than repeating it.

Rules:
- Output ONLY valid Mermaid source. No markdown fences (no ```). No \
explanation. No preamble. No trailing text.
- Start the very first line with: graph LR
- Node syntax: use a safe alphanumeric identifier plus a quoted label.
  Example: cmd["command.tsx"] --> dlg["dialog.tsx"]
- NEVER use a quoted string as the bare node ID: "command.tsx" --> "dialog" is WRONG.

IMPORT MAP:
{context}
"""

_FIX_PROMPT_BASE = """\
The following Mermaid source has a syntax error. Fix it and output ONLY the \
corrected Mermaid source. No markdown fences, no explanation, no preamble. \
Start the very first line with: graph

BROKEN SOURCE:
{broken}

VALIDATION ERROR:
{error}
"""

# Appended to fix prompt only for dependency_graph — system_architecture uses
# quoted labels inside node definitions legitimately, so this rule doesn't apply.
_FIX_PROMPT_DEP_GRAPH_EXTRA = """\

Additional rule: use a safe alphanumeric identifier plus a quoted label for \
every node. Example: cmd["command.tsx"] --> dlg["dialog.tsx"]. \
NEVER use a quoted string as the bare node ID ("command.tsx" --> "dialog" is WRONG).
"""

_PROMPTS = {
    "system_architecture": _SYSTEM_ARCH_PROMPT,
    "dependency_graph": _DEP_GRAPH_PROMPT,
}

# ---------------------------------------------------------------------------
# Fence stripper (Gemini sometimes wraps in ```mermaid despite instructions)
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"^```(?:mermaid)?\s*\n?(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = _FENCE_RE.match(text)
    return m.group(1).strip() if m else text


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

_EDGE_RE = re.compile(r"-->|---|==>|-.->|--[^-]")
_BRACKET_PAIRS = [("(", ")"), ("[", "]"), ("{", "}")]

# Matches edges where either the source or target is a bare quoted string
# (e.g. "foo" --> bar  or  bar --> "foo").  Both sides must use
# nodeId["label"] syntax — a quoted string as a node ID is invalid Mermaid.
_BARE_QUOTED_NODE_RE = re.compile(
    r'(?:^\s*"[^"]*"\s*(?:-->|---|==>|-\.->|--)' # quoted on left side of edge
    r'|(?:-->|---|==>|-\.->|--)\s*"[^"]*"\s*$)',  # quoted on right side of edge
    re.MULTILINE,
)


def validate_mermaid(source: str) -> tuple[bool, str]:
    """
    Returns (ok, error_message).
    Lightweight structural check — not a full Mermaid parser.
    """
    s = source.strip()

    if not s:
        return False, "empty output"

    first_line = s.splitlines()[0].strip().lower()
    if not first_line.startswith("graph"):
        return False, f"must start with 'graph', got: {first_line[:60]!r}"

    if not _EDGE_RE.search(s):
        return False, "no edge found (expected --> or --- between nodes)"

    if _BARE_QUOTED_NODE_RE.search(s):
        return False, (
            'bare quoted node IDs detected (e.g. "foo" --> "bar"); '
            'use nodeId["label"] syntax instead'
        )

    # Unclosed bracket check — count opens vs closes in non-string context
    for open_ch, close_ch in _BRACKET_PAIRS:
        depth = 0
        for ch in s:
            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
            if depth < 0:
                return False, f"unmatched closing '{close_ch}'"
        if depth != 0:
            return False, f"unclosed '{open_ch}' (depth={depth})"

    return True, ""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def generate_diagram(diagram_type: str, context_str: str) -> str:
    """
    Generate validated Mermaid source for the given diagram type.

    Raises DiagramGenerationError if both generation attempts fail validation.
    """
    if diagram_type not in _PROMPTS:
        raise ValueError(f"Unknown diagram_type: {diagram_type!r}")

    prompt = _PROMPTS[diagram_type].format(context=context_str)

    # Attempt 1
    raw = await llm_generate(prompt, json_mode=False)
    source = _strip_fences(raw)
    ok, err = validate_mermaid(source)

    if ok:
        logger.info("Diagram %r generated and validated on first attempt.", diagram_type)
        return source

    logger.warning(
        "Diagram %r failed validation on attempt 1: %s — retrying with fix prompt.",
        diagram_type, err,
    )

    # Attempt 2 — fix prompt, with dep_graph node-syntax rule injected if needed
    fix_prompt = _FIX_PROMPT_BASE.format(broken=source, error=err)
    if diagram_type == "dependency_graph":
        fix_prompt += _FIX_PROMPT_DEP_GRAPH_EXTRA
    raw2 = await llm_generate(fix_prompt, json_mode=False)
    source2 = _strip_fences(raw2)
    ok2, err2 = validate_mermaid(source2)

    if ok2:
        logger.info("Diagram %r validated after fix prompt.", diagram_type)
        return source2

    raise DiagramGenerationError(
        f"Diagram generation failed after 2 attempts. "
        f"Attempt 1 error: {err}. Attempt 2 error: {err2}. "
        f"Last output: {source2[:200]!r}"
    )
