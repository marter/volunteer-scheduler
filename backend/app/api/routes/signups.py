import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_db
from app.models.shift import Shift
from app.models.signup import SignUp, SignUpStatus
from app.models.user import OrgMembership, OrgRole
from app.schemas.signup import SignUpCreate, SignUpRead

router = APIRouter(prefix="/api/signups", tags=["signups"])

MANAGER_ROLES = (OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)


@router.post("", response_model=SignUpRead, status_code=201)
def create_signup(
    payload: SignUpCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    target_user_id = payload.user_id or current.user.id
    if target_user_id != current.user.id:
        if current.role not in MANAGER_ROLES:
            raise HTTPException(
                status_code=403, detail="Only org admins or coordinators can sign up other members"
            )
        member = (
            db.query(OrgMembership)
            .filter(OrgMembership.org_id == current.org_id, OrgMembership.user_id == target_user_id)
            .first()
        )
        if member is None:
            raise HTTPException(status_code=404, detail="User is not a member of this organization")

    shift = (
        db.query(Shift)
        .filter(Shift.id == payload.shift_id, Shift.org_id == current.org_id)
        .first()
    )
    if shift is None:
        raise HTTPException(status_code=404, detail="Shift not found")

    existing = (
        db.query(SignUp)
        .filter(SignUp.shift_id == shift.id, SignUp.user_id == target_user_id)
        .first()
    )
    if existing is not None and existing.status != SignUpStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Already signed up for this shift")

    confirmed_count = (
        db.query(func.count(SignUp.id))
        .filter(SignUp.shift_id == shift.id, SignUp.status == SignUpStatus.CONFIRMED)
        .scalar()
        or 0
    )
    status_value = (
        SignUpStatus.CONFIRMED if confirmed_count < shift.capacity else SignUpStatus.WAITLISTED
    )

    if existing is not None:
        existing.status = status_value
        signup = existing
    else:
        signup = SignUp(
            org_id=current.org_id,
            shift_id=shift.id,
            user_id=target_user_id,
            status=status_value,
        )
        db.add(signup)

    db.commit()
    db.refresh(signup)
    return signup


@router.delete("/{signup_id}", status_code=204)
def cancel_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> None:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.user_id != current.user.id and current.role not in MANAGER_ROLES:
        raise HTTPException(status_code=404, detail="Sign-up not found")

    signup.status = SignUpStatus.CANCELLED
    db.commit()
