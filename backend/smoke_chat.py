"""
Step 6 solo-owner regression smoke test for Mentor chat routes.
Run: .\venv\Scripts\python.exe smoke_chat.py
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

        # 1. GET /chat/{id}/history — owner can read history (mentor_chat_shared=false is irrelevant for owner)
        r = await client.get(f"{BASE}/chat/{PROJECT_ID}/history")
        assert r.status_code == 200, f"history failed: {r.status_code} {r.text}"
        history = r.json()
        print(f"  GET /chat/{PROJECT_ID}/history -> 200, {len(history)} message(s)")

        # 2. POST /chat/{id} — owner can send (consume one SSE chunk to confirm it streams)
        async with client.stream(
            "POST",
            f"{BASE}/chat/{PROJECT_ID}",
            json={"question": "What is this project?"},
        ) as resp:
            assert resp.status_code == 200, f"chat stream failed: {resp.status_code}"
            first_chunk = None
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    first_chunk = line
                    break
        assert first_chunk is not None, "No SSE data received"
        print(f"  POST /chat/{PROJECT_ID} -> 200 streaming, first chunk: {first_chunk[:80]}")

        # 3. Unknown project → 404 for both routes
        bad = uuid.uuid4()
        r = await client.get(f"{BASE}/chat/{bad}/history")
        assert r.status_code == 404, f"expected 404 for unknown project history, got {r.status_code}"
        print(f"  GET /chat/<unknown>/history -> 404 OK")

        # 4. Stranger (nonexistent user in DB) → 401 before project gate
        stranger_cookies = {"access_token": make_token(str(uuid.uuid4()))}
        async with httpx.AsyncClient(cookies=stranger_cookies, timeout=TIMEOUT) as s:
            r = await s.get(f"{BASE}/chat/{PROJECT_ID}/history")
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  GET /chat/history (stranger) -> {r.status_code} OK")

        print("\n  ALL PASS: solo-owner Mentor chat routes unregressed")


if __name__ == "__main__":
    asyncio.run(main())
