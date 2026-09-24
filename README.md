# Volunteer Scheduler

A multi-tenant volunteer scheduling platform. Organizations manage events and
shifts; volunteers sign up for shifts, either recurring (e.g. weekly food
bank ops) or one-off (e.g. a single community cleanup).

## Repo layout

- `backend/` — FastAPI + SQLAlchemy + Postgres API
- `frontend/` — React + TypeScript (Vite) web app
- `infra/` — Terraform for AWS (EKS, RDS, ECR, networking)

The iOS app lives in a separate repo: `volunteer-scheduler-ios`.

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
  role per organization (`OrgMembership`).
- **Core domain**: `Organization` → `Event` (one-off or recurring via an
  RRULE string) → `Shift` (concrete time slot with capacity) → `SignUp`
  (volunteer's claim on a shift, confirmed or waitlisted).

## Deployment (planned)

Backend and frontend are containerized (see each service's `Dockerfile`) for
deployment to AWS EKS, with RDS Postgres and images pushed to ECR. See
`infra/README.md` for the current state of the Terraform setup.
