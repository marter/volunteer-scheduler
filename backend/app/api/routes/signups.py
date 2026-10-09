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
from app.services import verification

router = APIRouter(prefix="/api/signups", tags=["signups"])

MANAGER_ROLES = (OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)
ACTIVE_STATUSES = (SignUpStatus.PENDING, SignUpStatus.ACCEPTED)


def _accepted_count(db: Session, shift_id: uuid.UUID) -> int:
    return (
        db.query(func.count(SignUp.id))
        .filter(SignUp.shift_id == shift_id, SignUp.status == SignUpStatus.ACCEPTED)
        .scalar()
        or 0
    )


@router.post("", response_model=SignUpRead, status_code=201)
def create_signup(
    payload: SignUpCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    target_user_id = payload.user_id or current.user.id
    is_self = target_user_id == current.user.id

    if not is_self:
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
    elif not verification.is_verified(current.user):
        # Only self-signup is gated -- an admin/coordinator assigning someone else is their
        # own call, and many volunteers never log in to self-serve at all.
        raise HTTPException(status_code=403, detail="Verify your email to sign up for a shift")

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
    if existing is not None and existing.status in ACTIVE_STATUSES:
        detail = "Already signed up for this shift" if is_self else "Already invited to this shift"
        raise HTTPException(status_code=400, detail=detail)

    if is_self:
        # Self-signup is immediate consent, so it's accepted outright -- but still has to
        # respect capacity, since there's no waitlist to fall back to.
        if _accepted_count(db, shift.id) >= shift.capacity:
            raise HTTPException(status_code=400, detail="This shift is full")
        new_status = SignUpStatus.ACCEPTED
    else:
        # An admin-assigned invitation starts pending and doesn't hold the spot, so an
        # admin can invite more candidates than there's room for.
        new_status = SignUpStatus.PENDING

    if existing is not None:
        existing.status = new_status
        signup = existing
    else:
        signup = SignUp(
            org_id=current.org_id,
            shift_id=shift.id,
            user_id=target_user_id,
            status=new_status,
        )
        db.add(signup)

    db.commit()
    db.refresh(signup)
    return signup


@router.post("/{signup_id}/accept", response_model=SignUpRead)
def accept_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None or signup.user_id != current.user.id:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.status != SignUpStatus.PENDING:
        raise HTTPException(status_code=400, detail="This invitation is no longer pending")
    if not verification.is_verified(current.user):
        raise HTTPException(status_code=403, detail="Verify your email to accept a shift")

    shift = db.get(Shift, signup.shift_id)
    assert shift is not None
    if _accepted_count(db, shift.id) >= shift.capacity:
        raise HTTPException(status_code=400, detail="This shift is already full")

    signup.status = SignUpStatus.ACCEPTED
    db.commit()
    db.refresh(signup)
    return signup


@router.post("/{signup_id}/decline", response_model=SignUpRead)
def decline_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None or signup.user_id != current.user.id:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.status != SignUpStatus.PENDING:
        raise HTTPException(status_code=400, detail="This invitation is no longer pending")

    signup.status = SignUpStatus.DECLINED
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
