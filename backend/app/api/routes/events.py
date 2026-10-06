import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.db import get_db
from app.models.event import Event
from app.models.shift import Shift
from app.models.signup import SignUp, SignUpStatus
from app.models.user import OrgRole, User
from app.schemas.event import EventCreate, EventRead
from app.schemas.signup import SignUpDetailRead
from app.schemas.user import UserRead

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(
    db: Session = Depends(get_db), current: CurrentUser = Depends(get_current_user)
) -> list[Event]:
    return db.query(Event).filter(Event.org_id == current.org_id).order_by(Event.start_date).all()


@router.post("", response_model=EventRead, status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)),
) -> Event:
    event = Event(org_id=current.org_id, **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/{event_id}", response_model=EventRead)
def get_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> Event:
    event = db.query(Event).filter(Event.id == event_id, Event.org_id == current.org_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.get("/{event_id}/signups", response_model=list[SignUpDetailRead])
def list_event_signups(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> list[SignUpDetailRead]:
    event = db.query(Event).filter(Event.id == event_id, Event.org_id == current.org_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    rows = (
        db.query(SignUp, Shift, User)
        .join(Shift, SignUp.shift_id == Shift.id)
        .join(User, SignUp.user_id == User.id)
        .filter(Shift.event_id == event_id, SignUp.status != SignUpStatus.CANCELLED)
        .order_by(Shift.starts_at)
        .all()
    )
    return [
        SignUpDetailRead(
            id=signup.id,
            shift_id=signup.shift_id,
            status=signup.status,
            user=UserRead.model_validate(user),
            starts_at=shift.starts_at,
            ends_at=shift.ends_at,
        )
        for signup, shift, user in rows
    ]
