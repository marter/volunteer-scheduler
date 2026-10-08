import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import hash_password
from app.models.user import OrgMembership, OrgRole, User
from app.schemas.user import MemberCreate, MembershipRead, UserRead
from app.services import verification

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("", response_model=list[MembershipRead])
def list_members(
    db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)
) -> list[OrgMembership]:
    return (
        db.query(OrgMembership)
        .options(joinedload(OrgMembership.user))
        .filter(OrgMembership.org_id == current.org_id)
        .all()
    )


@router.post("", response_model=MembershipRead, status_code=201)
def add_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN)),
) -> MembershipRead:
    user = db.query(User).filter(User.email == payload.email).first()
    is_new_user = user is None

    if user is None:
        if not payload.password:
            raise HTTPException(
                status_code=400, detail="Password is required to create a new user"
            )
        user = User(
            email=payload.email,
            phone=payload.phone,
            full_name=payload.full_name,
            hashed_password=hash_password(payload.password),
        )
        db.add(user)
        db.flush()
    else:
        existing = (
            db.query(OrgMembership)
            .filter(OrgMembership.org_id == current.org_id, OrgMembership.user_id == user.id)
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=400, detail="User is already a member of this organization"
            )

    membership = OrgMembership(org_id=current.org_id, user_id=user.id, role=payload.role)
    db.add(membership)
    # A brand-new account still needs to confirm its email (often typed in by the admin,
    # not the member) before it can self-sign-up for a shift. An existing account is
    # already verified or not, globally -- no need to re-send here.
    if is_new_user and get_settings().email_verification_required:
        verification.send_verification(db, user)
    db.commit()
    return MembershipRead(user=UserRead.model_validate(user), role=membership.role)


@router.post("/{user_id}/verify", response_model=MembershipRead)
def mark_member_verified(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN)),
) -> MembershipRead:
    """For when the verification email doesn't arrive."""
    membership = (
        db.query(OrgMembership)
        .options(joinedload(OrgMembership.user))
        .filter(OrgMembership.org_id == current.org_id, OrgMembership.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="User is not a member of this organization")
    user, role = membership.user, membership.role
    if not user.email_verified:
        user.email_verified_at = datetime.now(UTC)
        db.commit()
    return MembershipRead(user=UserRead.model_validate(user), role=role)


@router.delete("/{user_id}", status_code=204)
def remove_unverified_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN)),
) -> None:
    """Removes an account that never verified (e.g. a typo'd email). Only removes this org's
    membership, not the global account, and only while unverified -- a verified member may
    have signups and history, so removing them is a separate, more deliberate feature."""
    membership = (
        db.query(OrgMembership)
        .options(joinedload(OrgMembership.user))
        .filter(OrgMembership.org_id == current.org_id, OrgMembership.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="User is not a member of this organization")
    if membership.user.email_verified:
        raise HTTPException(
            status_code=400, detail="Only unverified members can be removed this way"
        )
    db.delete(membership)
    db.commit()
