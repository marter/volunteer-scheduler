from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "local"
    database_url: str = "postgresql+psycopg://volunteer:volunteer@localhost:5432/volunteer_scheduler"
    jwt_secret_key: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173"]

    # Email verification. New accounts aren't blocked from using the app, except from
    # self-signing-up for a shift, until they verify.
    email_verification_required: bool = False
    email_backend: str = "console"  # "console" (logs the email), "resend", or "memory" (tests)
    resend_api_key: str = ""
    email_from: str = "Volunteer Scheduler <no-reply@martinteran.me>"
    app_base_url: str = "http://localhost:5173"  # used to build links in emails
    verification_token_ttl_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
