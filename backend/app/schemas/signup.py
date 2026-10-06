import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.signup import SignUpStatus
from app.schemas.user import UserRead


class SignUpCreate(BaseModel):
    shift_id: uuid.UUID
    user_id: uuid.UUID | None = None


class SignUpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_id: uuid.UUID
    user_id: uuid.UUID
    status: SignUpStatus


class SignUpDetailRead(BaseModel):
    id: uuid.UUID
    shift_id: uuid.UUID
    status: SignUpStatus
    user: UserRead
    starts_at: datetime
    ends_at: datetime
