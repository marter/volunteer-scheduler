import uuid

from pydantic import BaseModel, ConfigDict


class PositionCreate(BaseModel):
    name: str


class PositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    name: str


class TeamCreate(BaseModel):
    name: str


class TeamRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    positions: list[PositionRead] = []
