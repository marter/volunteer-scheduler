import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Team(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """A volunteer team within a specific event, e.g. "Choir"."""

    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("event_id", "name", name="uq_team_event_name"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class Position(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """A role within a team that a shift can be tagged with, e.g. "Guitar"."""

    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint("team_id", "name", name="uq_position_team_name"),)

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
