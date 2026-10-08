import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class OrgRole(enum.StrEnum):
    ORG_ADMIN = "org_admin"
    COORDINATOR = "coordinator"
    VOLUNTEER = "volunteer"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Global identity. A user may belong to multiple orgs via OrgMembership."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None


class OrgMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A user's role within a specific organization."""

    __tablename__ = "org_memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_org_membership_org_user"),)

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, name="org_role"), nullable=False, default=OrgRole.VOLUNTEER
    )

    user: Mapped[User] = relationship(lazy="raise")
