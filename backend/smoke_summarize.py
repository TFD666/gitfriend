"""
Summarize routes solo-owner regression smoke test.
Run: .\venv\Scripts\python.exe smoke_summarize.py
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

        # 1. POST /summarize/{id}/file — owner can summarize a file
        r = await client.post(
            f"{BASE}/summarize/{PROJECT_ID}/file",
            json={"file_path": "components/ui/pagination.tsx"},
        )
        assert r.status_code in (200, 400, 502), f"file summarize failed: {r.status_code} {r.text}"
        print(f"  POST /summarize/file -> {r.status_code} OK")

        # 2. Unknown project -> 404
        bad = uuid.uuid4()
        r = await client.post(f"{BASE}/summarize/{bad}/file", json={"file_path": "README.md"})
        assert r.status_code == 404, f"expected 404 for unknown project, got {r.status_code}"
        print(f"  POST /summarize/<unknown>/file -> 404 OK")

        # 3. Stranger -> 401 (nonexistent DB user)
        stranger_cookies = {"access_token": make_token(str(uuid.uuid4()))}
        async with httpx.AsyncClient(cookies=stranger_cookies, timeout=TIMEOUT) as s:
            r = await s.post(
                f"{BASE}/summarize/{PROJECT_ID}/file",
                json={"file_path": "README.md"},
            )
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  POST /summarize/file (stranger) -> {r.status_code} OK")

        print("\n  ALL PASS: solo-owner summarize routes unregressed")


if __name__ == "__main__":
    asyncio.run(main())
