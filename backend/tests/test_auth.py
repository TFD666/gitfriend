"""
Unit tests for JWT creation and verification.
No DB, no network — pure in-memory function calls.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from jose import JWTError, jwt

from app.routers.auth import _create_jwt

_SECRET = "test-jwt-secret-for-unit-tests-only"
_ALGORITHM = "HS256"


class TestCreateJwt:
    def test_sub_claim_survives_roundtrip(self):
        user_id = str(uuid.uuid4())
        token = _create_jwt(user_id)
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        assert payload["sub"] == user_id

    def test_token_is_string(self):
        token = _create_jwt(str(uuid.uuid4()))
        assert isinstance(token, str)
        assert len(token) > 0

    def test_exp_claim_present(self):
        token = _create_jwt(str(uuid.uuid4()))
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        assert "exp" in payload

    def test_exp_is_in_future(self):
        token = _create_jwt(str(uuid.uuid4()))
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_wrong_secret_raises(self):
        token = _create_jwt(str(uuid.uuid4()))
        with pytest.raises(JWTError):
            jwt.decode(token, "wrong-secret", algorithms=[_ALGORITHM])

    def test_different_user_ids_produce_different_tokens(self):
        token_a = _create_jwt(str(uuid.uuid4()))
        token_b = _create_jwt(str(uuid.uuid4()))
        assert token_a != token_b

    def test_expired_token_raises(self):
        user_id = str(uuid.uuid4())
        # Forge an already-expired token directly without going through _create_jwt
        expired_payload = {
            "sub": user_id,
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        }
        expired_token = jwt.encode(expired_payload, _SECRET, algorithm=_ALGORITHM)
        with pytest.raises(JWTError):
            jwt.decode(expired_token, _SECRET, algorithms=[_ALGORITHM])

    def test_algorithm_is_hs256(self):
        token = _create_jwt(str(uuid.uuid4()))
        # Decoding with a different algorithm should fail
        with pytest.raises(JWTError):
            jwt.decode(token, _SECRET, algorithms=["HS512"])
