import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class EventCreate(BaseModel):
    name: str
    description: str | None = None
    location: str | None = None
    start_date: date
    end_date: date | None = None
    recurrence_rule: str | None = None


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    location: str | None
    start_date: date
    end_date: date | None
    recurrence_rule: str | None
