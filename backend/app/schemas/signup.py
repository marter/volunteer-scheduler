import uuid

from pydantic import BaseModel, ConfigDict

from app.models.signup import SignUpStatus


class SignUpCreate(BaseModel):
    shift_id: uuid.UUID


class SignUpRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    shift_id: uuid.UUID
    user_id: uuid.UUID
    status: SignUpStatus
