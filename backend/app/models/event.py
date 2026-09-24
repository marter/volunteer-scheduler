from datetime import date

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Event(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """A one-off event or the parent of a recurring series of shifts."""

    __tablename__ = "events"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date] = mapped_column(nullable=False)
    end_date: Mapped[date | None] = mapped_column(nullable=True)
    recurrence_rule: Mapped[str | None] = mapped_column(
        String(255), nullable=True, doc="RFC 5545 RRULE string, null for one-off events"
    )
