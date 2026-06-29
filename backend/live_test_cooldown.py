"""
Targeted cooldown test: 409 while running, then 429 after completion.
Run: .\venv\Scripts\python.exe live_test_cooldown.py
"""
import asyncio
import time
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

TOKEN = make_token()
COOKIES = {"access_token": TOKEN}
HEALTH_URL = f"{BASE}/api/v1/projects/{PROJECT_ID}/health"
ANALYZE_URL = f"{BASE}/api/v1/projects/{PROJECT_ID}/health/analyze"
TIMEOUT = httpx.Timeout(30.0)


async def main():
    async with httpx.AsyncClient(cookies=COOKIES, timeout=TIMEOUT) as client:
        # Check current status
        r = await client.get(HEALTH_URL)
        d = r.json()
        status = d.get("health_status")
        last_ran = d.get("last_health_analysis_at")
        print(f"Current status: {status}, last_ran: {last_ran}")

        # Check if still on cooldown
        if last_ran:
            last_dt = datetime.fromisoformat(last_ran.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds() / 60
            print(f"Elapsed since last run: {elapsed:.1f}m (cooldown=10m)")
            if elapsed < 10:
                wait_sec = int((10 - elapsed) * 60) + 2
                print(f"Still on cooldown. Waiting {wait_sec}s...")
                for i in range(wait_sec, 0, -5):
                    print(f"  {i}s remaining...")
                    await asyncio.sleep(min(5, i))

        # --- Call 1: should start the job ---
        print("\n--- Call 1 (expect 200/202) ---")
        r1 = await client.post(ANALYZE_URL)
        print(f"  Status: {r1.status_code}  Body: {r1.json()}")
        assert r1.status_code in (200, 202), f"Expected 200/202, got {r1.status_code}: {r1.json()}"
        print("  PASS: job started")

        # --- Call 2: immediate, expect 409 (already running) ---
        print("\n--- Call 2 immediate (expect 409 running) ---")
        await asyncio.sleep(0.3)
        r2 = await client.post(ANALYZE_URL)
        print(f"  Status: {r2.status_code}  Body: {r2.json()}")
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.json()}"
        print("  PASS: 409 while running")

        # --- Wait for completion ---
        print("\n--- Waiting for analysis to complete ---")
        start = time.time()
        while time.time() - start < 120:
            r = await client.get(HEALTH_URL)
            d = r.json()
            st = d.get("health_status")
            print(f"  polling... {st}")
            if st == "ready":
                print("  Analysis done.")
                break
            if st == "failed":
                raise RuntimeError("Analysis failed!")
            await asyncio.sleep(3)
        else:
            raise TimeoutError("Did not complete in 120s")

        # --- Call 3: post-completion, expect 429 cooldown ---
        print("\n--- Call 3 post-completion (expect 429 cooldown) ---")
        r3 = await client.post(ANALYZE_URL)
        print(f"  Status: {r3.status_code}  Body: {r3.json()}")
        assert r3.status_code == 429, f"Expected 429, got {r3.status_code}: {r3.json()}"
        print("  PASS: 429 cooldown after completion")

        print("\n=== COOLDOWN TEST: ALL PASS ===")


if __name__ == "__main__":
    asyncio.run(main())
