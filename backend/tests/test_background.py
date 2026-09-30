"""Covers three fixes: PUT /auth/profile answering 500, background work
running once per worker instead of once per deployment, and the scheduler
and advisor losing or repeating what they were meant to do once."""
import os, pathlib, sys
from datetime import datetime, time, timedelta
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

with patch("sqlalchemy.create_engine", return_value=MagicMock()), \
     patch("pymysql.connect", return_value=MagicMock()), \
     patch("mqtt_client.start_mqtt", return_value=MagicMock()), \
     patch("leader.start", return_value=MagicMock()), \
     patch("scheduler.start_scheduler", return_value=MagicMock()):
    import main
import ai_advisor, auth, leader, mqtt_client, scheduler
from fastapi.testclient import TestClient

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


# ── PUT /auth/profile ───────────────────────────────────────────────────
print("\n== profil ==")
client = TestClient(main.app, raise_server_exceptions=False)
headers = {"Authorization": f"Bearer {auth.create_access_token(1, 'a@b.co')}"}
saved = {}
with patch.object(main, "get_account_status", return_value=("a@b.co", "owner", False)), \
     patch.object(main, "update_user_name", side_effect=lambda uid, n: saved.update(n=n)):
    r = client.put("/auth/profile", json={"name": "Ada"}, headers=headers)
check("PUT /auth/profile repond 200", r.status_code == 200, f"{r.status_code} {r.text[:80]}")
check("et renvoie le nom enregistre", r.status_code == 200 and r.json().get("name") == "Ada", r.text[:80])
check("le nom atteint bien la base", saved.get("n") == "Ada")


# ── Leader election ─────────────────────────────────────────────────────
print("\n== election du processus leader ==")

class LockServer:
    """MySQL's named locks, as far as leader.py can see them."""
    def __init__(self):
        self.owner, self.next_id = None, 0
    def connect(self, **_):
        self.next_id += 1
        return LockConn(self, self.next_id)

class LockConn:
    def __init__(self, server, conn_id):
        self.server, self.id, self.alive, self._row = server, conn_id, True, None
    def cursor(self): return self
    def execute(self, sql, params=()):
        if not self.alive:
            raise RuntimeError("Lost connection to MySQL server")
        if "GET_LOCK" in sql:
            if self.server.owner in (None, self.id):
                self.server.owner = self.id
                self._row = (1,)
            else:
                self._row = (0,)
        elif "IS_USED_LOCK" in sql:
            self._row = (1 if self.server.owner == self.id else 0,)
    def fetchone(self): return self._row
    def close(self):
        self.alive = False
        if self.server.owner == self.id:
            self.server.owner = None  # MySQL frees a lock with its connection

def fresh_leader(server):
    leader._leader, leader._conn = False, None
    return patch.object(leader, "get_dedicated_connection", server.connect)

server = LockServer()
events = []
leader._listeners[:] = [events.append]
with fresh_leader(server):
    check("le premier processus prend le role", leader.check() is True)
    check("et le garde au controle suivant", leader.check() is True)
    check("les abonnes sont prevenus", events == [True], events)
    mine = leader._conn

    # A second worker: same server, its own module state.
    leader._leader, leader._conn = False, None
    check("un second processus reste en attente", leader.check() is False)
    standby = leader._conn

    # The holder's connection dies: MySQL frees the lock.
    mine.close()
    leader._leader, leader._conn = True, mine
    check("le leader dont la connexion tombe se retire", leader.check() is False)
    check("et le signale", events[-1] is False, events)

    leader._leader, leader._conn = False, standby
    check("le processus en attente reprend le role", leader.check() is True)

    # The lock taken by someone else while the holder still has a live
    # connection (e.g. it reconnected under the hood): stand down.
    server.owner = 999
    check("un verrou qui n'est plus a soi fait abandonner le role", leader.check() is False)

with patch.object(leader, "get_dedicated_connection", side_effect=RuntimeError("down")):
    leader._leader, leader._conn = False, None
    check("sans base, personne n'est leader", leader.check() is False)
leader._listeners[:] = []


# ── MQTT follows leadership ─────────────────────────────────────────────
print("\n== MQTT : seul le leader consomme ==")
fake = MagicMock()
with patch.object(mqtt_client, "_mqtt_client", fake), patch.object(mqtt_client, "_connected", True):
    with patch.object(leader, "_leader", False):
        fake.reset_mock()
        mqtt_client.on_connect(fake, None, {}, 0)
        check("un processus en attente ne s'abonne pas", not fake.subscribe.called)
        with patch.object(mqtt_client, "_handle_message") as handled:
            mqtt_client.on_message(fake, None, MagicMock(topic="energibox/AA/consumption"))
            check("ni ne stocke un message recu", not handled.called)
    with patch.object(leader, "_leader", True):
        fake.reset_mock()
        mqtt_client.on_connect(fake, None, {}, 0)
        check("le leader s'abonne a la connexion", fake.subscribe.called)
        with patch.object(mqtt_client, "_handle_message") as handled:
            mqtt_client.on_message(fake, None, MagicMock(topic="energibox/AA/consumption"))
            check("et stocke les messages", handled.called)
    fake.reset_mock()
    mqtt_client._follow_leadership(True)
    check("prendre le role abonne", fake.subscribe.called)
    mqtt_client._follow_leadership(False)
    check("le perdre desabonne", fake.unsubscribe.called)


# ── Scheduler ───────────────────────────────────────────────────────────
print("\n== programmations ==")

def run_ticks(rows, ticks, send_ok=True):
    """Drive check_schedules over `ticks`, returning the commands sent."""
    sent = []
    conn = MagicMock()
    conn.cursor.return_value.fetchall.return_value = rows
    def send(mac, command):
        sent.append((mac, command))
        return send_ok if not callable(send_ok) else send_ok()
    with patch.object(scheduler, "get_db", return_value=conn), \
         patch.object(scheduler, "send_command", side_effect=send), \
         patch.object(scheduler, "record_command_sent"):
        for tick in ticks:
            scheduler.check_schedules(tick)
    return sent

def day(h, m, s=0):
    return datetime(2026, 9, 30, h, m, s)

# The driver's own format: TIME comes back as timedelta, unpadded when
# rendered — which is why a 05:00 schedule never used to fire.
morning = [(1, timedelta(hours=5), timedelta(hours=7), "Chauffe-eau", "AA:01", "OFF")]
scheduler.reset_schedule_state()
ticks = [day(4, 59, 40), day(5, 0, 10), day(5, 0, 40), day(5, 1, 10)]
sent = run_ticks(morning, ticks)
check("une programmation a 05:00 se declenche (timedelta non padde)",
      ("AA:01", "ON") in sent, sent)
check("une seule fois, malgre deux ticks dans la minute",
      sent.count(("AA:01", "ON")) == 1, sent)

scheduler.reset_schedule_state()
sent = run_ticks(morning, [day(4, 0), day(4, 30), day(8, 0)])
check("une echeance manquee entre deux ticks espaces est rattrapee",
      sent == [("AA:01", "OFF")], sent)
check("seule la derniere echeance compte (pas de ON puis OFF)",
      ("AA:01", "ON") not in sent, sent)

print("\n== alignement au demarrage ==")
night = [(2, time(22, 0), time(5, 0), "Clim", "AA:02", "ON")]
scheduler.reset_schedule_state()
sent = run_ticks(night, [day(9, 0)])
check("au demarrage hors fenetre, un appareil laisse allume est eteint",
      sent == [("AA:02", "OFF")], sent)

night_off = [(2, time(22, 0), time(5, 0), "Clim", "AA:02", "OFF")]
scheduler.reset_schedule_state()
sent = run_ticks(night_off, [day(23, 0)])
check("dans une fenetre qui passe minuit, il est allume", sent == [("AA:02", "ON")], sent)

scheduler.reset_schedule_state()
sent = run_ticks(night_off, [day(9, 0)])
check("deja dans l'etat voulu : aucune commande", sent == [], sent)

scheduler.reset_schedule_state()
run_ticks([], [day(23, 0)])                      # scheduler already running
sent = run_ticks(night_off, [day(23, 0, 30)])    # schedule appears mid-window
check("une programmation creee en pleine fenetre n'allume pas d'office",
      sent == [], sent)

print("\n== broker indisponible ==")
scheduler.reset_schedule_state()
run_ticks(morning, [day(4, 59, 40)])
sent = run_ticks(morning, [day(5, 0, 10)], send_ok=False)
check("une commande non publiee est gardee", "AA:01" in scheduler._pending, scheduler._pending)
sent = run_ticks(morning, [day(5, 0, 40)])
check("et renvoyee au tick suivant", sent == [("AA:01", "ON")], sent)
check("puis oubliee une fois passee", "AA:01" not in scheduler._pending)

print("\n== fenetres ==")
check("fenetre simple", scheduler.in_window(day(6, 0), time(5), time(7)))
check("borne de fin exclue", not scheduler.in_window(day(7, 0), time(5), time(7)))
check("fenetre qui passe minuit, apres minuit", scheduler.in_window(day(1, 0), time(22), time(5)))
check("fenetre vide", not scheduler.in_window(day(5, 0), time(5), time(5)))

print("\n== seul le leader agit ==")
src = pathlib.Path(scheduler.__file__).read_text()
check("la boucle consulte le leader", "leader.is_leader()" in src)


# ── Advisor ─────────────────────────────────────────────────────────────
print("\n== suggestions ==")

class SuggestionDB:
    """ai_suggestions, pending rows only."""
    def __init__(self, with_kind):
        self.rows, self.with_kind, self._row = [], with_kind, None
    def cursor(self): return self
    def commit(self): pass
    def close(self): pass
    def fetchone(self): return self._row
    def execute(self, sql, params=()):
        flat = " ".join(sql.split())
        if flat.startswith("SELECT id FROM ai_suggestions"):
            point = params[0]
            matches = [r for r in self.rows if r["point"] == point and r["status"] == "pending"]
            if "kind = %s" in flat:
                matches = sorted((r for r in matches if r["kind"] in (params[1], None)),
                                 key=lambda r: r["kind"] is None)
            self._row = (matches[0]["id"],) if matches else None
        elif flat.startswith("UPDATE"):
            row = next(r for r in self.rows if r["id"] == params[-1])
            row["text"] = params[0]
            if "kind = %s" in flat:
                row["kind"] = params[3]
        elif flat.startswith("INSERT"):
            self.rows.append({"id": len(self.rows) + 1, "point": params[0], "text": params[1],
                              "status": "pending",
                              "kind": params[4] if self.with_kind else None})

three = [
    {"kind": "standby", "monitored_point_id": 7, "suggestion_text": "veille", "estimated_saving_fcfa": 300},
    {"kind": "dominant", "monitored_point_id": 7, "suggestion_text": "dominant", "estimated_saving_fcfa": 900},
    {"kind": "band", "monitored_point_id": 7, "suggestion_text": "tranche", "estimated_saving_fcfa": 4770},
]

db = SuggestionDB(with_kind=True)
with patch.object(ai_advisor, "get_db", return_value=db), \
     patch.object(ai_advisor, "_has_kind_column", True), \
     patch.object(ai_advisor, "_home_ids", return_value=[1]), \
     patch("bilingual._has_columns", False), \
     patch.object(ai_advisor, "build_suggestions", return_value=three):
    ai_advisor.run_ai_advisor()
    ai_advisor.run_ai_advisor()
texts = sorted(r["text"] for r in db.rows)
check("avec la migration, les trois suggestions coexistent",
      texts == ["dominant", "tranche", "veille"], texts)
check("un second passage les remplace sans les dupliquer", len(db.rows) == 3, len(db.rows))

db = SuggestionDB(with_kind=True)
db.rows.append({"id": 1, "point": 7, "text": "ancienne", "status": "pending", "kind": None})
with patch.object(ai_advisor, "get_db", return_value=db), \
     patch.object(ai_advisor, "_has_kind_column", True):
    ai_advisor.save_suggestion(three[2])
check("une suggestion non typee d'avant la migration est reprise, pas doublee",
      len(db.rows) == 1 and db.rows[0]["kind"] == "band", db.rows)

db = SuggestionDB(with_kind=False)
with patch.object(ai_advisor, "get_db", return_value=db), \
     patch.object(ai_advisor, "_has_kind_column", False), \
     patch.object(ai_advisor, "_home_ids", return_value=[1]), \
     patch("bilingual._has_columns", False), \
     patch.object(ai_advisor, "build_suggestions", return_value=three):
    ai_advisor.run_ai_advisor()
check("sans la migration, la suggestion gardee est celle qui rapporte le plus",
      [r["text"] for r in db.rows] == ["tranche"], db.rows)

built_kinds = pathlib.Path(ai_advisor.__file__).read_text().count('"kind": "')
check("chaque type de suggestion porte son genre", built_kinds == 4, built_kinds)

print()
if fails:
    print(f"{len(fails)} ECHEC(S)")
    sys.exit(1)
print("TOUS LES TESTS PASSENT")
