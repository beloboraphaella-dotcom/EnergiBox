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

# ── A rate limit shared between workers ─────────────────────────────────
print("\n== budget d'authentification partage ==")
import rate_limit

class CounterDB:
    """One auth_attempts row, maintained the way MySQL would."""
    def __init__(self, fail=False):
        self.rows, self.calls, self.fail, self._next = {}, [], fail, None
        self.seconds_left = 240
    def cursor(self): return self
    def execute(self, sql, params=()):
        if self.fail:
            raise RuntimeError("table is gone")
        flat = " ".join(sql.split())
        self.calls.append((flat, params))
        if flat.startswith("INSERT INTO auth_attempts"):
            key = params[0]
            self.rows[key] = self.rows.get(key, 0) + 1
        elif flat.startswith("SELECT attempts"):
            self._next = (self.rows.get(params[1], 0), self.seconds_left)
        elif flat.startswith("DELETE FROM auth_attempts"):
            if "LIKE" in flat and "window_start" not in flat:
                prefix = params[0].rstrip("%")
                for k in [k for k in self.rows if k.startswith(prefix)]:
                    del self.rows[k]
            elif "bucket_key = " in flat:
                self.rows.pop(params[0], None)
            else:
                self.rows.clear()
    def fetchone(self): return self._next
    def commit(self): pass
    def close(self): pass

limiter = rate_limit.SharedRateLimiter(max_attempts=3, window_seconds=300,
                                       name="test")

rate_limit._table_present = False
for _ in range(3):
    limiter.check("ip:1.2.3.4")
check("sans la table, le compteur reste en memoire",
      limiter.check("ip:1.2.3.4") > 0 and limiter.local._hits, len(limiter.local._hits))
limiter.local.reset()

rate_limit._table_present = True
db = CounterDB()
with patch.object(rate_limit, "get_db", return_value=db):
    verdicts = [limiter.check("ip:1.2.3.4") for _ in range(4)]
check("les trois premieres tentatives passent", verdicts[:3] == [0, 0, 0], verdicts)
check("la quatrieme est refusee", verdicts[3] > 0, verdicts)
check("le delai d'attente vient de la fenetre en base", verdicts[3] == 240, verdicts[3])
check("le compteur est partage, pas en memoire", not limiter.local._hits)
check("la cle porte le nom du limiteur",
      all(p[0].startswith("test:") for sql, p in db.calls if p and "INSERT" in sql),
      [p for sql, p in db.calls if "INSERT" in sql][:1])
upsert = next(sql for sql, _ in db.calls if sql.startswith("INSERT INTO auth_attempts"))
check("une fenetre expiree repart de un, dans la meme requete",
      "ON DUPLICATE KEY UPDATE" in upsert and "attempts = IF(" in upsert, upsert[:80])

# A second worker shares the count: same table, same budget.
with patch.object(rate_limit, "get_db", return_value=db):
    other_worker = rate_limit.SharedRateLimiter(3, 300, "test")
    check("un autre worker herite du compteur deja consomme",
          other_worker.check("ip:1.2.3.4") > 0)

with patch.object(rate_limit, "get_db", return_value=db):
    limiter.reset("ip:1.2.3.4")
    check("une connexion reussie efface le compteur",
          limiter.check("ip:1.2.3.4") == 0, db.rows)

db.rows["test:ip:9.9.9.9"] = 99
with patch.object(rate_limit, "get_db", return_value=db):
    limiter.purge_expired()
check("le balayage supprime les fenetres expirees",
      any(sql.startswith("DELETE FROM auth_attempts") and "window_start" in sql
          for sql, _ in db.calls))
check("le scheduler appelle bien ce balayage", hasattr(scheduler, "purge_rate_limits"))

# The database failing must not hand out free attempts.
broken = CounterDB(fail=True)
limiter.local.reset()
with patch.object(rate_limit, "get_db", return_value=broken):
    verdicts = [limiter.check("ip:5.5.5.5") for _ in range(4)]
check("une base en panne ne leve pas", True)
check("elle retombe sur le budget local, sans ouvrir les vannes",
      verdicts[:3] == [0, 0, 0] and verdicts[3] > 0, verdicts)

rate_limit._table_present = False
check("l'etat est expose", rate_limit.is_shared() is False)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
