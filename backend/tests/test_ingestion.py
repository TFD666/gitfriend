"""
Pure unit tests for ingestion chunking helpers.
No DB, no network, no async — just in-memory function calls.
"""
import pytest

from app.services.ingestion import (
    _MIN_CHUNK_LINES,
    _WINDOW_OVERLAP,
    _WINDOW_SIZE,
    _FileChunk,
    _chunk_file,
    _regex_split,
    _sliding_window,
)


# ---------------------------------------------------------------------------
# _sliding_window
# ---------------------------------------------------------------------------

class TestSlidingWindow:
    def test_short_content_single_chunk(self):
        lines = [f"line {i}\n" for i in range(10)]
        result = _sliding_window(lines)
        assert len(result) == 1
        start, end, text = result[0]
        assert start == 1
        assert end == 10
        assert "line 0" in text

    def test_line_numbers_one_indexed(self):
        lines = [f"line {i}\n" for i in range(20)]
        result = _sliding_window(lines)
        assert result[0][0] == 1  # first chunk starts at line 1

    def test_multiple_windows_with_overlap(self):
        # Content longer than one window
        total_lines = _WINDOW_SIZE + 50
        lines = [f"line {i}\n" for i in range(total_lines)]
        result = _sliding_window(lines)

        assert len(result) >= 2

        # Second window starts at WINDOW_SIZE - WINDOW_OVERLAP + 1
        expected_second_start = (_WINDOW_SIZE - _WINDOW_OVERLAP) + 1
        assert result[1][0] == expected_second_start

    def test_first_window_spans_window_size_lines(self):
        # Exactly _WINDOW_SIZE lines: produces 2 windows (step < WINDOW_SIZE due to overlap)
        lines = [f"x\n" for _ in range(_WINDOW_SIZE)]
        result = _sliding_window(lines)
        assert len(result) >= 1
        start, end, _ = result[0]
        assert start == 1
        assert end == _WINDOW_SIZE

    def test_below_min_chunk_lines_excluded(self):
        # Fewer lines than _MIN_CHUNK_LINES → nothing returned
        lines = [f"x\n" for _ in range(_MIN_CHUNK_LINES - 1)]
        result = _sliding_window(lines)
        assert result == []

    def test_exactly_min_chunk_lines_included(self):
        lines = [f"x\n" for _ in range(_MIN_CHUNK_LINES)]
        result = _sliding_window(lines)
        assert len(result) == 1

    def test_empty_input(self):
        assert _sliding_window([]) == []


# ---------------------------------------------------------------------------
# _regex_split
# ---------------------------------------------------------------------------

class TestRegexSplit:
    _PY_PATTERN = r"^(def |class )"

    def test_python_functions_split_at_def(self):
        # Each function body must be >= _MIN_CHUNK_LINES to survive the filter
        body = "    pass\n" * _MIN_CHUNK_LINES
        content = (
            "def foo():\n" + body +
            "def bar():\n" + body
        )
        result = _regex_split(content, self._PY_PATTERN)
        assert result is not None
        texts = [text for _, _, text in result]
        assert any("def foo" in t for t in texts)
        assert any("def bar" in t for t in texts)

    def test_no_matches_returns_none(self):
        content = "x = 1\ny = 2\nz = 3\n"
        result = _regex_split(content, self._PY_PATTERN)
        assert result is None

    def test_header_block_before_first_match_included(self):
        # Header must be >= _MIN_CHUNK_LINES to survive the filter
        header = "# line\n" * _MIN_CHUNK_LINES
        content = header + "def foo():\n" + "    pass\n" * _MIN_CHUNK_LINES
        result = _regex_split(content, self._PY_PATTERN)
        assert result is not None
        all_text = "".join(t for _, _, t in result)
        assert "# line" in all_text  # header content present somewhere in results

    def test_below_min_lines_chunks_excluded(self):
        # A match that produces only 1 line before the next match is filtered out
        content = "def a():\n" + "def b():\n" + "    pass\n" * 5
        result = _regex_split(content, self._PY_PATTERN)
        # 'def a():' alone is 1 line — below _MIN_CHUNK_LINES, should be filtered
        if result is not None:
            for start, end, _ in result:
                assert (end - start + 1) >= _MIN_CHUNK_LINES

    def test_returns_none_when_all_chunks_below_min(self):
        # All matches produce tiny chunks
        content = "def a():\ndef b():\ndef c():\n"
        result = _regex_split(content, self._PY_PATTERN)
        # All produced chunks are < _MIN_CHUNK_LINES → returns None to trigger fallback
        assert result is None

    def test_line_numbers_correct(self):
        header = "import os\n"  # line 1
        func = "def foo():\n" + "    pass\n" * 9  # lines 2-11
        content = header + func
        result = _regex_split(content, self._PY_PATTERN)
        assert result is not None
        func_chunk = next((r for r in result if "def foo" in r[2]), None)
        assert func_chunk is not None
        start, end, _ = func_chunk
        assert start == 2  # def foo starts on line 2


# ---------------------------------------------------------------------------
# _chunk_file
# ---------------------------------------------------------------------------

class TestChunkFile:
    def test_python_file_uses_regex_split(self):
        content = (
            "import os\n\n"
            "def alpha():\n" + "    x = 1\n" * 8 +
            "\ndef beta():\n" + "    y = 2\n" * 8
        )
        chunks = _chunk_file("module.py", content)
        assert len(chunks) >= 1
        # All are _FileChunk instances
        assert all(isinstance(c, _FileChunk) for c in chunks)

    def test_unknown_extension_uses_sliding_window(self):
        lines = [f"line {i}\n" for i in range(200)]
        content = "".join(lines)
        chunks = _chunk_file("data.unknown", content)
        assert len(chunks) >= 1

    def test_language_detected_from_extension(self):
        content = "def foo():\n" + "    pass\n" * 10
        chunks = _chunk_file("app.py", content)
        assert all(c.language == "python" for c in chunks)

    def test_unknown_extension_language_is_none(self):
        content = "hello world\n" * 20
        chunks = _chunk_file("file.xyz", content)
        assert all(c.language is None for c in chunks)

    def test_js_extension_detected(self):
        content = "function foo() {\n" + "  return 1;\n" * 10 + "}\n"
        chunks = _chunk_file("index.js", content)
        assert all(c.language == "javascript" for c in chunks)

    def test_chunk_start_end_lines_positive(self):
        content = "x = 1\n" * 200
        chunks = _chunk_file("config.py", content)
        for c in chunks:
            assert c.start_line >= 1
            assert c.end_line >= c.start_line

    def test_empty_file_returns_no_chunks(self):
        chunks = _chunk_file("empty.py", "")
        assert chunks == []

    def test_tiny_file_below_min_lines(self):
        content = "x = 1\n" * (_MIN_CHUNK_LINES - 1)
        chunks = _chunk_file("small.py", content)
        assert chunks == []
