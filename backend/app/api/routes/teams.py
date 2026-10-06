import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, get_current_user, require_role
from app.core.db import get_db
from app.models.event import Event
from app.models.team import Position, Team
from app.models.user import OrgRole
from app.schemas.team import PositionCreate, PositionRead, TeamCreate, TeamRead

router = APIRouter(tags=["teams"])


@router.get("/api/events/{event_id}/teams", response_model=list[TeamRead])
def list_teams(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> list[TeamRead]:
    event = db.query(Event).filter(Event.id == event_id, Event.org_id == current.org_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    teams = (
        db.query(Team)
        .filter(Team.event_id == event_id, Team.org_id == current.org_id)
        .order_by(Team.name)
        .all()
    )
    positions_by_team: dict[uuid.UUID, list[PositionRead]] = defaultdict(list)
    if teams:
        positions = (
            db.query(Position)
            .filter(Position.team_id.in_([t.id for t in teams]))
            .order_by(Position.name)
            .all()
        )
        for position in positions:
            positions_by_team[position.team_id].append(PositionRead.model_validate(position))

    return [
        TeamRead(id=t.id, event_id=t.event_id, name=t.name, positions=positions_by_team[t.id])
        for t in teams
    ]


@router.post("/api/events/{event_id}/teams", response_model=TeamRead, status_code=201)
def create_team(
    event_id: uuid.UUID,
    payload: TeamCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)),
) -> TeamRead:
    event = db.query(Event).filter(Event.id == event_id, Event.org_id == current.org_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    if db.query(Team).filter(Team.event_id == event_id, Team.name == payload.name).first():
        raise HTTPException(status_code=400, detail="A team with this name already exists")

    team = Team(org_id=current.org_id, event_id=event_id, name=payload.name)
    db.add(team)
    db.commit()
    return TeamRead(id=team.id, event_id=team.event_id, name=team.name, positions=[])


@router.post("/api/teams/{team_id}/positions", response_model=PositionRead, status_code=201)
def create_position(
    team_id: uuid.UUID,
    payload: PositionCreate,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(require_role(OrgRole.ORG_ADMIN, OrgRole.COORDINATOR)),
) -> Position:
    team = db.query(Team).filter(Team.id == team_id, Team.org_id == current.org_id).first()
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    duplicate = (
        db.query(Position)
        .filter(Position.team_id == team_id, Position.name == payload.name)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="A position with this name already exists")

    position = Position(org_id=current.org_id, team_id=team_id, name=payload.name)
    db.add(position)
    db.commit()
    db.refresh(position)
    return position
