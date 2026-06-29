import asyncio, uuid, sys
from app.database import AsyncSessionLocal
from app.services.diagram_context import build_system_context
from app.services.diagram import generate_diagram, validate_mermaid

async def main():
    async with AsyncSessionLocal() as db:
        ctx = await build_system_context(
            uuid.UUID('80c1c39f-d41b-4f23-b901-8ef4bf34df70'),
            'Amanlabh/Artyuglandingpage-NEXTJS', db
        )
    try:
        src = await generate_diagram('system_architecture', ctx)
        ok, err = validate_mermaid(src)
        print('=== RAW OUTPUT ===')
        print(src)
        print()
        print('VALIDATION:', 'PASS' if ok else f'FAIL: {err}')
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(1)

asyncio.run(main())
