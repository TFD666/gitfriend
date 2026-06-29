"""
Gemini PR review generation service for Phase 11.

generate_review(context_str)
  → validated dict {verdict, summary, comments}.
  Single Gemini call (JSON mode). Validates structure; retries once with a
  "fix the JSON" follow-up prompt on failure.
  Raises PRReviewGenerationError if both attempts fail validation.
"""
import json
import logging

from app.services.llm import generate as llm_generate

logger = logging.getLogger(__name__)

_ALLOWED_VERDICTS = {"approve", "request_changes", "comment"}
_ALLOWED_COMMENT_TYPES = {"issue", "suggestion", "praise", "nitpick"}


class PRReviewGenerationError(Exception):
    pass


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_REVIEW_PROMPT = """\
You are an expert code reviewer. Given the PR diff and relevant codebase \
context below, produce a structured code review.

Output ONLY a JSON object with exactly these keys:
- "verdict": one of "approve", "request_changes", or "comment"
- "summary": a paragraph summarizing the overall quality of the PR
- "comments": an array of inline review comments, each with:
    - "file_path": string — the file being commented on
    - "line_number": integer or null — null for file-level comments not \
tied to a specific line
    - "comment_type": one of "issue", "suggestion", "praise", "nitpick"
    - "body": string — the comment text

Rules:
- Every review MUST include at least one inline comment. Never return an \
empty "comments" array.
- "line_number" MUST be an integer or null — never a string, never omitted.
- Output ONLY the JSON object. No markdown fences, no explanation, no preamble.

PR DIFF AND CODEBASE CONTEXT:
{context}
"""

_FIX_PROMPT = """\
The following JSON has a structural problem. Fix it and output ONLY the \
corrected JSON object. No markdown fences, no explanation, no preamble.

The JSON must have exactly these top-level keys:
  "verdict" (one of "approve", "request_changes", "comment"),
  "summary" (non-empty string),
  "comments" (non-empty array where each element has "file_path" (string),
  "line_number" (integer or null), "comment_type" (one of "issue",
  "suggestion", "praise", "nitpick"), "body" (string)).

BROKEN JSON:
{broken}

VALIDATION ERROR:
{error}
"""


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_review(data: object) -> tuple[bool, str]:
    """Return (ok, error_message). Validates the Gemini review JSON structure."""
    if not isinstance(data, dict):
        return False, f"response is not a JSON object, got {type(data).__name__}"

    for key in ("verdict", "summary", "comments"):
        if key not in data:
            return False, f"missing required key: {key!r}"

    if data["verdict"] not in _ALLOWED_VERDICTS:
        return False, (
            f"invalid verdict {data['verdict']!r}; "
            f"must be one of {sorted(_ALLOWED_VERDICTS)}"
        )

    if not isinstance(data["summary"], str) or not data["summary"].strip():
        return False, "summary must be a non-empty string"

    if not isinstance(data["comments"], list):
        return False, "comments must be an array"

    if len(data["comments"]) == 0:
        return False, "comments array is empty; at least one comment is required"

    for i, comment in enumerate(data["comments"]):
        if not isinstance(comment, dict):
            return False, f"comment[{i}] is not an object"
        for field in ("file_path", "comment_type", "body"):
            if field not in comment:
                return False, f"comment[{i}] missing required field: {field!r}"
        if comment["comment_type"] not in _ALLOWED_COMMENT_TYPES:
            return False, (
                f"comment[{i}] invalid comment_type {comment['comment_type']!r}; "
                f"must be one of {sorted(_ALLOWED_COMMENT_TYPES)}"
            )
        ln = comment.get("line_number")
        if ln is not None and not isinstance(ln, int):
            return False, (
                f"comment[{i}] line_number must be int or null, "
                f"got {type(ln).__name__}: {ln!r}"
            )

    return True, ""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def generate_review(context_str: str) -> dict:
    """Generate and validate a structured PR review from Gemini.

    Returns a dict with keys: verdict, summary, comments.
    Raises PRReviewGenerationError if both attempts fail validation.
    """
    prompt = _REVIEW_PROMPT.format(context=context_str)

    # Attempt 1
    raw = await llm_generate(prompt, json_mode=True)
    ok, err = _validate_review(raw)

    if ok:
        logger.info(
            "PR review generated on first attempt: verdict=%r, %d comment(s)",
            raw["verdict"], len(raw["comments"]),
        )
        return raw

    logger.warning(
        "PR review failed validation on attempt 1: %s — retrying with fix prompt.", err
    )

    # Attempt 2 — fix prompt
    broken_json = json.dumps(raw, indent=2) if isinstance(raw, (dict, list)) else str(raw)
    fix_prompt = _FIX_PROMPT.format(broken=broken_json, error=err)
    raw2 = await llm_generate(fix_prompt, json_mode=True)
    ok2, err2 = _validate_review(raw2)

    if ok2:
        logger.info("PR review validated after fix prompt.")
        return raw2

    raise PRReviewGenerationError(
        f"PR review generation failed after 2 attempts. "
        f"Attempt 1 error: {err}. Attempt 2 error: {err2}. "
        f"Last output: {str(raw2)[:300]!r}"
    )
