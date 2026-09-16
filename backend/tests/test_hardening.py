"""Covers the second hardening pass: token revocation, login rate limiting,
an honest /health, a crash-proof MQTT callback and the periodic jobs."""
import os, pathlib, sys
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
for p in (patch("sqlalchemy.create_engine", return_value=MagicMock()),
          patch("pymysql.connect", return_value=MagicMock()),
          patch("mqtt_client.start_mqtt", return_value=MagicMock()),
          patch("scheduler.start_scheduler", return_value=MagicMock())):
    p.start()

import main, mqtt_client, scheduler
from auth import create_access_token
from fastapi.testclient import TestClient
from rate_limit import RateLimiter, login_limiter

client = TestClient(main.app, raise_server_exceptions=False)
fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)

TOKEN = create_access_token(1, "ada@b.co", "owner")
AUTH = {"Authorization": f"Bearer {TOKEN}"}

# ── Token revocation ────────────────────────────────────────────────────
print("\n== revocation des jetons ==")
login_limiter.reset()

with patch.object(main, "get_account_status", return_value=("ada@b.co", "owner", False)):
    r = client.get("/auth/me", headers=AUTH)
    check("compte actif : acces accorde", r.status_code == 200, r.text[:100])
    check("le role vient de la base", r.json().get("role") == "owner", r.json())

with patch.object(main, "get_account_status", return_value=("ada@b.co", "owner", True)):
    r = client.get("/auth/me", headers=AUTH)
    check("compte suspendu : 403 malgre un jeton valide", r.status_code == 403, r.status_code)

with patch.object(main, "get_account_status", return_value=None):
    r = client.get("/auth/me", headers=AUTH)
    check("compte supprime : 401 malgre un jeton valide", r.status_code == 401, r.status_code)

# An owner token must not become admin by claiming the role in the JWT.
forged = create_access_token(1, "ada@b.co", "admin")
with patch.object(main, "get_account_status", return_value=("ada@b.co", "owner", False)):
    r = client.get("/admin/users", headers={"Authorization": f"Bearer {forged}"})
    check("role 'admin' revendique dans le jeton ignore", r.status_code == 403, r.status_code)

# ── Rate limiting ───────────────────────────────────────────────────────
print("\n== limitation du debit ==")
login_limiter.reset()
with patch.object(main, "login_user", return_value=(None, "Incorrect password")):
    codes = [client.post("/auth/login", json={"email": "a@b.co", "password": "bad"}).status_code
             for _ in range(12)]
check("les 10 premieres tentatives passent au controle", codes[:10] == [401] * 10, codes[:10])
check("la 11e est bloquee en 429", codes[10] == 429, codes[10])
r = client.post("/auth/login", json={"email": "a@b.co", "password": "bad"})
check("l'en-tete Retry-After est renvoye", "retry-after" in {k.lower() for k in r.headers}, dict(r.headers))
check("le message 429 est une chaine", isinstance(r.json().get("detail"), str), r.json())

login_limiter.reset()
with patch.object(main, "login_user", return_value=(None, "Incorrect password")):
    for _ in range(9):
        client.post("/auth/login", json={"email": "a@b.co", "password": "bad"})
ok_login = ({"access_token": "t", "token_type": "bearer",
             "user": {"id": 1, "name": "A", "email": "a@b.co", "role": "owner"}}, None)
with patch.object(main, "login_user", return_value=ok_login):
    r = client.post("/auth/login", json={"email": "a@b.co", "password": "good"})
check("une connexion reussie remet le compteur a zero", r.status_code == 200, r.status_code)
with patch.object(main, "login_user", return_value=(None, "Incorrect password")):
    r = client.post("/auth/login", json={"email": "a@b.co", "password": "bad"})
check("le budget est bien reinitialise apres succes", r.status_code == 401, r.status_code)

lim = RateLimiter(max_attempts=2, window_seconds=300)
check("cle A et cle B ont des budgets separes",
      lim.check("a") == 0 and lim.check("b") == 0 and lim.check("a") == 0 and lim.check("a") > 0)
check("la duree d'attente annoncee est positive", lim.check("a") >= 1)

# ── /health ─────────────────────────────────────────────────────────────
print("\n== /health honnete ==")
with patch.object(mqtt_client, "_connected", True), \
     patch.object(main, "get_raw_db", return_value=MagicMock()):
    r = client.get("/health")
    check("tout est up : 200 healthy", r.status_code == 200 and r.json()["status"] == "healthy", r.json())

with patch.object(main, "get_raw_db", side_effect=OSError("db down")):
    r = client.get("/health")
    check("base injoignable : 503 degraded", r.status_code == 503, r.status_code)
    check("la base est signalee unavailable", r.json()["database"] == "unavailable", r.json())

with patch.object(mqtt_client, "_connected", False), \
     patch.object(main, "get_raw_db", return_value=MagicMock()):
    r = client.get("/health")
    check("broker injoignable : 503 degraded", r.status_code == 503 and r.json()["mqtt"] == "disconnected", r.json())

# ── MQTT callback ───────────────────────────────────────────────────────
print("\n== callback MQTT increvable ==")
class Msg:
    def __init__(self, topic, payload): self.topic, self.payload = topic, payload

for label, msg in [
    ("topic tronque", Msg("energibox", b'{"watts": 5}')),
    ("payload non-JSON", Msg("energibox/AA/consumption", b'pas du json')),
    ("payload non decodable", Msg("energibox/AA/consumption", b'\xff\xfe')),
    ("watts non numerique", Msg("energibox/AA/consumption", b'{"watts": "beaucoup"}')),
    ("watts absent", Msg("energibox/AA/consumption", b'{}')),
]:
    try:
        mqtt_client.on_message(None, None, msg)
        check(f"{label} : aucune exception", True)
    except Exception as e:
        check(f"{label} : aucune exception", False, repr(e))

with patch.object(mqtt_client, "_handle_message", side_effect=RuntimeError("base HS")):
    try:
        mqtt_client.on_message(None, None, Msg("energibox/AA/consumption", b"{}"))
        check("panne base pendant le traitement : aucune exception", True)
    except Exception as e:
        check("panne base pendant le traitement : aucune exception", False, repr(e))

# ── Scheduler jobs ──────────────────────────────────────────────────────
print("\n== jobs periodiques ==")
check("refresh_all_baselines existe et est appele par le scheduler",
      hasattr(__import__("alert_engine"), "refresh_all_baselines"))
with patch.object(scheduler, "refresh_baselines", side_effect=RuntimeError("boom")) as boom:
    scheduler._run_job("refresh_baselines", scheduler.refresh_baselines)
    check("un job qui plante n'interrompt pas le scheduler", boom.called)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
