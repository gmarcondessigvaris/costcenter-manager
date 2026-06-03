import time

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models.user import User, UserRole

security = HTTPBearer()

_jwks_cache: dict = {"keys": None, "expires_at": 0.0}


def _get_azure_jwks() -> dict:
    if time.time() < _jwks_cache["expires_at"] and _jwks_cache["keys"]:
        return _jwks_cache["keys"]

    oid_url = f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration"
    oid_cfg = requests.get(oid_url, timeout=10).json()
    jwks = requests.get(oid_cfg["jwks_uri"], timeout=10).json()

    _jwks_cache["keys"] = jwks
    _jwks_cache["expires_at"] = time.time() + 3600
    return jwks


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        jwks = _get_azure_jwks()
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=settings.AZURE_CLIENT_ID,
            options={"verify_iss": False},
        )
    except (JWTError, Exception) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}")

    azure_id: str = payload.get("oid") or payload.get("sub")
    email: str = payload.get("preferred_username") or payload.get("email") or ""
    display_name: str = payload.get("name") or email

    if not azure_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing user identity")

    user = db.query(User).filter(User.azure_id == azure_id).first()
    if not user:
        user = User(azure_id=azure_id, email=email, display_name=display_name)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.email != email or user.display_name != display_name:
        user.email = email
        user.display_name = display_name
        db.commit()

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    return user


def require_finance(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.finance, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Finance role required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user
