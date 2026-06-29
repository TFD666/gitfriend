"""
Step 4 solo-owner regression smoke test.
Verifies project CRUD routes work identically for the owner after migration.
Run: .\venv\Scripts\python.exe smoke_projects.py
"""
import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt

JWT_SECRET = "supersecretkey123"
JWT_ALGORITHM = "HS256"
USER_ID = "7dc5c36d-9194-46ad-847b-18661579cbd3"
PROJECT_ID = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
BASE = "http://localhost:8000"


def make_token():
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode({"sub": USER_ID, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


COOKIES = {"access_token": make_token()}
TIMEOUT = httpx.Timeout(15.0)


async def main():
    async with httpx.AsyncClient(cookies=COOKIES, timeout=TIMEOUT) as client:

        # 1. GET /projects — list (owner sees their own projects)
        r = await client.get(f"{BASE}/api/v1/projects")
        assert r.status_code == 200, f"list failed: {r.status_code} {r.text}"
        projects = r.json()
        print(f"  GET /projects -> 200, {len(projects)} project(s)")
        assert any(p["id"] == PROJECT_ID for p in projects), "known project missing from list"
        # Verify new fields present in response
        p = next(p for p in projects if p["id"] == PROJECT_ID)
        for field in ("mentor_chat_shared", "career_mode_shared", "repo_health_shared"):
            assert field in p, f"missing field: {field}"
            assert p[field] is False, f"{field} should default false"
        print("    sharing flags present and default false: OK")

        # 2. GET /projects/{id} — owner can read their project
        r = await client.get(f"{BASE}/api/v1/projects/{PROJECT_ID}")
        assert r.status_code == 200, f"get failed: {r.status_code} {r.text}"
        print(f"  GET /projects/{PROJECT_ID} -> 200 OK")

        # 3. GET /projects/{bad-id} — 404 for unknown project
        import uuid
        bad_id = uuid.uuid4()
        r = await client.get(f"{BASE}/api/v1/projects/{bad_id}")
        assert r.status_code == 404, f"expected 404 for unknown project, got {r.status_code}"
        print(f"  GET /projects/<unknown> -> 404 OK")

        # 4. POST /projects/{id}/index — owner can re-index
        r = await client.post(f"{BASE}/api/v1/projects/{PROJECT_ID}/index")
        assert r.status_code == 202, f"reindex failed: {r.status_code} {r.text}"
        print(f"  POST /projects/{PROJECT_ID}/index -> 202 OK")

        # 5. PATCH /projects/{id}/publish — owner can toggle publish
        r = await client.patch(
            f"{BASE}/api/v1/projects/{PROJECT_ID}/publish",
            json={"is_public": False},
        )
        assert r.status_code == 200, f"publish failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["is_public"] is False
        print(f"  PATCH /projects/{PROJECT_ID}/publish -> 200 OK")

        print("\n  ALL PASS: solo-owner project routes unregressed")


if __name__ == "__main__":
    asyncio.run(main())
