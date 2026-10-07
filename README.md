# Volunteer Scheduler

A multi-tenant volunteer scheduling platform. Organizations manage events,
teams, and shifts; volunteers sign up for shifts (or get signed up by an
admin), either one-off or recurring weekly.

> **This README tracks current status, not just setup.** Update the
> Features section below whenever something lands or changes — it should
> always reflect what's actually in the code, not the original plan.

## Repo layout

- `backend/` — FastAPI + SQLAlchemy + Postgres API
- `frontend/` — React + TypeScript (Vite) web app
- `deploy/` — production Docker Compose + deploy script for the shared
  Lightsail server (see `deploy/README.md`)
- `infra/` — superseded; see `infra/README.md`

The iOS app lives in a separate repo: `volunteer-scheduler-ios` (not started).

## Features

### Done

- **Auth**: register (creates an org + you as its admin), login, JWT bearer
  tokens.
- **Events**: one-off, with name/description/location/date range.
- **Teams & positions**: a team (e.g. "Choir") belongs to an event and
  groups positions (e.g. "Guitar") that shifts can optionally be tagged
  with.
- **Shifts**: a time slot + capacity under an event, optionally tagged with
  a position. Weekly recurrence happens at creation time (`repeat_weeks`
  generates N shifts, one per week) — not a live recurrence rule.
- **Sign-ups**: volunteers sign up / cancel for themselves; shifts
  waitlist automatically once full.
- **Admin sign-up-on-behalf**: org_admin/coordinator can sign up another
  member via a searchable modal (not a plain dropdown — doesn't scale).
- **Event roster**: each shift shows who's signed up; admins/coordinators
  can remove anyone, volunteers can remove themselves.
- **Members**: org roster with contact info (email, phone); org_admin can
  add a member directly (creates the user if the email doesn't already
  have one, otherwise just adds the existing user to this org).
- **Calendar**: compact monthly view of events, plotting each one on its
  start date plus every date one of its shifts falls on (so recurrence
  shows up correctly).
- Local dev via Docker Compose, Alembic migrations, ruff/mypy/pytest on the
  backend, tsc/oxlint on the frontend.

### Not yet

- iOS app — separate repo exists, nothing built.
- Email invitations — admins set a password directly when adding a new
  member; no invite-link flow.
- Recurring *events* (multi-day spans, RRULE-style recurring series) —
  `Event.recurrence_rule` exists as a column but isn't read or written by
  anything. Only shift-level weekly recurrence (`repeat_weeks`) is real.
- Coordinator-level permissions on members — adding a member is
  `org_admin`-only; coordinators can manage events/shifts/teams but not
  org membership.

## Local development

Requires Docker Desktop.

```bash
docker compose up
```

- API: http://localhost:8000 (docs at `/docs`)
- Web app: http://localhost:5173
- Postgres: localhost:5432 (`volunteer` / `volunteer`)

Run database migrations (from `backend/`, with the `db` container running):

```bash
cd backend
uv run alembic revision --autogenerate -m "init"
uv run alembic upgrade head
```

### Backend only

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
uv run pytest
uv run ruff check .
uv run mypy app
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

## Architecture notes

- **Multi-tenancy**: shared database, every tenant-owned table carries an
  `org_id`. Requests are scoped to an org via the JWT (`org_id` claim) and
  every query filters on it — see `app/api/deps.py`.
- **Auth**: JWT bearer tokens. A user has one global identity (`User`) and a
  role per organization (`OrgMembership`): `org_admin`, `coordinator`, or
  `volunteer`.
- **Core domain**: `Organization` → `Event` → `Team` (grouped positions,
  e.g. "Choir") → `Position` (e.g. "Guitar") and `Event` → `Shift`
  (concrete time slot with capacity, optionally tagged with a `Position`)
  → `SignUp` (volunteer's claim on a shift, confirmed/waitlisted/cancelled).

## Deployment

**Live** at `volunteer.martinteran.me`. Shares a Lightsail server with a
sibling project (`fake-sportsbook`): one shared Caddy container handles
HTTPS and routing by hostname, Docker Compose runs db/backend/frontend per
app with no published ports. GitHub Actions deploys automatically on push
to `main`. See `deploy/README.md` for the full setup and deploy flow.
