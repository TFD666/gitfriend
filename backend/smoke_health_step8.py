"""
Step 8 regression smoke test for Repo Health routes after Phase 9 migration.
Run: .\venv\Scripts\python.exe smoke_health_step8.py
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

        # 1. GET /projects/{id}/health — owner can read health results
        r = await client.get(f"{BASE}/projects/{PROJECT_ID}/health")
        assert r.status_code == 200, f"GET health failed: {r.status_code} {r.text}"
        data = r.json()
        assert "hotspots" in data and "stale" in data
        print(f"  GET /health -> 200, hotspots={len(data['hotspots'])}, stale={len(data['stale'])}, status={data['health_status']!r}")

        # 2. POST /projects/{id}/health/analyze — may 409 (already running) or 429 (cooldown) or 200 (queued)
        r = await client.post(f"{BASE}/projects/{PROJECT_ID}/health/analyze")
        assert r.status_code in (200, 409, 429), f"analyze failed: {r.status_code} {r.text}"
        print(f"  POST /health/analyze -> {r.status_code} OK ({r.json()})")

        # 3. Unknown project -> 404
        bad = uuid.uuid4()
        r = await client.get(f"{BASE}/projects/{bad}/health")
        assert r.status_code == 404, f"expected 404 for unknown project, got {r.status_code}"
        print(f"  GET /projects/<unknown>/health -> 404 OK")

        # 4. Stranger -> 401 (nonexistent DB user) or 404 (real second account without access)
        stranger_cookies = {"access_token": make_token(str(uuid.uuid4()))}
        async with httpx.AsyncClient(cookies=stranger_cookies, timeout=TIMEOUT) as s:
            r = await s.get(f"{BASE}/projects/{PROJECT_ID}/health")
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  GET /health (stranger) -> {r.status_code} OK")

            r = await s.post(f"{BASE}/projects/{PROJECT_ID}/health/analyze")
            assert r.status_code in (401, 404), f"expected 401/404 for stranger analyze, got {r.status_code}"
            print(f"  POST /health/analyze (stranger) -> {r.status_code} OK")

        print("\n  ALL PASS: solo-owner Repo Health routes unregressed")


if __name__ == "__main__":
    asyncio.run(main())
