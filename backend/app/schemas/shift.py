import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ShiftCreate(BaseModel):
    event_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    capacity: int = 1


class ShiftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    capacity: int
    open_slots: int
