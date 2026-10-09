import uuid
from datetime import date, datetime
from typing import Literal

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


class SignUpRespondRequest(BaseModel):
    token: str
    action: Literal["accept", "decline"]


class SignUpInviteRead(BaseModel):
    """What an invited volunteer sees from the emailed link, before logging in."""

    status: SignUpStatus
    organization_name: str
    event_name: str
    event_location: str | None
    event_date: date
    starts_at: datetime
    ends_at: datetime
    position_label: str | None
