import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models.user import OrgMembership, OrgRole, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


@dataclass
class CurrentUser:
    user: User
    org_id: uuid.UUID
    role: OrgRole


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> CurrentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        org_id = uuid.UUID(payload["org_id"])
    except (JWTError, KeyError, ValueError) as exc:
        raise credentials_error from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error

    membership = (
        db.query(OrgMembership)
        .filter(OrgMembership.user_id == user_id, OrgMembership.org_id == org_id)
        .first()
    )
    if membership is None:
        raise credentials_error

    return CurrentUser(user=user, org_id=org_id, role=membership.role)


def require_role(*allowed_roles: OrgRole):
    def dependency(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return current

    return dependency
