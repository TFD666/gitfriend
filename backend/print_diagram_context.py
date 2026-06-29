"""
Step 3 gate: print actual context strings for both diagram types.
Run: .\venv\Scripts\python.exe print_diagram_context.py
"""
import asyncio
import uuid

from app.database import AsyncSessionLocal
from app.services.diagram_context import build_system_context, build_dependency_context

PROJECT_ID = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
REPO_NAME  = "Amanlabh/Artyuglandingpage-NEXTJS"
DIVIDER    = "\n" + "=" * 70 + "\n"


async def main():
    async with AsyncSessionLocal() as db:
        print(DIVIDER)
        print("SYSTEM ARCHITECTURE CONTEXT")
        print(DIVIDER)
        sys_ctx = await build_system_context(uuid.UUID(PROJECT_ID), REPO_NAME, db)
        # Print first 3000 chars so it's readable without flooding terminal
        print(sys_ctx[:3000])
        if len(sys_ctx) > 3000:
            print(f"\n... [{len(sys_ctx) - 3000} more chars truncated] ...")
        print(f"\n[TOTAL LENGTH: {len(sys_ctx)} chars]")

        print(DIVIDER)
        print("DEPENDENCY GRAPH CONTEXT")
        print(DIVIDER)
        dep_ctx = await build_dependency_context(uuid.UUID(PROJECT_ID), REPO_NAME, db)
        print(dep_ctx[:3000])
        if len(dep_ctx) > 3000:
            print(f"\n... [{len(dep_ctx) - 3000} more chars truncated] ...")
        print(f"\n[TOTAL LENGTH: {len(dep_ctx)} chars]")


if __name__ == "__main__":
    asyncio.run(main())
