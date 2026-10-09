import enum
import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class SignUpStatus(enum.StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class SignUp(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """A volunteer's claim on a shift."""

    __tablename__ = "signups"
    __table_args__ = (UniqueConstraint("shift_id", "user_id", name="uq_signup_shift_user"),)

    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    status: Mapped[SignUpStatus] = mapped_column(
        Enum(SignUpStatus, name="signup_status"), nullable=False, default=SignUpStatus.PENDING
    )
