"""
Step 4 gate: call Gemini with real context, print raw Mermaid output + validation.
Run: .\venv\Scripts\python.exe print_diagram_gemini.py
"""
import asyncio
import uuid

from app.database import AsyncSessionLocal
from app.services.diagram_context import build_system_context, build_dependency_context
from app.services.diagram import generate_diagram, validate_mermaid

PROJECT_ID = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
REPO_NAME  = "Amanlabh/Artyuglandingpage-NEXTJS"
DIVIDER    = "\n" + "=" * 70 + "\n"


async def run_one(label: str, diagram_type: str, context: str) -> None:
    print(DIVIDER)
    print(f"DIAGRAM TYPE: {label}")
    print(DIVIDER)
    print(f"[context length: {len(context)} chars]")
    print()
    try:
        source = await generate_diagram(diagram_type, context)
        ok, err = validate_mermaid(source)
        print("=== RAW MERMAID OUTPUT ===")
        print(source)
        print()
        print(f"=== VALIDATION: {'PASS' if ok else 'FAIL'} ===")
        if not ok:
            print(f"Error: {err}")
    except Exception as e:
        print(f"ERROR: {e}")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        pid = uuid.UUID(PROJECT_ID)
        sys_ctx = await build_system_context(pid, REPO_NAME, db)
        dep_ctx = await build_dependency_context(pid, REPO_NAME, db)

    # Run sequentially so output is readable
    await run_one("system_architecture", "system_architecture", sys_ctx)
    await run_one("dependency_graph", "dependency_graph", dep_ctx)


if __name__ == "__main__":
    asyncio.run(main())
