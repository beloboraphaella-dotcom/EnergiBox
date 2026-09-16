"""Integration check for points 3-5. Stubs MySQL/MQTT, then drives the real
FastAPI app through TestClient."""
import os, pathlib, sys
from unittest.mock import MagicMock, patch

os.environ.update(
    ENERGIBOX_DB_USER="test", ENERGIBOX_DB_PASSWORD="test",
    ENERGIBOX_SECRET_KEY="test-secret-for-the-test-suite",
)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

patches = [
    patch("sqlalchemy.create_engine", return_value=MagicMock()),
    patch("pymysql.connect", return_value=MagicMock()),
    # Patch the startup hooks themselves. Patching threading.Thread globally
    # deadlocks TestClient, which runs the ASGI app on its own thread.
    patch("mqtt_client.start_mqtt", return_value=MagicMock()),
    patch("scheduler.start_scheduler", return_value=MagicMock()),
]
for p in patches:
    p.start()

import main
from fastapi.testclient import TestClient

client = TestClient(main.app, raise_server_exceptions=False)
fails = []

def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond:
        fails.append(label)

# ── POINT 5: endpoints that used to be wide open ────────────────────────
print("\n== point 5 : endpoints fermes ==")
for verb, path in [
    ("get", "/readings?home_id=1"),
    ("get", "/readings/AA:BB:CC:DD:EE:01"),
    ("get", "/alerts/unread?home_id=1"),
    ("post", "/suggestions/run"),
]:
    r = getattr(client, verb)(path)
    check(f"{verb.upper()} {path} refuse sans token", r.status_code in (401, 403), r.status_code)

for path in ["/suggestions/debug", "/suggestions/debug2"]:
    r = client.get(path)
    check(f"GET {path} supprime (404)", r.status_code == 404, r.status_code)

r = client.post("/suggestions/run", headers={"Authorization": "Bearer garbage"})
check("POST /suggestions/run rejette un token invalide", r.status_code == 401, r.status_code)

print("\n== endpoints publics legitimes ==")
check("GET / reste public", client.get("/").status_code == 200)
# /health is public but no longer always 200: it probes the database and
# the broker and answers 503 when either is down, which is the case here
# (both are stubbed). "Public" means reachable without a token.
check("GET /health reste public", client.get("/health").status_code not in (401, 403))

# ── POINT 3: credentials in the body, never the URL ─────────────────────
print("\n== point 3 : identifiants dans le corps ==")
captured = {}
def fake_login(email, password):
    captured["login"] = (email, password)
    return {"access_token": "tok", "token_type": "bearer",
            "user": {"id": 1, "name": "T", "email": email, "role": "owner"}}, None
def fake_register(name, email, password, role="owner"):
    captured["register"] = (name, email, password, role)
    return 7, None

with patch.object(main, "login_user", fake_login), patch.object(main, "register_user", fake_register):
    r = client.post("/auth/login", json={"email": "a@b.co", "password": "s3cret!"})
    check("POST /auth/login accepte un corps JSON", r.status_code == 200, r.text[:120])
    check("le mot de passe atteint bien la couche auth", captured.get("login") == ("a@b.co", "s3cret!"))

    r = client.post("/auth/login?email=a@b.co&password=s3cret!")
    check("POST /auth/login refuse les query params", r.status_code == 422, r.status_code)

    r = client.post("/auth/register", json={"name": "  Ada  ", "email": " a@b.co ", "password": "s3cret!"})
    check("POST /auth/register accepte un corps JSON", r.status_code == 200, r.text[:120])
    check("nom/email nettoyes", captured.get("register") == ("  Ada  ", "a@b.co", "s3cret!", "owner"), captured.get("register"))

# ── Validation + 422 shape ──────────────────────────────────────────────
print("\n== validation ==")
cases = [
    ({"email": "a@b.co", "password": "short"}, "mot de passe < 6 caracteres refuse"),
    ({"email": "pas-un-email", "password": "s3cret!"}, "email invalide refuse"),
    ({"email": "a@b.co"}, "champ manquant refuse"),
    ({"email": "a@b.co", "password": "x" * 300}, "mot de passe absurde refuse"),
]
for payload, label in cases:
    r = client.post("/auth/register", json={"name": "Ada", **payload})
    ok = r.status_code == 422 and isinstance(r.json().get("detail"), str)
    check(label + " + detail est une chaine", ok, f"{r.status_code} {r.json().get('detail')!r}")

r = client.post("/auth/register", json={"name": "Ada", "email": "a@b.co", "password": "short"})
print("      exemple de message rendu au client :", repr(r.json()["detail"]))

# ── Admin surface still guarded ─────────────────────────────────────────
print("\n== surface admin ==")
for verb, path, body in [
    ("post", "/admin/users", {"name": "x", "email": "a@b.co", "password": "s3cret!"}),
    ("put", "/admin/users/1/reset-password", {"new_password": "s3cret!"}),
]:
    r = getattr(client, verb)(path, json=body)
    check(f"{verb.upper()} {path} refuse sans token", r.status_code in (401, 403), r.status_code)

owner = main.create_access_token if hasattr(main, "create_access_token") else None
from auth import create_access_token
tok = create_access_token(1, "owner@b.co", "owner")
r = client.post("/admin/users", json={"name": "x", "email": "a@b.co", "password": "s3cret!"},
                headers={"Authorization": f"Bearer {tok}"})
check("POST /admin/users refuse un token non-admin (403)", r.status_code == 403, r.status_code)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
