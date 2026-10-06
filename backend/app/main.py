from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, events, members, shifts, signups, teams
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="Volunteer Scheduler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(members.router)
app.include_router(shifts.router)
app.include_router(signups.router)
app.include_router(teams.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
