"""
Smoke test for icon/color resolver logic.

Exercises all four tiers independently, partial overrides,
determinism of the seeded-random fallback, and the dep extractor.

Run: python smoke_icon_resolver.py
"""
import sys
import uuid

# Make sure app package is importable
sys.path.insert(0, ".")

from app.services.icon_resolver import (
    COLOR_HEX,
    ICON_META,
    VALID_COLORS,
    VALID_ICONS,
    extract_deps_from_chunk_rows,
    resolve_icon_color,
)

PASS = "PASS"
FAIL = "FAIL"
results = []


def check(label, got, expected):
    ok = got == expected
    mark = "OK" if ok else "XX"
    print(f"  {mark} {label}: got={got!r} expected={expected!r}")
    results.append(ok)


# -- Fixture project IDs ------------------------------------------------------
pid_a = uuid.UUID("11111111-1111-1111-1111-111111111111")
pid_b = uuid.UUID("22222222-2222-2222-2222-222222222222")
pid_c = uuid.UUID("33333333-3333-3333-3333-333333333333")

# -- Tier 1: full manual override ---------------------------------------------
print("\nTier 1 -- full override")
r = resolve_icon_color(pid_a, "org/myapp", icon_override="server", color_override="teal", deps=frozenset())
check("icon", r["icon"], "server")
check("color", r["color"], "teal")

# Tier 1: partial icon-only override (color should fall through to stack/keyword/random)
print("\nTier 1 -- partial icon-only override")
r = resolve_icon_color(pid_a, "org/myapp", icon_override="box", color_override=None, deps=frozenset())
check("icon uses override", r["icon"], "box")
assert r["color"] in VALID_COLORS, f"color should be valid, got {r['color']}"
print(f"  OK color is valid random fallback: {r['color']!r}")
results.append(True)

# Tier 1: partial color-only override
print("\nTier 1 -- partial color-only override")
r = resolve_icon_color(pid_a, "org/myapp", icon_override=None, color_override="orange", deps=frozenset())
check("color uses override", r["color"], "orange")
assert r["icon"] in VALID_ICONS
print(f"  OK icon is valid auto-resolved: {r['icon']!r}")
results.append(True)

# -- Tier 2: stack detection --------------------------------------------------
print("\nTier 2 -- React frontend")
r = resolve_icon_color(pid_a, "org/webapp", icon_override=None, color_override=None, deps=frozenset({"react", "react-dom"}))
check("icon", r["icon"], "code-brackets")
check("color", r["color"], "purple")

print("\nTier 2 -- FastAPI backend")
r = resolve_icon_color(pid_a, "org/api", icon_override=None, color_override=None, deps=frozenset({"fastapi", "uvicorn"}))
check("icon", r["icon"], "terminal")
check("color", r["color"], "blue")

print("\nTier 2 -- Express backend")
r = resolve_icon_color(pid_a, "org/api", icon_override=None, color_override=None, deps=frozenset({"express", "cors"}))
check("icon", r["icon"], "server")
check("color", r["color"], "teal")

print("\nTier 2 -- ML/Data")
r = resolve_icon_color(pid_a, "org/model", icon_override=None, color_override=None, deps=frozenset({"torch", "numpy"}))
check("icon", r["icon"], "chart")
check("color", r["color"], "green")

# -- Tier 3: keyword fallback -------------------------------------------------
print("\nTier 3 -- health keyword")
r = resolve_icon_color(pid_a, "org/cancer-screening", icon_override=None, color_override=None, deps=frozenset())
check("icon", r["icon"], "pulse")
check("color", r["color"], "orange")

print("\nTier 3 -- task keyword")
r = resolve_icon_color(pid_a, "org/my-todo-app", icon_override=None, color_override=None, deps=frozenset())
check("icon", r["icon"], "clipboard")
check("color", r["color"], "blue-white")
check("blue-white registered in COLOR_HEX", "blue-white" in COLOR_HEX, True)

# -- Tier 4: seeded-random determinism ----------------------------------------
print("\nTier 4 -- seeded random (determinism)")
r1 = resolve_icon_color(pid_b, "org/unknown", icon_override=None, color_override=None, deps=frozenset())
r2 = resolve_icon_color(pid_b, "org/unknown", icon_override=None, color_override=None, deps=frozenset())
check("deterministic icon", r1["icon"], r2["icon"])
check("deterministic color", r1["color"], r2["color"])
check("icon in valid pool", r1["icon"] in {"folder", "box", "layers", "puzzle-piece"}, True)
check("color NOT blue-white", r1["color"] != "blue-white", True)

r3 = resolve_icon_color(pid_c, "org/unknown", icon_override=None, color_override=None, deps=frozenset())
print(f"  OK pid_b => {r1['icon']}/{r1['color']}, pid_c => {r3['icon']}/{r3['color']} (may differ)")

# -- Dep extractor ------------------------------------------------------------
print("\nDep extractor -- package.json")
pkg_json = '{"dependencies":{"react":"^18","react-dom":"^18"},"devDependencies":{"vite":"^5","eslint":"^8"}}'
deps = extract_deps_from_chunk_rows([("frontend/package.json", pkg_json)])
check("react present", "react" in deps, True)
check("vite present", "vite" in deps, True)

print("\nDep extractor -- requirements.txt")
reqs = "fastapi>=0.110\nuvicorn[standard]\npydantic==2.0\n# a comment\n-r other.txt\n"
deps = extract_deps_from_chunk_rows([("requirements.txt", reqs)])
check("fastapi present", "fastapi" in deps, True)
check("uvicorn present", "uvicorn" in deps, True)
check("pydantic present", "pydantic" in deps, True)

print("\nDep extractor -- pyproject.toml")
pyproject = """
[tool.poetry.dependencies]
python = "^3.11"
torch = ">=2.0"
scikit-learn = "^1.4"
"""
deps = extract_deps_from_chunk_rows([("pyproject.toml", pyproject)])
check("torch present", "torch" in deps, True)
check("scikit-learn present", "scikit-learn" in deps, True)

# -- Registry completeness ----------------------------------------------------
print("\nRegistry completeness")
check("10 icons registered", len(VALID_ICONS), 10)
check("6 colors registered", len(VALID_COLORS), 6)
check("blue-white in VALID_COLORS", "blue-white" in VALID_COLORS, True)

# -- Summary ------------------------------------------------------------------
passed = sum(results)
total  = len(results)
print(f"\n{'='*50}")
print(f"  {PASS if passed == total else FAIL}  {passed}/{total} checks passed")
if passed < total:
    sys.exit(1)
