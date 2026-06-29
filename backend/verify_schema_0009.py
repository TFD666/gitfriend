import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text(
            "SELECT column_name, data_type, is_nullable "
            "FROM information_schema.columns "
            "WHERE table_name = 'diagram_artifacts' "
            "ORDER BY ordinal_position"
        ))
        print("diagram_artifacts:")
        for row in r.all():
            print(f"  {row[0]:30s} {row[1]:20s} nullable={row[2]}")

        r = await db.execute(text(
            "SELECT column_name, data_type, is_nullable, column_default "
            "FROM information_schema.columns "
            "WHERE table_name = 'projects' AND column_name LIKE 'diagram%' "
            "ORDER BY ordinal_position"
        ))
        print("projects (diagram* cols):")
        for row in r.all():
            print(f"  {row[0]:35s} {row[1]:15s} nullable={row[2]} default={row[3]}")

        r = await db.execute(text(
            "SELECT conname, contype FROM pg_constraint "
            "WHERE conrelid = 'diagram_artifacts'::regclass "
            "ORDER BY conname"
        ))
        print("diagram_artifacts constraints:")
        for row in r.all():
            kind = {"p": "PK", "u": "UNIQUE", "c": "CHECK", "f": "FK"}.get(row[1], row[1])
            print(f"  {row[0]} ({kind})")

asyncio.run(main())
