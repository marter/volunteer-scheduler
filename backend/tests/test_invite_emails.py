import re

from fastapi.testclient import TestClient

from app.services import email
from tests.test_signups import add_volunteer, create_shift, register, volunteer_headers


def extract_tokens(message: email.Email) -> tuple[str, str]:
    accept = re.search(r"token=([\w-]+)&action=accept", message.text)
    decline = re.search(r"token=([\w-]+)&action=decline", message.text)
    assert accept and decline, message.text
    return accept.group(1), decline.group(1)


def test_admin_assignment_sends_invite_email(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-invite-email")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")

    email.outbox.clear()
    invite = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    assert invite.status_code == 201

    assert len(email.outbox) == 1
    message = email.outbox[0]
    assert message.to == "vol@example.com"
    assert "org-invite-email" in message.text  # the org's display name is in the body
    assert "Food Sort" in message.text
    accept_token, decline_token = extract_tokens(message)
    assert accept_token == decline_token  # same token, action is a separate query param


def test_respond_via_token_accepts_without_login(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-token-accept")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")

    email.outbox.clear()
    client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    token, _ = extract_tokens(email.outbox[0])

    details = client.get(f"/api/signups/respond?token={token}")
    assert details.status_code == 200
    body = details.json()
    assert body["status"] == "pending"
    assert body["event_name"] == "Food Sort"

    accept = client.post("/api/signups/respond", json={"token": token, "action": "accept"})
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    # Clicking the same link again is harmless.
    again = client.post("/api/signups/respond", json={"token": token, "action": "accept"})
    assert again.status_code == 200
    assert again.json()["status"] == "accepted"


def test_respond_via_token_decline(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-token-decline")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")

    email.outbox.clear()
    client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    token, _ = extract_tokens(email.outbox[0])

    decline = client.post("/api/signups/respond", json={"token": token, "action": "decline"})
    assert decline.status_code == 200
    assert decline.json()["status"] == "declined"


def test_accepting_via_token_verifies_email(
    client: TestClient, verification_on: None
) -> None:
    admin_headers = register(client, "admin@example.com", "org-token-verify")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")
    vol_headers = volunteer_headers(client, "vol@example.com", "org-token-verify")

    assert client.get("/api/auth/me", headers=vol_headers).json()["user"]["email_verified"] is False

    email.outbox.clear()
    client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    token, _ = extract_tokens(email.outbox[0])
    client.post("/api/signups/respond", json={"token": token, "action": "accept"})

    assert client.get("/api/auth/me", headers=vol_headers).json()["user"]["email_verified"] is True


def test_invalid_token_is_404(client: TestClient) -> None:
    assert client.get("/api/signups/respond?token=not-a-real-token").status_code == 404
    bad = client.post(
        "/api/signups/respond", json={"token": "not-a-real-token", "action": "accept"}
    )
    assert bad.status_code == 404


def test_accept_via_token_fails_once_full(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-token-full")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol1_id = add_volunteer(client, admin_headers, "vol1@example.com")
    vol2_id = add_volunteer(client, admin_headers, "vol2@example.com")

    email.outbox.clear()
    client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol1_id}, headers=admin_headers
    )
    client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol2_id}, headers=admin_headers
    )
    token1, _ = extract_tokens(email.outbox[0])
    token2, _ = extract_tokens(email.outbox[1])

    first = client.post("/api/signups/respond", json={"token": token1, "action": "accept"})
    assert first.status_code == 200

    second = client.post("/api/signups/respond", json={"token": token2, "action": "accept"})
    assert second.status_code == 400
    assert "full" in second.json()["detail"].lower()
