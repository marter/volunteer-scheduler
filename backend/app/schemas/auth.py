from pydantic import BaseModel, EmailStr

from app.models.user import OrgRole
from app.schemas.organization import OrganizationRead
from app.schemas.user import UserRead


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_name: str
    organization_slug: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    organization_slug: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VerifyEmailRequest(BaseModel):
    token: str


class MeResponse(BaseModel):
    user: UserRead
    organization: OrganizationRead
    role: OrgRole
    verification_required: bool
