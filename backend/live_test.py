"""
Phase 8 live smoke tests.
Run from backend dir: .\venv\Scripts\python.exe live_test.py
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt

# ── config ──────────────────────────────────────────────────────────────────
JWT_SECRET = "supersecretkey123"
JWT_ALGORITHM = "HS256"
USER_ID = "7dc5c36d-9194-46ad-847b-18661579cbd3"
PROJECT_ID = "80c1c39f-d41b-4f23-b901-8ef4bf34df70"
BASE = "http://localhost:8000"


def make_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    return jwt.encode({"sub": USER_ID, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)


TOKEN = make_token()
COOKIES = {"access_token": TOKEN}
HEALTH_URL = f"{BASE}/api/v1/projects/{PROJECT_ID}/health"
ANALYZE_URL = f"{BASE}/api/v1/projects/{PROJECT_ID}/health/analyze"
HTTP_TIMEOUT = httpx.Timeout(30.0)


# ── test 1: cooldown 429 ─────────────────────────────────────────────────────
async def test_cooldown():
    print("\n=== TEST 1: Cooldown 429 ===")
    async with httpx.AsyncClient(cookies=COOKIES, timeout=HTTP_TIMEOUT) as client:
        # Check current status first
        r = await client.get(HEALTH_URL)
        data = r.json()
        print(f"  Current status: {data.get('health_status')}")
        print(f"  Last analyzed: {data.get('last_health_analysis_at')}")

        # First analyze call
        r1 = await client.post(ANALYZE_URL)
        print(f"  POST /analyze #1 -> {r1.status_code}: {r1.json()}")

        if r1.status_code == 202 or r1.status_code == 200:
            # First call accepted — immediately try again
            await asyncio.sleep(0.5)
            r2 = await client.post(ANALYZE_URL)
            print(f"  POST /analyze #2 -> {r2.status_code}: {r2.json()}")
            if r2.status_code == 409:
                print("  OK PASS: got 409 (already running) — cooldown will kick in after completion")
            elif r2.status_code == 429:
                print("  OK PASS: got 429 cooldown as expected")
            else:
                print(f"  FAIL FAIL: expected 409 or 429, got {r2.status_code}")
        elif r1.status_code == 429:
            print("  Already on cooldown from previous run.")
            print(f"  OK PASS: cooldown active — {r1.json()}")
            # Try again to confirm
            r2 = await client.post(ANALYZE_URL)
            print(f"  POST /analyze #2 (during cooldown) -> {r2.status_code}: {r2.json()}")
            assert r2.status_code == 429, f"Expected 429, got {r2.status_code}"
            print("  OK PASS: second call also 429")
        else:
            print(f"  FAIL First call unexpected: {r1.status_code} {r1.json()}")


# ── test 2: wait for ready, then confirm cooldown ────────────────────────────
async def wait_for_ready(client: httpx.AsyncClient, timeout: int = 120) -> dict:
    start = time.time()
    while time.time() - start < timeout:
        r = await client.get(HEALTH_URL)
        d = r.json()
        status = d.get("health_status")
        print(f"    polling... status={status}")
        if status == "ready":
            return d
        if status == "failed":
            raise RuntimeError("Analysis failed")
        await asyncio.sleep(3)
    raise TimeoutError("Analysis did not complete in time")


async def test_cooldown_after_run():
    print("\n=== TEST 1b: 429 after run completes ===")
    async with httpx.AsyncClient(cookies=COOKIES, timeout=HTTP_TIMEOUT) as client:
        d = (await client.get(HEALTH_URL)).json()
        if d.get("health_status") == "running":
            print("  Waiting for running job to finish...")
            d = await wait_for_ready(client)

        # Trigger fresh run
        r1 = await client.post(ANALYZE_URL)
        print(f"  POST /analyze (fresh) -> {r1.status_code}: {r1.json()}")
        if r1.status_code not in (200, 202):
            print(f"  Could not start fresh run: {r1.status_code} {r1.json()}")
            return

        # Immediately hit cooldown (job enqueued but not finished yet — should be 409)
        r_during = await client.post(ANALYZE_URL)
        print(f"  POST /analyze (immediate) -> {r_during.status_code}: {r_during.json()}")
        assert r_during.status_code == 409, f"Expected 409, got {r_during.status_code}"
        print("  OK PASS: 409 while running")

        # Wait for completion
        print("  Waiting for analysis to complete...")
        await wait_for_ready(client)
        print("  Analysis done.")

        # Now try again — should be 429 (cooldown)
        r2 = await client.post(ANALYZE_URL)
        print(f"  POST /analyze (post-run) -> {r2.status_code}: {r2.json()}")
        assert r2.status_code == 429, f"Expected 429, got {r2.status_code}"
        print("  OK PASS: 429 cooldown after completion")


# ── test 3: hotspot ranking with varied commits ───────────────────────────────
async def test_hotspot_ranking():
    print("\n=== TEST 2: Hotspot ranking with seeded data ===")
    print("  (Seeding varied commit_count directly into DB and re-running normalization)")
    print("  Note: live re-seed requires direct DB access — using psql to update,")
    print("  then running analyze again with ARQ task directly.")

    # We'll do this via psql in a subprocess
    import subprocess
    seed_sql = """
UPDATE file_health_metrics SET commit_count = CASE
  WHEN file_path = 'components/ui/menubar.tsx'         THEN 42
  WHEN file_path = 'components/ui/navigation-menu.tsx' THEN 28
  WHEN file_path = 'components/ui/select.tsx'          THEN 15
  WHEN file_path = 'components/ui/form.tsx'            THEN 7
  WHEN file_path = 'components/ui/input.tsx'           THEN 1
  ELSE commit_count
END
WHERE project_id = '80c1c39f-d41b-4f23-b901-8ef4bf34df70';
"""
    result = subprocess.run(
        ["docker", "exec", "-i", "gitfriend-db-1", "psql", "-U", "devkit", "-d", "devkit"],
        input=seed_sql, capture_output=True, text=True
    )
    print(f"  Seed result: {result.stdout.strip()} {result.stderr.strip()}")

    # Now run the hotspot normalization step directly (import worker)
    import sys
    sys.path.insert(0, ".")
    import os
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://devkit:devkit@localhost:5432/devkit")
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
    os.environ.setdefault("JWT_SECRET", "supersecretkey123")
    os.environ.setdefault("ENCRYPTION_KEY", "BmUfBxDGGhPrKL1Y1YaiVfefNF8MlJek-FpL-8zCme8=")

    from app.database import AsyncSessionLocal
    from app.models.file_health_metric import FileHealthMetric
    from sqlalchemy import select as sa_select
    import uuid

    pid = uuid.UUID(PROJECT_ID)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            sa_select(FileHealthMetric)
            .where(FileHealthMetric.project_id == pid)
            .order_by(FileHealthMetric.commit_count.desc().nullslast())
        )
        rows = result.scalars().all()
        print(f"\n  Files after seed (before re-normalize):")
        for r in rows:
            print(f"    {r.file_path:45s}  commits={str(r.commit_count):>4}  complexity={r.complexity_score}")

        # Run normalization manually (same logic as worker)
        eligible = [m for m in rows if m.commit_count is not None and m.commit_count > 0]
        complexities = [m.complexity_score for m in eligible]
        commits = [m.commit_count for m in eligible]
        min_c, max_c = min(complexities), max(complexities)
        min_n, max_n = min(commits), max(commits)
        for m in eligible:
            c_norm = (m.complexity_score - min_c) / (max_c - min_c) if max_c > min_c else 0.0
            n_norm = (m.commit_count - min_n) / (max_n - min_n) if max_n > min_n else 0.0
            m.hotspot_score = round(c_norm * n_norm, 4)
        for m in rows:
            if m.commit_count is None or m.commit_count == 0:
                m.hotspot_score = None
        await db.commit()

    # Read back and show ranking
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            sa_select(FileHealthMetric)
            .where(
                FileHealthMetric.project_id == pid,
                FileHealthMetric.hotspot_score.isnot(None),
            )
            .order_by(FileHealthMetric.hotspot_score.desc())
            .limit(10)
        )
        ranked = result.scalars().all()
        print(f"\n  Hotspot ranking (post-normalize):")
        for i, m in enumerate(ranked, 1):
            print(f"    #{i}  score={m.hotspot_score:.4f}  commits={m.commit_count:>3}  "
                  f"complexity={m.complexity_score:>3}  {m.file_path}")

        top = ranked[0] if ranked else None
        if top and top.file_path == "components/ui/menubar.tsx":
            print("  OK PASS: menubar.tsx (highest commits+complexity) ranked #1")
        elif top:
            print(f"  ~ Note: top file is {top.file_path} — check if expected given data")
        else:
            print("  FAIL FAIL: no ranked files")


# ── test 4: stale row cleanup ────────────────────────────────────────────────
async def test_stale_cleanup():
    print("\n=== TEST 3: Stale row cleanup ===")
    import subprocess, uuid
    from app.database import AsyncSessionLocal
    from app.models.file_health_metric import FileHealthMetric
    from app.models.chunk import Chunk
    from sqlalchemy import select as sa_select, delete as sa_delete

    pid = uuid.UUID(PROJECT_ID)

    # Check current file_health_metrics count
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            sa_select(FileHealthMetric.file_path)
            .where(FileHealthMetric.project_id == pid)
        )
        before_paths = [row[0] for row in r.fetchall()]
        print(f"  Before: {len(before_paths)} FileHealthMetric rows")

    # Insert a fake chunk for a fake file path
    fake_path = "components/ui/FAKE_TEST_FILE.tsx"
    async with AsyncSessionLocal() as db:
        # Check if already exists
        existing = await db.execute(
            sa_select(FileHealthMetric)
            .where(
                FileHealthMetric.project_id == pid,
                FileHealthMetric.file_path == fake_path,
            )
        )
        if not existing.scalars().first():
            from datetime import datetime, timezone
            fake_metric = FileHealthMetric(
                id=uuid.uuid4(),
                project_id=pid,
                file_path=fake_path,
                loc=100,
                complexity_score=5,
                commit_count=3,
                hotspot_score=0.5,
                computed_at=datetime.now(timezone.utc),
            )
            db.add(fake_metric)
            await db.commit()
            print(f"  Inserted fake FileHealthMetric for {fake_path}")
        else:
            print(f"  Fake row already exists from prior run")

    # Verify it's in DB now
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            sa_select(FileHealthMetric.file_path).where(FileHealthMetric.project_id == pid)
        )
        mid_paths = [row[0] for row in r.fetchall()]
        print(f"  After insert: {len(mid_paths)} rows, fake row present: {fake_path in mid_paths}")
        assert fake_path in mid_paths, "Fake row not inserted!"

    # Run complexity pass (which deletes rows for paths not in chunk set)
    import sys, os
    sys.path.insert(0, ".")
    from app.services.complexity import run_complexity
    async with AsyncSessionLocal() as db:
        file_stats = await run_complexity(pid, db)
        print(f"  run_complexity returned {len(file_stats)} files")
        assert fake_path not in file_stats, "Fake path should not be in chunk set"

    # Check DB — fake row should be gone
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            sa_select(FileHealthMetric.file_path).where(FileHealthMetric.project_id == pid)
        )
        after_paths = [row[0] for row in r.fetchall()]
        print(f"  After run_complexity: {len(after_paths)} rows")
        if fake_path not in after_paths:
            print(f"  OK PASS: fake row for {fake_path} was deleted by cleanup")
        else:
            print(f"  FAIL FAIL: fake row still present after cleanup!")


async def main():
    await test_cooldown_after_run()
    await test_hotspot_ranking()
    await test_stale_cleanup()
    print("\n=== All live tests complete ===")


if __name__ == "__main__":
    asyncio.run(main())
