import hashlib
import logging
import secrets
import uuid
from datetime import UTC, datetime
from html import escape

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.models.event import Event
from app.models.organization import Organization
from app.models.shift import Shift
from app.models.signup import SignUp, SignUpStatus
from app.models.team import Position, Team
from app.models.user import OrgMembership, OrgRole, User
from app.schemas.signup import (
    SignUpCreate,
    SignUpInviteRead,
    SignUpRead,
    SignUpRespondRequest,
)
from app.services import email, verification

router = APIRouter(prefix="/api/signups", tags=["signups"])
logger = logging.getLogger(__name__)

MANAGER_ROLES = (OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)
ACTIVE_STATUSES = (SignUpStatus.PENDING, SignUpStatus.ACCEPTED)


def _accepted_count(db: Session, shift_id: uuid.UUID) -> int:
    return (
        db.query(func.count(SignUp.id))
        .filter(SignUp.shift_id == shift_id, SignUp.status == SignUpStatus.ACCEPTED)
        .scalar()
        or 0
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _position_label(db: Session, position_id: uuid.UUID | None) -> str | None:
    if position_id is None:
        return None
    row = (
        db.query(Team.name, Position.name)
        .join(Position, Position.team_id == Team.id)
        .filter(Position.id == position_id)
        .first()
    )
    return f"{row[0]} — {row[1]}" if row else None


def _invite_context(db: Session, signup: SignUp) -> SignUpInviteRead:
    shift = db.get(Shift, signup.shift_id)
    assert shift is not None
    event = db.get(Event, shift.event_id)
    assert event is not None
    org = db.get(Organization, signup.org_id)
    assert org is not None
    return SignUpInviteRead(
        status=signup.status,
        organization_name=org.name,
        event_name=event.name,
        event_location=event.location,
        event_date=event.start_date,
        starts_at=shift.starts_at,
        ends_at=shift.ends_at,
        position_label=_position_label(db, shift.position_id),
    )


def _send_invite_email(db: Session, signup: SignUp, user: User) -> None:
    """Generates a fresh response token and emails accept/decline links. Caller commits.
    Sending failures are logged, not raised -- the invite still exists and the admin or
    volunteer can fall back to accepting/declining from inside the app."""
    settings = get_settings()
    context = _invite_context(db, signup)

    token = secrets.token_urlsafe(32)
    signup.response_token_hash = _hash_token(token)

    base = settings.app_base_url.rstrip("/")
    accept_link = f"{base}/invites/respond?token={token}&action=accept"
    decline_link = f"{base}/invites/respond?token={token}&action=decline"
    when = (
        f"{context.starts_at:%A, %B %-d} from "
        f"{context.starts_at:%-I:%M %p} to {context.ends_at:%-I:%M %p}"
    )
    where = f" at {context.event_location}" if context.event_location else ""
    role = f" ({context.position_label})" if context.position_label else ""
    name = escape(user.full_name)

    try:
        email.send(
            email.Email(
                to=user.email,
                subject=f"You're invited to volunteer: {context.event_name}",
                text=(
                    f"Hi {user.full_name},\n\n"
                    f"{context.organization_name} has invited you to volunteer for "
                    f"{context.event_name}{role} on {when}{where}.\n\n"
                    f"Accept: {accept_link}\n"
                    f"Decline: {decline_link}\n\n"
                    "If you weren't expecting this, you can ignore this email."
                ),
                html=(
                    f"<p>Hi {name},</p>"
                    f"<p><strong>{escape(context.organization_name)}</strong> has invited you to "
                    f"volunteer for <strong>{escape(context.event_name)}</strong>{escape(role)} "
                    f"on {escape(when)}{escape(where)}.</p>"
                    f'<p><a href="{escape(accept_link)}">Accept</a> &nbsp; '
                    f'<a href="{escape(decline_link)}">Decline</a></p>'
                    "<p>If you weren't expecting this, you can ignore this email.</p>"
                ),
            )
        )
    except email.EmailError:
        logger.exception("Couldn't send invite email to user %s", user.id)


@router.post("", response_model=SignUpRead, status_code=201)
def create_signup(
    payload: SignUpCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    target_user_id = payload.user_id or current.user.id
    is_self = target_user_id == current.user.id

    if not is_self:
        if current.role not in MANAGER_ROLES:
            raise HTTPException(
                status_code=403, detail="Only org admins or coordinators can sign up other members"
            )
        member = (
            db.query(OrgMembership)
            .filter(OrgMembership.org_id == current.org_id, OrgMembership.user_id == target_user_id)
            .first()
        )
        if member is None:
            raise HTTPException(status_code=404, detail="User is not a member of this organization")
    elif not verification.is_verified(current.user):
        # Only self-signup is gated -- an admin/coordinator assigning someone else is their
        # own call, and many volunteers never log in to self-serve at all.
        raise HTTPException(status_code=403, detail="Verify your email to sign up for a shift")

    shift = (
        db.query(Shift)
        .filter(Shift.id == payload.shift_id, Shift.org_id == current.org_id)
        .first()
    )
    if shift is None:
        raise HTTPException(status_code=404, detail="Shift not found")

    existing = (
        db.query(SignUp)
        .filter(SignUp.shift_id == shift.id, SignUp.user_id == target_user_id)
        .first()
    )
    if existing is not None and existing.status in ACTIVE_STATUSES:
        detail = "Already signed up for this shift" if is_self else "Already invited to this shift"
        raise HTTPException(status_code=400, detail=detail)

    if is_self:
        # Self-signup is immediate consent, so it's accepted outright -- but still has to
        # respect capacity, since there's no waitlist to fall back to.
        if _accepted_count(db, shift.id) >= shift.capacity:
            raise HTTPException(status_code=400, detail="This shift is full")
        new_status = SignUpStatus.ACCEPTED
    else:
        # An admin-assigned invitation starts pending and doesn't hold the spot, so an
        # admin can invite more candidates than there's room for.
        new_status = SignUpStatus.PENDING

    if existing is not None:
        existing.status = new_status
        signup = existing
    else:
        signup = SignUp(
            org_id=current.org_id,
            shift_id=shift.id,
            user_id=target_user_id,
            status=new_status,
        )
        db.add(signup)

    db.flush()
    if not is_self:
        target_user = db.get(User, target_user_id)
        assert target_user is not None
        _send_invite_email(db, signup, target_user)

    db.commit()
    db.refresh(signup)
    return signup


@router.get("/respond", response_model=SignUpInviteRead)
def get_invite(token: str, db: Session = Depends(get_db)) -> SignUpInviteRead:
    """Loads an invitation's details from an emailed link's token. No login required."""
    signup = db.query(SignUp).filter(SignUp.response_token_hash == _hash_token(token)).first()
    if signup is None:
        raise HTTPException(status_code=404, detail="That link isn't valid.")
    return _invite_context(db, signup)


@router.post("/respond", response_model=SignUpInviteRead)
def respond_to_invite(
    payload: SignUpRespondRequest, db: Session = Depends(get_db)
) -> SignUpInviteRead:
    """Accepts or declines an invitation from an emailed link's token. No login required --
    the token itself, known only to whoever received the email, is the proof."""
    signup = (
        db.query(SignUp).filter(SignUp.response_token_hash == _hash_token(payload.token)).first()
    )
    if signup is None:
        raise HTTPException(status_code=404, detail="That link isn't valid.")

    if signup.status == SignUpStatus.PENDING:
        if payload.action == "accept":
            shift = db.get(Shift, signup.shift_id)
            assert shift is not None
            if _accepted_count(db, shift.id) >= shift.capacity:
                raise HTTPException(status_code=400, detail="This shift is already full")
            signup.status = SignUpStatus.ACCEPTED
            # Clicking an emailed link proves the recipient controls this address, same as
            # clicking a verification link -- no reason to also make them verify separately.
            user = db.get(User, signup.user_id)
            assert user is not None
            if not user.email_verified:
                user.email_verified_at = datetime.now(UTC)
        else:
            signup.status = SignUpStatus.DECLINED
        db.commit()
    # If it's not pending anymore (already responded, or cancelled/reassigned since), just
    # show the current state -- clicking an old link again is harmless, not an error.

    return _invite_context(db, signup)


@router.post("/{signup_id}/accept", response_model=SignUpRead)
def accept_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None or signup.user_id != current.user.id:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.status != SignUpStatus.PENDING:
        raise HTTPException(status_code=400, detail="This invitation is no longer pending")
    if not verification.is_verified(current.user):
        raise HTTPException(status_code=403, detail="Verify your email to accept a shift")

    shift = db.get(Shift, signup.shift_id)
    assert shift is not None
    if _accepted_count(db, shift.id) >= shift.capacity:
        raise HTTPException(status_code=400, detail="This shift is already full")

    signup.status = SignUpStatus.ACCEPTED
    db.commit()
    db.refresh(signup)
    return signup


@router.post("/{signup_id}/decline", response_model=SignUpRead)
def decline_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> SignUp:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None or signup.user_id != current.user.id:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.status != SignUpStatus.PENDING:
        raise HTTPException(status_code=400, detail="This invitation is no longer pending")

    signup.status = SignUpStatus.DECLINED
    db.commit()
    db.refresh(signup)
    return signup


@router.delete("/{signup_id}", status_code=204)
def cancel_signup(
    signup_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> None:
    signup = (
        db.query(SignUp)
        .filter(SignUp.id == signup_id, SignUp.org_id == current.org_id)
        .first()
    )
    if signup is None:
        raise HTTPException(status_code=404, detail="Sign-up not found")
    if signup.user_id != current.user.id and current.role not in MANAGER_ROLES:
        raise HTTPException(status_code=404, detail="Sign-up not found")

    signup.status = SignUpStatus.CANCELLED
    db.commit()
