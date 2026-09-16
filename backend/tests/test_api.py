"""Integration check for points 3-5. Stubs MySQL/MQTT, then drives the real
FastAPI app through TestClient."""
import os, pathlib, sys
from datetime import datetime
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


# ── Per-device history (device detail screen) ───────────────────────────
print("\n== /devices/{mac}/history ==")

class _HistoryDB:
    """Fake MySQL that answers the endpoint's four queries in order."""
    lastrowid = 1
    def __init__(self, found=True):
        self.found, self.calls, self._next = found, [], None
    def cursor(self): return self
    def execute(self, sql, params=()):
        flat = " ".join(sql.split())
        self.calls.append((flat, params))
        if "FROM monitored_points mp" in flat:
            # (point id, home id): the endpoint needs the home to know
            # which tariff band prices this device's share of the month.
            self._next = (7, 1) if self.found else None
        elif "HOUR(timestamp)" in flat:
            self._rows = [(h, 3600.0, 1800) for h in (9, 10, 11)]
        elif "DATE(timestamp)" in flat:
            self._rows = [("2026-09-14", 120.0, 43200), ("2026-09-15", 140.0, 43200)]
        elif "3600000" in flat or "/ 1000 / 1800" in flat:
            # Whichever way energy is computed, this is a kWh query.
            self._next = (4.5,)
    def fetchone(self): return self._next
    def fetchall(self): return getattr(self, "_rows", [])
    def close(self): pass

def _history(mac="AA:BB:CC:DD:EE:01", query="", found=True):
    db = _HistoryDB(found)
    with patch.object(main, "get_raw_db", return_value=db), \
         patch.object(main, "_mac_home_id", return_value=1), \
         patch.object(main, "_verify_home_ownership", return_value=None), \
         patch.object(main, "get_account_status", return_value=("a@b.co", "owner", False)):
        return client.get(f"/devices/{mac}/history{query}", headers={"Authorization": f"Bearer {TOKEN}"}), db

TOKEN = __import__("auth").create_access_token(1, "a@b.co", "owner")

r, db = _history()
check("24h renvoie 24 tranches horaires", r.status_code == 200 and len(r.json()["buckets"]) == 24,
      f"{r.status_code} {len(r.json().get('buckets', []))}")
body = r.json()
check("les heures sans relevé valent null, pas zéro",
      any(b["watts"] is None for b in body["buckets"]))
# The division happens in SQL, so the fake returns the post-division value
# and the endpoint only rounds it. What is worth asserting is the divisor
# actually present in the query.
hourly_sql = next(c[0] for c in db.calls if "HOUR(timestamp)" in c[0])
# Buckets are mean power: the energy measured in the bucket over the
# bucket's own length, not a row count over an assumed sample rate.
check("la tranche horaire est ramenee a 3600 s", "/ 3600 AS avg_watts" in hourly_sql,
      hourly_sql[:110])
check("la tranche horaire integre les intervalles mesures",
      "interval_s" in hourly_sql, hourly_sql[:110])
check("la valeur SQL est transmise telle quelle",
      any(b["watts"] == 3600.0 for b in body["buckets"]),
      [b["watts"] for b in body["buckets"] if b["watts"] is not None][:3])
check("la derniere tranche est l'heure courante",
      body["buckets"][-1]["label"] == f"{datetime.now().hour:02d}:00", body["buckets"][-1]["label"])
# The stub answers both month queries with 4.5 kWh, so the device is the
# whole home's month and its share is priced at that month's rate.
import tariff as _tariff
check("le cout mensuel suit le bareme, pas un tarif fixe",
      body["cost"]["estimated_fcfa"] == round(_tariff.cost_of_share(4.5, 4.5), 0),
      body["cost"])
check("la projection est presente", body["cost"]["projected_kwh"] > 0, body["cost"])

r, _ = _history(query="?range=7d")
check("7d renvoie des tranches journalieres",
      r.status_code == 200 and len(r.json()["buckets"]) == 2, r.status_code)
r7, db7 = _history(query="?range=7d")
daily_sql = next(c[0] for c in db7.calls if "DATE(timestamp)" in c[0])
check("la tranche journaliere est ramenee a 86400 s", "/ 86400 AS avg_watts" in daily_sql,
      daily_sql[:110])
check("la valeur journaliere est transmise telle quelle",
      r7.json()["buckets"][0]["watts"] == 120.0, r7.json()["buckets"][0])

r, _ = _history(query="?range=90d")
check("un range invalide est refuse", r.status_code == 400, r.status_code)

r, _ = _history(found=False)
check("un MAC inconnu renvoie 404", r.status_code == 404, r.status_code)

r = client.get("/devices/AA:BB/history")
check("l'historique exige un jeton", r.status_code in (401, 403), r.status_code)

# `range` is the query parameter name but shadows the builtin inside the
# function; the alias is what keeps range(23, -1, -1) working.
import inspect
sig = inspect.signature(main.get_device_history)
check("le parametre n'est pas nomme 'range' dans la fonction",
      "range" not in sig.parameters, list(sig.parameters))

# ── Tariff reference ────────────────────────────────────────────────────
print("\n== /tariffs ==")

with patch.object(main, "get_account_status", return_value=("a@b.co", "owner", False)):
    r = client.get("/tariffs", headers={"Authorization": f"Bearer {TOKEN}"})
check("/tariffs repond", r.status_code == 200, r.status_code)
tariffs = r.json()
check("les bandes residentielles sont progressives",
      [b["fcfa_per_kwh"] for b in tariffs["bands"]["residential"]] == [50, 79, 94, 99],
      tariffs["bands"]["residential"])
check("les bandes se suivent sans trou",
      all(tariffs["bands"]["residential"][i]["to_kwh"] + 1 == tariffs["bands"]["residential"][i + 1]["from_kwh"]
          for i in range(len(tariffs["bands"]["residential"]) - 1)))
check("le mode de facturation est expose", tariffs["mode"] == "threshold", tariffs["mode"])
check("plus d'ecart entre le bareme et la facturation",
      tariffs["applied"]["matches_schedule"] is True
      and tariffs["applied"]["fcfa_per_kwh"] is None, tariffs["applied"])
check("aucune TVA n'est ajoutee", tariffs["vat"]["charged"] is False, tariffs["vat"])
check("aucune charge fixe", tariffs["fixed_charge_fcfa"] == 0)
check("l'absence de tarification horaire est declaree", tariffs["time_of_use"] is False)
check("l'etendue de la verification est declaree",
      tariffs["verified"]["bills"] == 5 and tariffs["verified"]["up_to_kwh"] == 216,
      tariffs["verified"])
check("la source est attribuee",
      tariffs["source"]["regulator"] == "ARSEL"
      and tariffs["source"]["verified_against_bills"] is True,
      tariffs["source"])
check("/tariffs exige un jeton", client.get("/tariffs").status_code in (401, 403))

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
