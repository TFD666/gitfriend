"""
Step 13 full team-mode smoke test — two accounts required.
Account 1 (owner): TFD666        7dc5c36d-9194-46ad-847b-18661579cbd3
Account 2 (member): miscellaneous69-star  26bee00b-26a5-4c0a-92d1-937e0fc04c8b

Run: .\venv\Scripts\python.exe smoke_step13.py
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt

JWT_SECRET = "supersecretkey123"
JWT_ALGORITHM = "HS256"

OWNER_ID     = "7dc5c36d-9194-46ad-847b-18661579cbd3"
MEMBER_ID    = "26bee00b-26a5-4c0a-92d1-937e0fc04c8b"
MEMBER_NAME  = "miscellaneous69-star"
PROJECT_ID   = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
BASE         = "http://localhost:8000/api/v1"

TIMEOUT = httpx.Timeout(30.0)


def token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def owner_client():
    return httpx.AsyncClient(cookies={"access_token": token(OWNER_ID)}, timeout=TIMEOUT)

def member_client():
    return httpx.AsyncClient(cookies={"access_token": token(MEMBER_ID)}, timeout=TIMEOUT)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ok(label, r, expected):
    assert r.status_code == expected, f"{label}: expected {expected}, got {r.status_code} — {r.text[:200]}"
    print(f"  {label} -> {r.status_code} OK")

def ok_any(label, r, *expected):
    assert r.status_code in expected, f"{label}: expected {expected}, got {r.status_code} — {r.text[:200]}"
    print(f"  {label} -> {r.status_code} OK")


async def cleanup_member():
    """Remove any existing TeamMember row for account 2 on this project before test."""
    from sqlalchemy import delete
    from app.database import AsyncSessionLocal
    from app.models.team_member import TeamMember
    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(TeamMember).where(
                TeamMember.project_id == uuid.UUID(PROJECT_ID),
                TeamMember.user_id == uuid.UUID(MEMBER_ID),
            )
        )
        await db.commit()


async def reset_sharing_flags(all_off=True):
    """Set all sharing flags to false (or true) via API."""
    async with owner_client() as c:
        val = not all_off
        await c.patch(
            f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
            json={"mentor_chat_shared": val, "career_mode_shared": val, "repo_health_shared": val},
        )


async def main():
    print("\n=== Step 13 Full Team Smoke Test ===\n")

    # -----------------------------------------------------------------------
    # Setup: clean slate
    # -----------------------------------------------------------------------
    await cleanup_member()
    await reset_sharing_flags(all_off=True)
    print("[setup] member row cleaned, sharing flags all off\n")

    # -----------------------------------------------------------------------
    # 1. Invite account 2 as editor
    # -----------------------------------------------------------------------
    print("--- 1. Invite ---")
    async with owner_client() as c:
        r = await c.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": MEMBER_NAME, "role": "editor"},
        )
        ok("invite editor", r, 201)
        invite_data = r.json()
        member_row_id = invite_data["id"]
        assert invite_data["status"] == "pending"
        assert invite_data["role"] == "editor"
        print(f"    member_row_id={member_row_id}")

    # -----------------------------------------------------------------------
    # 2. Account 2 sees the invite in /me/invites
    # -----------------------------------------------------------------------
    print("\n--- 2. Invites inbox ---")
    async with member_client() as c:
        r = await c.get(f"{BASE}/me/invites")
        ok("GET /me/invites", r, 200)
        invites = r.json()
        assert any(i["team_member_id"] == member_row_id for i in invites), \
            f"invite not in inbox: {invites}"
        print(f"    {len(invites)} pending invite(s) visible")

    # -----------------------------------------------------------------------
    # 3. Account 2 accepts
    # -----------------------------------------------------------------------
    print("\n--- 3. Accept invite ---")
    async with member_client() as c:
        r = await c.post(f"{BASE}/invites/{member_row_id}/accept")
        ok("accept invite", r, 200)
        accepted = r.json()
        assert accepted["status"] == "active"
        print(f"    status={accepted['status']}, role={accepted['role']}")

    # -----------------------------------------------------------------------
    # 4. Account 2 sees project in /projects list
    # -----------------------------------------------------------------------
    print("\n--- 4. Shared project in dashboard ---")
    async with member_client() as c:
        r = await c.get(f"{BASE}/projects")
        ok("GET /projects (member)", r, 200)
        projects = r.json()
        shared = [p for p in projects if p["id"] == PROJECT_ID]
        assert shared, "shared project not in member's project list"
        p = shared[0]
        assert p["user_id"] == OWNER_ID, "user_id should be owner's"
        print(f"    project visible: {p['github_repo_full_name']} (user_id={p['user_id'][:8]}…)")

    # -----------------------------------------------------------------------
    # 5. Sharing flags all off → member gets 404 on all features
    # -----------------------------------------------------------------------
    print("\n--- 5. All sharing flags off -> 404 on features ---")
    async with member_client() as c:
        r = await c.get(f"{BASE}/chat/{PROJECT_ID}/history")
        ok("GET /chat/history (flags off)", r, 404)

        r = await c.get(f"{BASE}/career/{PROJECT_ID}")
        ok("GET /career (flags off)", r, 404)

        r = await c.get(f"{BASE}/projects/{PROJECT_ID}/health")
        ok("GET /health (flags off)", r, 404)

    # -----------------------------------------------------------------------
    # 6. Enable mentor_chat_shared → editor can read + send
    # -----------------------------------------------------------------------
    print("\n--- 6. mentor_chat_shared=true -> editor read+write ---")
    async with owner_client() as c:
        r = await c.patch(
            f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
            json={"mentor_chat_shared": True, "career_mode_shared": False, "repo_health_shared": False},
        )
        ok("enable mentor_chat_shared", r, 200)

    async with member_client() as c:
        r = await c.get(f"{BASE}/chat/{PROJECT_ID}/history")
        ok("GET /chat/history (editor, flag on)", r, 200)

        # POST (editor can send)
        async with c.stream(
            "POST",
            f"{BASE}/chat/{PROJECT_ID}",
            json={"question": "What is this project?"},
        ) as resp:
            assert resp.status_code == 200, f"editor chat stream failed: {resp.status_code}"
            first = None
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    first = line
                    break
        assert first is not None
        print(f"  POST /chat (editor) -> 200 streaming OK, first chunk: {first[:60]}")

        # career + health still 404 (flags still off)
        r = await c.get(f"{BASE}/career/{PROJECT_ID}")
        ok("GET /career (flag still off)", r, 404)
        r = await c.get(f"{BASE}/projects/{PROJECT_ID}/health")
        ok("GET /health (flag still off)", r, 404)

    # -----------------------------------------------------------------------
    # 7. Invite a viewer (re-invite same account after removing, as viewer)
    # -----------------------------------------------------------------------
    print("\n--- 7. Viewer role -> read-only mentor_chat ---")
    # Remove editor first
    async with owner_client() as c:
        r = await c.delete(f"{BASE}/projects/{PROJECT_ID}/team/{member_row_id}")
        ok("owner removes editor", r, 204)

    # Re-invite as viewer
    async with owner_client() as c:
        r = await c.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": MEMBER_NAME, "role": "viewer"},
        )
        ok("invite viewer", r, 201)
        viewer_row_id = r.json()["id"]

    # Accept as viewer
    async with member_client() as c:
        r = await c.post(f"{BASE}/invites/{viewer_row_id}/accept")
        ok("accept viewer invite", r, 200)
        assert r.json()["role"] == "viewer"

    async with member_client() as c:
        # Viewer CAN read history
        r = await c.get(f"{BASE}/chat/{PROJECT_ID}/history")
        ok("GET /chat/history (viewer, flag on)", r, 200)

        # Viewer CANNOT send (editor required)
        async with c.stream(
            "POST",
            f"{BASE}/chat/{PROJECT_ID}",
            json={"question": "hello"},
        ) as resp:
            ok_any("POST /chat (viewer blocked)", resp, 404)

    # -----------------------------------------------------------------------
    # 8. Editor/viewer blocked from owner-only endpoints
    # -----------------------------------------------------------------------
    print("\n--- 8. Non-owner blocked from team management ---")
    async with member_client() as c:
        r = await c.patch(
            f"{BASE}/projects/{PROJECT_ID}/settings/sharing",
            json={"mentor_chat_shared": True, "career_mode_shared": True, "repo_health_shared": True},
        )
        ok("PATCH /settings/sharing (viewer blocked)", r, 404)

        r = await c.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": "someoneelse", "role": "viewer"},
        )
        ok("POST /team/invite (viewer blocked)", r, 404)

        r = await c.post(f"{BASE}/projects/{PROJECT_ID}/index")
        ok("POST /index (viewer blocked, editor req)", r, 404)

    # -----------------------------------------------------------------------
    # 9. Member leaves project themselves
    # -----------------------------------------------------------------------
    print("\n--- 9. Member self-remove ---")
    async with member_client() as c:
        r = await c.delete(f"{BASE}/projects/{PROJECT_ID}/team/{viewer_row_id}")
        ok("member self-remove (DELETE /team/{id})", r, 204)

    # Access revoked immediately
    async with member_client() as c:
        r = await c.get(f"{BASE}/chat/{PROJECT_ID}/history")
        ok("GET /chat/history after self-remove -> 404", r, 404)

        r = await c.get(f"{BASE}/projects")
        projects = r.json()
        assert not any(p["id"] == PROJECT_ID for p in projects), \
            "project still visible after self-remove"
        print(f"  project absent from member's list after self-remove OK")

    # -----------------------------------------------------------------------
    # 10. Invite unknown username -> clear error, no shadow user
    # -----------------------------------------------------------------------
    print("\n--- 10. Invite unknown username ---")
    async with owner_client() as c:
        r = await c.post(
            f"{BASE}/projects/{PROJECT_ID}/team/invite",
            json={"github_username": "totally_nonexistent_xyz_12345", "role": "viewer"},
        )
        ok("invite unknown user -> 400", r, 400)
        assert "No account found" in r.json()["detail"]
        print(f"    detail: {r.json()['detail'][:70]}")

    # -----------------------------------------------------------------------
    # Cleanup
    # -----------------------------------------------------------------------
    await reset_sharing_flags(all_off=True)
    print("\n[cleanup] sharing flags reset to all-off")

    print("\n=== ALL PASS: Full Phase 9 Step 13 smoke test complete ===\n")


if __name__ == "__main__":
    asyncio.run(main())
