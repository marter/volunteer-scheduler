from fastapi.testclient import TestClient


def register(client: TestClient, email: str, org_slug: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "hunter2hunter2",
            "full_name": email.split("@")[0],
            "organization_name": org_slug,
            "organization_slug": org_slug,
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def add_volunteer(client: TestClient, admin_headers: dict[str, str], email: str) -> str:
    response = client.post(
        "/api/members",
        json={
            "email": email,
            "full_name": email.split("@")[0],
            "password": "hunter2hunter2",
            "role": "volunteer",
        },
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]["id"]


def volunteer_headers(client: TestClient, email: str, org_slug: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "hunter2hunter2", "organization_slug": org_slug},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_shift(
    client: TestClient, headers: dict[str, str], capacity: int = 1
) -> tuple[str, str]:
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
            "capacity": capacity,
        },
        headers=headers,
    )
    assert shift.status_code == 201, shift.text
    return event.json()["id"], shift.json()["id"]


def test_self_signup_is_accepted_immediately(client: TestClient) -> None:
    headers = register(client, "self@example.com", "org-self")
    _, shift_id = create_shift(client, headers)

    response = client.post("/api/signups", json={"shift_id": shift_id}, headers=headers)
    assert response.status_code == 201
    assert response.json()["status"] == "accepted"


def test_self_signup_respects_capacity_with_no_waitlist(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-capacity")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    add_volunteer(client, admin_headers, "vol1@example.com")
    vol_headers = volunteer_headers(client, "vol1@example.com", "org-capacity")

    # Admin fills the one spot themselves first.
    fill = client.post("/api/signups", json={"shift_id": shift_id}, headers=admin_headers)
    assert fill.status_code == 201

    blocked = client.post("/api/signups", json={"shift_id": shift_id}, headers=vol_headers)
    assert blocked.status_code == 400
    assert "full" in blocked.json()["detail"].lower()


def test_admin_assignment_starts_pending_and_can_overbook(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-pending")
    event_id, shift_id = create_shift(client, admin_headers, capacity=1)
    vol1_id = add_volunteer(client, admin_headers, "vol1@example.com")
    vol2_id = add_volunteer(client, admin_headers, "vol2@example.com")

    first = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol1_id}, headers=admin_headers
    )
    assert first.status_code == 201
    assert first.json()["status"] == "pending"

    # Pending doesn't hold capacity, so a second invite for the same (1-capacity) shift
    # is allowed -- the admin can over-invite and let the first acceptor win.
    second = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol2_id}, headers=admin_headers
    )
    assert second.status_code == 201
    assert second.json()["status"] == "pending"

    shifts = client.get(f"/api/shifts?event_id={event_id}", headers=admin_headers).json()
    assert shifts[0]["open_slots"] == 1  # neither pending invite has been accepted yet


def test_accept_and_decline_flow(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-flow")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")
    vol_headers = volunteer_headers(client, "vol@example.com", "org-flow")

    invite = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    signup_id = invite.json()["id"]

    # The admin can't accept on the volunteer's behalf.
    assert client.post(f"/api/signups/{signup_id}/accept", headers=admin_headers).status_code == 404

    accepted = client.post(f"/api/signups/{signup_id}/accept", headers=vol_headers)
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    # Already accepted -- can't accept or decline again.
    assert client.post(f"/api/signups/{signup_id}/accept", headers=vol_headers).status_code == 400
    assert client.post(f"/api/signups/{signup_id}/decline", headers=vol_headers).status_code == 400


def test_decline_then_reinvite(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-decline")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol_id = add_volunteer(client, admin_headers, "vol@example.com")
    vol_headers = volunteer_headers(client, "vol@example.com", "org-decline")

    invite = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    signup_id = invite.json()["id"]

    declined = client.post(f"/api/signups/{signup_id}/decline", headers=vol_headers)
    assert declined.status_code == 200
    assert declined.json()["status"] == "declined"

    reinvite = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol_id}, headers=admin_headers
    )
    assert reinvite.status_code == 201
    assert reinvite.json()["status"] == "pending"
    assert reinvite.json()["id"] == signup_id  # reuses the same row


def test_accept_fails_once_shift_fills_up(client: TestClient) -> None:
    admin_headers = register(client, "admin@example.com", "org-race")
    _, shift_id = create_shift(client, admin_headers, capacity=1)
    vol1_id = add_volunteer(client, admin_headers, "vol1@example.com")
    vol2_id = add_volunteer(client, admin_headers, "vol2@example.com")
    vol1_headers = volunteer_headers(client, "vol1@example.com", "org-race")
    vol2_headers = volunteer_headers(client, "vol2@example.com", "org-race")

    invite1 = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol1_id}, headers=admin_headers
    ).json()
    invite2 = client.post(
        "/api/signups", json={"shift_id": shift_id, "user_id": vol2_id}, headers=admin_headers
    ).json()

    accept1 = client.post(f"/api/signups/{invite1['id']}/accept", headers=vol1_headers)
    assert accept1.status_code == 200
    too_late = client.post(f"/api/signups/{invite2['id']}/accept", headers=vol2_headers)
    assert too_late.status_code == 400
    assert "full" in too_late.json()["detail"].lower()
