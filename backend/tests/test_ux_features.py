"""Covers the endpoints added for the apps' ergonomics: switching a home or
room off in one request, the monthly budget, phone notification tokens,
and the live-change socket."""
import asyncio, os, pathlib, sys
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
import auth, live, mqtt_client, push, schemas
from fastapi.testclient import TestClient

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)

client = TestClient(main.app, raise_server_exceptions=False)
headers = {"Authorization": f"Bearer {auth.create_access_token(1, 'a@b.co')}"}
owner = patch.object(main, "get_account_status", return_value=("a@b.co", "owner", False))
owns_home = patch.object(main, "_verify_home_ownership", return_value=None)

DEVICES = [
    {"mac": "AA:00:00:00:00:01", "is_on": True, "room_id": 1},
    {"mac": "AA:00:00:00:00:02", "is_on": False, "room_id": 1},
    {"mac": "AA:00:00:00:00:03", "is_on": True, "room_id": 2},
]


# ── All off ─────────────────────────────────────────────────────────────
print("\n== tout eteindre ==")
sent = []
with owner, owns_home, \
     patch.object(main, "get_devices", return_value=DEVICES), \
     patch.object(mqtt_client, "send_command", side_effect=lambda mac, c: sent.append((mac, c)) or True), \
     patch.object(mqtt_client, "record_command_sent"):
    r = client.post("/homes/1/all-off", headers=headers)
check("repond 200", r.status_code == 200, r.text[:80])
check("n'eteint que les appareils allumes",
      sent == [("AA:00:00:00:00:01", "OFF"), ("AA:00:00:00:00:03", "OFF")], str(sent))

sent.clear()
with owner, owns_home, \
     patch.object(main, "_room_home_id", return_value=1), \
     patch.object(main, "get_devices", return_value=DEVICES), \
     patch.object(mqtt_client, "send_command", side_effect=lambda mac, c: sent.append((mac, c)) or True), \
     patch.object(mqtt_client, "record_command_sent"):
    r = client.post("/homes/1/all-off?room_id=2", headers=headers)
check("limite a une piece", sent == [("AA:00:00:00:00:03", "OFF")], str(sent))

with owner, owns_home, patch.object(main, "_room_home_id", return_value=7):
    r = client.post("/homes/1/all-off?room_id=5", headers=headers)
check("refuse une piece d'un autre foyer", r.status_code == 404, str(r.status_code))

with owner, owns_home, \
     patch.object(main, "get_devices", return_value=DEVICES), \
     patch.object(mqtt_client, "send_command", return_value=False):
    r = client.post("/homes/1/all-off", headers=headers)
check("broker injoignable : 503", r.status_code == 503, str(r.status_code))


# ── Budget ──────────────────────────────────────────────────────────────
print("\n== budget ==")
with owner, owns_home, patch.object(main, "_has_budget_column", False):
    r = client.put("/homes/1/budget?amount=15000", headers=headers)
check("sans migration 005 : 409", r.status_code == 409, str(r.status_code))
with owner, owns_home, patch.object(main, "_has_budget_column", True):
    r = client.put("/homes/1/budget?amount=-1", headers=headers)
check("budget negatif refuse", r.status_code == 400, str(r.status_code))


# ── Push tokens ─────────────────────────────────────────────────────────
print("\n== notifications ==")
def valid(**kw):
    try:
        schemas.PushTokenRequest(**kw)
        return True
    except Exception:
        return False
check("jeton Expo accepte", valid(token="ExponentPushToken[abcdefghij]", platform="ios", language="fr"))
check("jeton quelconque refuse", not valid(token="https://evil.example/aaaa", platform="ios"))
check("plateforme inconnue refusee", not valid(token="ExponentPushToken[abcdefghij]", platform="web"))

messages = push.build_messages(
    [("ExponentPushToken[a]", "fr", "Clim"), ("ExponentPushToken[b]", "en", "Fridge"),
     ("ExponentPushToken[c]", "de", "Oven")],
    "spike",
)
check("titre en francais", messages[0]["title"] == "Pic de consommation", messages[0]["title"])
check("corps avec l'appareil", "Clim" in messages[0]["body"])
check("titre en anglais", messages[1]["title"] == "Consumption spike")
check("langue inconnue : anglais", messages[2]["title"] == "Consumption spike")

with patch.object(push, "_has_table", False), patch("threading.Thread") as thread:
    push.notify_alert(1, "spike")
check("sans table : aucun envoi", not thread.called)


# ── Live socket ─────────────────────────────────────────────────────────
print("\n== temps reel ==")
with patch.object(live, "_authorize", return_value=None):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json({"token": "x", "home_id": 1})
        try:
            ws.receive_json()
            closed = False
        except Exception:
            closed = True
check("jeton invalide : connexion fermee", closed)

with patch.object(live, "_authorize", return_value=1):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json({"token": "x", "home_id": 1})
        hello = ws.receive_json()
check("jeton valide : ready", hello == {"type": "ready"}, str(hello))

# The poller compares fingerprints and fans a change out to each client.
base = {"devices": (1,), "alerts": (1, 0), "suggestions": (0, 0), "alert_max": 1, "new_alerts": []}
changed = dict(base, alerts=(2, 1), alert_max=2,
               new_alerts=[{"id": 2, "type": "spike", "appliance": "Clim"}])
fingerprints = iter([base, changed])

async def one_change():
    queue = asyncio.Queue()
    live._subscribers.clear(); live._last.clear()
    live._subscribers[1] = {queue}
    with patch.object(live, "_fingerprint", side_effect=lambda h: next(fingerprints)), \
         patch.object(live, "TICK_SECONDS", 0):
        task = asyncio.create_task(live._poll_forever())
        message = await asyncio.wait_for(queue.get(), 2)
        task.cancel()
    return message

message = asyncio.run(one_change())
check("signale les alertes nouvelles", message["topics"] == ["alerts"], str(message))
check("avec l'appareil concerne", message["new_alerts"][0]["appliance"] == "Clim")


print(f"\n{'OK' if not fails else 'ECHECS: ' + str(len(fails))}")
sys.exit(1 if fails else 0)
