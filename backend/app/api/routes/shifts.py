import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.db import get_db
from app.models.event import Event
from app.models.shift import Shift
from app.models.signup import SignUp, SignUpStatus
from app.models.user import OrgRole
from app.schemas.shift import ShiftCreate, ShiftRead

router = APIRouter(prefix="/api/shifts", tags=["shifts"])


def _to_read_model(shift: Shift, db: Session) -> ShiftRead:
    confirmed = (
        db.query(func.count(SignUp.id))
        .filter(SignUp.shift_id == shift.id, SignUp.status == SignUpStatus.CONFIRMED)
        .scalar()
        or 0
    )
    return ShiftRead(
        id=shift.id,
        event_id=shift.event_id,
        starts_at=shift.starts_at,
        ends_at=shift.ends_at,
        capacity=shift.capacity,
        open_slots=max(shift.capacity - confirmed, 0),
    )


@router.get("", response_model=list[ShiftRead])
def list_shifts(
    event_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> list[ShiftRead]:
    query = db.query(Shift).filter(Shift.org_id == current.org_id)
    if event_id is not None:
        query = query.filter(Shift.event_id == event_id)
    shifts = query.order_by(Shift.starts_at).all()
    return [_to_read_model(s, db) for s in shifts]


@router.post("", response_model=ShiftRead, status_code=201)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)),
) -> ShiftRead:
    event = (
        db.query(Event)
        .filter(Event.id == payload.event_id, Event.org_id == current.org_id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    shift = Shift(org_id=current.org_id, **payload.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _to_read_model(shift, db)
