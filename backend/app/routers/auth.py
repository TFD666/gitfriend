import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.github import exchange_code_for_token, get_authenticated_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"


class MeResponse(BaseModel):
    id: uuid.UUID
    github_username: str
    avatar_url: str


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=current_user.id,
        github_username=current_user.github_username,
        avatar_url=f"https://github.com/{current_user.github_username}.png",
    )


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(
        "access_token",
        httponly=True,
        samesite="lax",
    )
    return {"ok": True}
_SCOPES = "repo user:email"


def _create_jwt(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


@router.get("/github/authorize")
async def github_authorize() -> RedirectResponse:
    state = secrets.token_urlsafe(32)
    redirect = RedirectResponse(
        f"{_GITHUB_AUTHORIZE_URL}"
        f"?client_id={settings.github_client_id}"
        f"&scope={_SCOPES}"
        f"&state={state}"
    )
    # short-lived state cookie for CSRF verification in callback
    redirect.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=300,
    )
    return redirect


@router.get("/github/callback")
async def github_callback(
    code: str,
    state: str,
    oauth_state: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    if not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    access_token = await exchange_code_for_token(code)
    github_user = await get_authenticated_user(access_token)

    result = await db.execute(
        select(User).where(User.github_id == github_user["id"])
    )
    user: User | None = result.scalar_one_or_none()

    if user:
        user.github_username = github_user["login"]
        user.email = github_user.get("email")
        user.set_github_token(access_token, settings.encryption_key)
    else:
        user = User(
            github_id=github_user["id"],
            github_username=github_user["login"],
            email=github_user.get("email"),
        )
        user.set_github_token(access_token, settings.encryption_key)
        db.add(user)

    await db.commit()
    await db.refresh(user)
    logger.info("User %s authenticated", user.github_username)

    jwt_token = _create_jwt(str(user.id))
    redirect = RedirectResponse(settings.frontend_url)
    redirect.set_cookie(
        "access_token",
        jwt_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
    )
    redirect.delete_cookie("oauth_state")
    return redirect
