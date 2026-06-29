"""
Step 7 solo-owner regression smoke test for Career mode routes.
Run: .\venv\Scripts\python.exe smoke_career.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt

JWT_SECRET = "supersecretkey123"
JWT_ALGORITHM = "HS256"
USER_ID = "7dc5c36d-9194-46ad-847b-18661579cbd3"
PROJECT_ID = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
BASE = "http://localhost:8000/api/v1"


def make_token(user_id: str = USER_ID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode({"sub": user_id, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


COOKIES = {"access_token": make_token()}
TIMEOUT = httpx.Timeout(30.0)


async def main():
    async with httpx.AsyncClient(cookies=COOKIES, timeout=TIMEOUT) as client:

        # 1. GET /career/{id} — owner lists artifacts (may be empty)
        r = await client.get(f"{BASE}/career/{PROJECT_ID}")
        assert r.status_code == 200, f"list artifacts failed: {r.status_code} {r.text}"
        artifacts = r.json()
        print(f"  GET /career/{PROJECT_ID} -> 200, {len(artifacts)} artifact(s)")

        # 2. GET /career/{id}/portfolio — 404 if not generated yet (not a permissions error)
        r = await client.get(f"{BASE}/career/{PROJECT_ID}/portfolio")
        assert r.status_code in (200, 404), f"get artifact failed: {r.status_code} {r.text}"
        print(f"  GET /career/{PROJECT_ID}/portfolio -> {r.status_code} OK")

        # 3. GET /career/<unknown> — 404 for unknown project
        bad = uuid.uuid4()
        r = await client.get(f"{BASE}/career/{bad}")
        assert r.status_code == 404, f"expected 404 for unknown project, got {r.status_code}"
        print(f"  GET /career/<unknown> -> 404 OK")

        # 4. Stranger -> 401 (nonexistent DB user)
        stranger_cookies = {"access_token": make_token(str(uuid.uuid4()))}
        async with httpx.AsyncClient(cookies=stranger_cookies, timeout=TIMEOUT) as s:
            r = await s.get(f"{BASE}/career/{PROJECT_ID}")
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  GET /career (stranger) -> {r.status_code} OK")

        print("\n  ALL PASS: solo-owner Career mode routes unregressed")


if __name__ == "__main__":
    asyncio.run(main())
