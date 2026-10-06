import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.user import OrgRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool


class MembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserRead
    role: OrgRole


class MemberCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str | None = None
    role: OrgRole = OrgRole.VOLUNTEER
