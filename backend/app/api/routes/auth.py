from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.organization import Organization
from app.models.user import OrgMembership, OrgRole, User
from app.schemas.auth import LoginRequest, MeResponse, SignUpRequest, TokenResponse
from app.schemas.organization import OrganizationRead
from app.schemas.user import UserRead

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: SignUpRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if db.query(Organization).filter(Organization.slug == payload.organization_slug).first():
        raise HTTPException(status_code=400, detail="Organization slug already taken")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    org = Organization(name=payload.organization_name, slug=payload.organization_slug)
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add_all([org, user])
    db.flush()

    membership = OrgMembership(org_id=org.id, user_id=user.id, role=OrgRole.ORG_ADMIN)
    db.add(membership)
    db.commit()

    token = create_access_token(subject=str(user.id), org_id=str(org.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
def me(
    db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)
) -> MeResponse:
    org = db.get(Organization, current.org_id)
    assert org is not None
    return MeResponse(
        user=UserRead.model_validate(current.user),
        organization=OrganizationRead.model_validate(org),
        role=current.role,
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    invalid_credentials = HTTPException(status_code=401, detail="Invalid credentials")

    org = db.query(Organization).filter(Organization.slug == payload.organization_slug).first()
    if org is None:
        raise invalid_credentials

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise invalid_credentials

    membership = (
        db.query(OrgMembership)
        .filter(OrgMembership.user_id == user.id, OrgMembership.org_id == org.id)
        .first()
    )
    if membership is None:
        raise invalid_credentials

    token = create_access_token(subject=str(user.id), org_id=str(org.id))
    return TokenResponse(access_token=token)
