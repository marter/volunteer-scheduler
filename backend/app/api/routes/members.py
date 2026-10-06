from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.db import get_db
from app.core.security import hash_password
from app.models.user import OrgMembership, OrgRole, User
from app.schemas.user import MemberCreate, MembershipRead, UserRead

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
    db.commit()
    return MembershipRead(user=UserRead.model_validate(user), role=membership.role)
