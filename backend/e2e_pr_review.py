"""
Full end-to-end PR review — no mocking.
PR #4 on Amanlabh/Artyuglandingpage-NEXTJS (4 files, 4178 chars).
"""
import asyncio, httpx, datetime, json, uuid, logging
logging.basicConfig(level=logging.INFO)

import jose.jwt as jwt
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.pr_review import PRReview, PRReviewComment
from app.workers.pr_review import run_pr_review

PROJECT_ID = '80c1c39f-d41b-4f23-b901-8ef4bf34df70'
PR_NUMBER  = 4
BASE = 'http://localhost:8000/api/v1'


async def get_token():
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(User).where(User.github_username == 'TFD666')
        )).scalars().first()
        payload = {
            'sub': str(user.id),
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm='HS256')


async def main():
    token = await get_token()

    print('\n' + '='*60)
    print(f'E2E test — real Gemini — project={PROJECT_ID} PR#{PR_NUMBER}')
    print('='*60 + '\n')

    # Clear old runs for clean state
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(
            select(PRReview).where(
                PRReview.project_id == uuid.UUID(PROJECT_ID),
                PRReview.pr_number  == PR_NUMBER,
            )
        )).scalars().all()
        for r in existing:
            await db.delete(r)
        await db.commit()
    print('[SETUP] Cleared existing runs.\n')

    print('Running worker...')
    await run_pr_review({}, PROJECT_ID, PR_NUMBER)

    # Check DB
    async with AsyncSessionLocal() as db:
        reviews = (await db.execute(
            select(PRReview).where(
                PRReview.project_id == uuid.UUID(PROJECT_ID),
                PRReview.pr_number  == PR_NUMBER,
            ).order_by(PRReview.run_number.desc())
        )).scalars().all()

        if not reviews:
            print('\nFAIL: No PRReview rows found — worker likely hit Gemini error.')
            return

        review = reviews[0]
        comments = (await db.execute(
            select(PRReviewComment).where(PRReviewComment.review_id == review.id)
        )).scalars().all()

    print('\n' + '='*60)
    print('STORED REVIEW')
    print('='*60)
    print(f'run_number : {review.run_number}')
    print(f'pr_title   : {review.pr_title}')
    print(f'pr_author  : {review.pr_author}')
    print(f'verdict    : {review.verdict}')
    print(f'reviewed_at: {review.reviewed_at}')
    print(f'\nSUMMARY:\n{review.summary}')
    print(f'\nCOMMENTS ({len(comments)}):')
    for i, c in enumerate(comments, 1):
        print(f'\n  [{i}] type={c.comment_type}  file={c.file_path}  line={c.line_number}')
        print(f'      {c.body}')

    # Verify via API
    print('\n' + '='*60)
    print('API VERIFICATION')
    print('='*60)
    async with httpx.AsyncClient(cookies={'access_token': token}, timeout=30) as client:
        r = await client.get(f'{BASE}/projects/{PROJECT_ID}/pr-reviews/{PR_NUMBER}')
        print(f'GET /pr-reviews/{PR_NUMBER}: {r.status_code}')
        data = r.json()
        newest = data[0]
        print(f'run={newest["run_number"]} verdict={newest["verdict"]} comments={len(newest["comments"])}')

    print('\nPASS')


asyncio.run(main())
