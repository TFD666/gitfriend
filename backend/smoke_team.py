"""
Step 5 team endpoints smoke test — owner account only (second account TBD).
Tests all endpoints reachable from a single account: roster, sharing settings,
invite (expect 400 since no second account exists yet), /me/invites.
Run: .\venv\Scripts\python.exe smoke_team.py
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
TIMEOUT = httpx.Timeout(15.0)


async def main():
    async with httpx.AsyncClient(cookies=COOKIES, timeout=TIMEOUT) as client:

        # 1. GET /projects/{id}/team — owner sees roster (empty members list)
        r = await client.get(f"{BASE}/projects/{PROJECT_ID}/team")
        assert r.status_code == 200, f"roster failed: {r.status_code} {r.text}"
        roster = r.json()
        assert "owner" in roster and "members" in roster
        assert roster["owner"]["id"] == USER_ID
        print(f"  GET /team -> 200, owner={roster['owner']['github_username']}, members={len(roster['members'])}")

        # 2. PATCH /projects/{id}/settings/sharing — toggle flags
        r = await client.patch(
            f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
            json={"mentor_chat_shared": True, "career_mode_shared": False, "repo_health_shared": True},
        )
        assert r.status_code == 200, f"sharing failed: {r.status_code} {r.text}"
        flags = r.json()
        assert flags["mentor_chat_shared"] is True
        assert flags["career_mode_shared"] is False
        assert flags["repo_health_shared"] is True
        print(f"  PATCH /settings/sharing -> 200, flags={flags}")

        # Reset sharing to all-false
        r = await client.patch(
            f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
            json={"mentor_chat_shared": False, "career_mode_shared": False, "repo_health_shared": False},
        )
        assert r.status_code == 200
        print(f"  PATCH /settings/sharing (reset) -> 200 OK")

        # 3. POST /team/invite with nonexistent username -> 400 (not a shadow user)
        r = await client.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": "definitely_not_a_real_devkit_user_xyz999", "role": "editor"},
        )
        assert r.status_code == 400, f"expected 400 for unknown user, got {r.status_code} {r.text}"
        assert "No account found" in r.json()["detail"]
        print(f"  POST /team/invite (unknown username) -> 400 OK: {r.json()['detail'][:60]}")

        # 4. POST /team/invite with invalid role -> 400
        r = await client.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": "TFD666", "role": "superadmin"},
        )
        assert r.status_code == 400, f"expected 400 for invalid role, got {r.status_code}"
        print(f"  POST /team/invite (invalid role) -> 400 OK")

        # 5. POST /team/invite self-invite -> 400 (owner is project owner)
        r = await client.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": "TFD666", "role": "editor"},
        )
        assert r.status_code == 400, f"expected 400 for self-invite, got {r.status_code} {r.text}"
        assert "owner" in r.json()["detail"].lower()
        print(f"  POST /team/invite (self as owner) -> 400 OK: {r.json()['detail']}")

        # 6. GET /me/invites — owner has no pending invites
        r = await client.get(f"{BASE}/me/invites")
        assert r.status_code == 200, f"me/invites failed: {r.status_code} {r.text}"
        assert r.json() == []
        print(f"  GET /me/invites -> 200, [] (no pending invites for owner)")

        # 7. Non-owner accessing owner-only endpoint -> 404
        stranger_token = make_token(str(uuid.uuid4()))
        async with httpx.AsyncClient(
            cookies={"access_token": stranger_token}, timeout=TIMEOUT
        ) as stranger:
            r = await stranger.patch(
                f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
                json={"mentor_chat_shared": True, "career_mode_shared": True, "repo_health_shared": True},
            )
            # 401 when JWT user doesn't exist in DB; 404 when they exist but lack access.
            # Both are correct access-denial outcomes — real second-account test gets 404.
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  PATCH /settings/sharing (stranger) -> {r.status_code} OK")

            r = await stranger.get(f"{BASE}/projects/{PROJECT_ID}/team")
            assert r.status_code in (401, 404), f"expected 401/404 for stranger, got {r.status_code}"
            print(f"  GET /team (stranger) -> {r.status_code} OK")

        print("\n  ALL PASS: team endpoints working (second-account tests pending)")


if __name__ == "__main__":
    asyncio.run(main())
