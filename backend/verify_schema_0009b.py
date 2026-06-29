import asyncio
from sqlalchemy import text
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text(
            "SELECT column_name, data_type, is_nullable "
            "FROM information_schema.columns "
            "WHERE table_name = 'projects' AND column_name LIKE 'last_diagram%' "
            "ORDER BY ordinal_position"
        ))
        for row in r.all():
            print(row[0], row[1], "nullable=" + row[2])

asyncio.run(main())
