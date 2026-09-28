"""
EnergiBox — automated tests of the REST API.

Place this file in the SAME folder as main.py, then run:

    pytest -v

The server does not need to be running: FastAPI's TestClient loads the
application in memory and calls it directly.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# A unique account, created once and reused by the whole suite
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def account():
    tag = uuid.uuid4().hex[:8]
    return {
        "name": f"Test User {tag}",
        "email": f"test_{tag}@energibox.cm",
        "password": "EnergiBox2026",
    }


@pytest.fixture(scope="session")
def registered(account):
    r = client.post("/auth/register", json=account)
    assert r.status_code in (200, 201), f"registration failed: {r.text}"
    return account


@pytest.fixture(scope="session")
def auth(registered):
    r = client.post("/auth/login", json={
        "email": registered["email"],
        "password": registered["password"],
    })
    assert r.status_code == 200, f"login failed: {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in the response: {data}"
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
class TestApiHealth:
    """Availability of the API"""

    def test_it_should_answer_upon_the_root_route(self):
        assert client.get("/").status_code == 200

    def test_it_should_publish_its_state_of_health(self):
        """200 when the whole chain is available, 503 when the MQTT broker is not."""
        r = client.get("/health")
        assert r.status_code in (200, 503)


# ---------------------------------------------------------------------------
class TestAuthentication:
    """Registration and connection of the users"""

    def test_it_should_register_a_new_user(self, registered):
        assert registered["email"].endswith("@energibox.cm")

    def test_it_should_refuse_an_already_registered_email(self, registered):
        r = client.post("/auth/register", json=registered)
        assert r.status_code in (400, 409, 422)

    def test_it_should_refuse_a_registration_without_an_email(self):
        r = client.post("/auth/register", json={"name": "X", "password": "EnergiBox2026"})
        assert r.status_code == 422

    def test_it_should_log_in_with_valid_credentials(self, auth):
        assert auth["Authorization"].startswith("Bearer ")

    def test_it_should_refuse_an_incorrect_password(self, registered):
        r = client.post("/auth/login", json={
            "email": registered["email"], "password": "wrong_password"})
        assert r.status_code in (400, 401)

    def test_it_should_refuse_an_unknown_email(self):
        r = client.post("/auth/login", json={
            "email": "nobody@energibox.cm", "password": "EnergiBox2026"})
        assert r.status_code in (400, 401, 404)

    def test_it_should_return_the_connected_user(self, auth):
        r = client.get("/auth/me", headers=auth)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
class TestSecurity:
    """Protection of the endpoints"""

    @pytest.mark.parametrize("route", [
        "/auth/me", "/rooms", "/homes", "/devices", "/alerts", "/schedules",
    ])
    def test_it_should_refuse_access_without_a_token(self, route):
        assert client.get(route).status_code in (401, 403)

    def test_it_should_refuse_an_invalid_token(self):
        r = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code in (401, 403)

    def test_it_should_refuse_the_administration_to_a_simple_user(self, auth):
        r = client.get("/admin/users", headers=auth)
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
class TestDwellings:
    """Consultation of the dwellings"""

    def test_it_should_return_the_dwellings_of_the_user(self, auth):
        r = client.get("/homes", headers=auth)
        assert r.status_code == 200

    def test_it_should_return_a_list(self, auth):
        assert isinstance(client.get("/homes", headers=auth).json(), list)


# ---------------------------------------------------------------------------
class TestTariffs:
    """Tariff scale applied to the consumption"""

    def test_it_should_return_the_tariffs(self, auth):
        r = client.get("/tariffs", headers=auth)
        assert r.status_code == 200

    def test_it_should_report_an_unknown_measuring_unit(self, auth):
        r = client.get("/devices/00:00:00:00:00:00", headers=auth)
        assert r.status_code in (404, 422)


# ---------------------------------------------------------------------------
class TestValidationOfTheRequests:
    """Validation of the parameters transmitted to the API"""

    @pytest.mark.parametrize("route", [
        "/rooms", "/devices", "/alerts", "/alerts/unread",
        "/schedules", "/suggestions",
    ])
    def test_it_should_refuse_a_request_without_its_parameters(self, auth, route):
        """The token is accepted (the code is 422 and not 401); only the
        identifier of the dwelling is missing."""
        r = client.get(route, headers=auth)
        assert r.status_code == 422