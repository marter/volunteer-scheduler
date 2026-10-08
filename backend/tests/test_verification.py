import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.verification import EmailVerificationToken
from app.services import email

pytestmark = pytest.mark.usefixtures("verification_on")


def register(
    client: TestClient, email_addr: str = "pat@example.com", org_slug: str = "org-pat"
) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email_addr,
            "password": "hunter2hunter2",
            "full_name": email_addr.split("@")[0],
            "organization_name": org_slug,
            "organization_slug": org_slug,
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def link_token(message: email.Email) -> str:
    match = re.search(r"/verify-email\?token=([\w-]+)", message.text)
    assert match, message.text
    return match.group(1)


def create_shift(client: TestClient, headers: dict[str, str]) -> str:
    event = client.post(
        "/api/events",
        json={"name": "Food Sort", "start_date": "2026-11-01"},
        headers=headers,
    )
    assert event.status_code == 201, event.text
    shift = client.post(
        "/api/shifts",
        json={
            "event_id": event.json()["id"],
            "starts_at": "2026-11-01T09:00:00",
            "ends_at": "2026-11-01T12:00:00",
            "capacity": 2,
        },
        headers=headers,
    )
    assert shift.status_code == 201, shift.text
    return shift.json()["id"]


def test_register_sends_link_and_blocks_self_signup_until_verified(client: TestClient) -> None:
    headers = register(client)
    assert client.get("/api/auth/me", headers=headers).json()["user"]["email_verified"] is False

    assert len(email.outbox) == 1
    message = email.outbox[0]
    assert message.to == "pat@example.com"
    assert get_settings().app_base_url in message.text
    token = link_token(message)

    shift_id = create_shift(client, headers)
    blocked = client.post("/api/signups", json={"shift_id": shift_id}, headers=headers)
    assert blocked.status_code == 403
    assert "verify" in blocked.json()["detail"].lower()

    # The link works without being logged in.
    verified = client.post("/api/auth/verify-email", json={"token": token})
    assert verified.status_code == 200
    assert verified.json()["email_verified"] is True
    retry = client.post("/api/signups", json={"shift_id": shift_id}, headers=headers)
    assert retry.status_code == 201

    # Clicking the same link again is harmless.
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200


def test_admin_signup_on_behalf_is_never_blocked_by_verification(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-admin-behalf")
    shift_id = create_shift(client, admin_headers)

    add = client.post(
        "/api/members",
        json={
            "email": "vol@example.com",
            "full_name": "Vol Unteer",
            "password": "hunter2hunter2",
            "role": "volunteer",
        },
        headers=admin_headers,
    )
    assert add.status_code == 201, add.text
    vol_id = add.json()["user"]["id"]
    assert add.json()["user"]["email_verified"] is False

    # Admin-added members get their own verification email too.
    assert any(m.to == "vol@example.com" for m in email.outbox)

    on_behalf = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    assert on_behalf.status_code == 201, on_behalf.text


def test_bad_and_expired_links(client: TestClient, db: Session) -> None:
    register(client)
    token = link_token(email.outbox[0])

    bad = client.post("/api/auth/verify-email", json={"token": "x" * 43})
    assert bad.status_code == 400

    db.execute(
        update(EmailVerificationToken).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    db.commit()
    expired = client.post("/api/auth/verify-email", json={"token": token})
    assert expired.status_code == 400
    assert "expired" in expired.json()["detail"]


def test_resend_is_rate_limited(client: TestClient, db: Session) -> None:
    headers = register(client)
    # Sign-up just sent one, so an immediate resend is too soon.
    assert client.post("/api/auth/resend-verification", headers=headers).status_code == 429

    def age_tokens(minutes: int) -> None:
        db.execute(
            update(EmailVerificationToken).values(
                issued_at=EmailVerificationToken.issued_at - timedelta(minutes=minutes)
            )
        )
        db.commit()

    for _ in range(4):
        age_tokens(2)
        assert client.post("/api/auth/resend-verification", headers=headers).status_code == 204
    assert len(email.outbox) == 5
    age_tokens(2)
    too_many = client.post("/api/auth/resend-verification", headers=headers)
    assert too_many.status_code == 429
    assert "tomorrow" in too_many.json()["detail"]

    # Any of the links works; the newest one verifies.
    newest = link_token(email.outbox[-1])
    assert client.post("/api/auth/verify-email", json={"token": newest}).status_code == 200
    assert client.post("/api/auth/resend-verification", headers=headers).status_code == 400


def test_admin_can_verify_or_remove_unverified_member(client: TestClient) -> None:
    admin_headers = register(client, "boss@example.com", "org-boss")
    add = client.post(
        "/api/members",
        json={
            "email": "stuck@example.com",
            "full_name": "Stuck Person",
            "password": "hunter2hunter2",
            "role": "volunteer",
        },
        headers=admin_headers,
    )
    user_id = add.json()["user"]["id"]

    marked = client.post(f"/api/members/{user_id}/verify", headers=admin_headers)
    assert marked.status_code == 200
    assert marked.json()["user"]["email_verified"] is True

    cant_remove = client.delete(f"/api/members/{user_id}", headers=admin_headers)
    assert cant_remove.status_code == 400

    add2 = client.post(
        "/api/members",
        json={
            "email": "typo@exmaple.com",
            "full_name": "Typo Person",
            "password": "hunter2hunter2",
            "role": "volunteer",
        },
        headers=admin_headers,
    )
    typo_id = add2.json()["user"]["id"]
    removed = client.delete(f"/api/members/{typo_id}", headers=admin_headers)
    assert removed.status_code == 204

    members = client.get("/api/members", headers=admin_headers).json()
    remaining = {m["user"]["email"] for m in members}
    assert remaining == {"boss@example.com", "stuck@example.com"}
