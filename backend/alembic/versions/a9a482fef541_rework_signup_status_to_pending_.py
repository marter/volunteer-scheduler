"""rework signup status to pending accepted declined

Replaces confirmed/waitlisted with pending/accepted/declined: an admin-assigned
sign-up now starts pending and doesn't hold capacity until accepted, dropping the
waitlist concept. Self-signup still goes straight to accepted. Existing rows are
mapped confirmed -> accepted, waitlisted -> pending (closest equivalent: not yet
guaranteed a spot).

Revision ID: a9a482fef541
Revises: 8905824cc0ef
Create Date: 2026-10-09 02:22:19.642866

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a9a482fef541'
down_revision: Union[str, Sequence[str], None] = '8905824cc0ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLAlchemy's Enum type stores the Python enum member's *name* (e.g. "CONFIRMED"),
    # not its lowercase .value, so the CASE below matches on the uppercase names.
    op.execute("ALTER TYPE signup_status RENAME TO signup_status_old")
    op.execute(
        "CREATE TYPE signup_status AS ENUM "
        "('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'NO_SHOW')"
    )
    op.execute(
        """
        ALTER TABLE signups
        ALTER COLUMN status TYPE signup_status
        USING (
            CASE status::text
                WHEN 'CONFIRMED' THEN 'ACCEPTED'
                WHEN 'WAITLISTED' THEN 'PENDING'
                ELSE status::text
            END
        )::signup_status
        """
    )
    op.execute("DROP TYPE signup_status_old")


def downgrade() -> None:
    op.execute("ALTER TYPE signup_status RENAME TO signup_status_new")
    op.execute(
        "CREATE TYPE signup_status AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED', 'NO_SHOW')"
    )
    op.execute(
        """
        ALTER TABLE signups
        ALTER COLUMN status TYPE signup_status
        USING (
            CASE status::text
                WHEN 'ACCEPTED' THEN 'CONFIRMED'
                WHEN 'PENDING' THEN 'WAITLISTED'
                WHEN 'DECLINED' THEN 'CANCELLED'
                ELSE status::text
            END
        )::signup_status
        """
    )
    op.execute("DROP TYPE signup_status_new")
