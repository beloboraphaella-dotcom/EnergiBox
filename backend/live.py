"""Live change notifications over a WebSocket.

The apps used to poll every screen's endpoints every two or three seconds,
in the background too, whether or not anything had changed. Instead they
now hold one socket per home and refetch when told something changed; the
poll remains as a slow fallback for when the socket is down.

What travels is a signal, not the data: the socket says *which* part of a
home changed ("devices", "alerts", "suggestions") and the app refetches
it through the usual endpoints. The endpoints stay the single source of
truth, and the socket carries no more than a fingerprint of each home.

Why a fingerprint and not MQTT: with --workers N only the leader consumes
telemetry (see leader.py), but a client's socket can land on any worker.
Every worker can read the database, so each one watches the homes its own
clients follow. The query is cheap — it only touches `energiboxes`,
`alerts` and `ai_suggestions` rows for that home — and it runs once per
home per tick, however many clients follow that home.

Protocol
    client → {"token": "<jwt>", "home_id": 12}          first message, within 10 s
    server → {"type": "ready"}
    server → {"type": "changed", "topics": ["devices", "alerts"],
              "new_alerts": [{"id", "type", "appliance"}]}
    server → {"type": "ping"}                             every 25 s of silence

The token travels in the first message rather than in the URL so that it
never ends up in an access log. Authentication is by bearer token, not
cookie, so a page on another origin cannot ride a user's session: it has
no token to send.
"""

import asyncio
import json

from fastapi import WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from auth import decode_token, get_account_status
from config import get_connection

TICK_SECONDS = 2
PING_SECONDS = 25
AUTH_TIMEOUT_SECONDS = 10
# A suspended or deleted account loses its socket within this long.
RECHECK_SECONDS = 60

# home_id -> set of asyncio.Queue, one per connected client
_subscribers: dict[int, set] = {}
_last: dict[int, dict] = {}
_poller = None


def _fingerprint(home_id: int) -> dict:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # last_seen moves with every reading, status with the offline
        # sweep, last_commanded_state with every switch, and the count with
        # a device being added or removed.
        cursor.execute("""
            SELECT MAX(e.last_seen),
                   GROUP_CONCAT(CONCAT(e.id, ':', e.status, ':', IFNULL(e.last_commanded_state, '-'))
                                ORDER BY e.id),
                   COUNT(*)
            FROM energiboxes e
            JOIN monitored_points mp ON mp.energibox_id = e.id
            JOIN rooms rm ON mp.room_id = rm.id
            WHERE rm.home_id = %s
        """, (home_id,))
        last_seen, states, count = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) FROM rooms WHERE home_id = %s", (home_id,))
        rooms = cursor.fetchone()[0]
        cursor.execute("""
            SELECT IFNULL(MAX(a.id), 0), IFNULL(SUM(a.read_status = FALSE), 0)
            FROM alerts a
            JOIN monitored_points mp ON a.monitored_point_id = mp.id
            JOIN rooms rm ON mp.room_id = rm.id
            WHERE rm.home_id = %s
        """, (home_id,))
        alert_max, unread = cursor.fetchone()
        cursor.execute("""
            SELECT IFNULL(MAX(s.id), 0), IFNULL(SUM(s.status = 'pending'), 0)
            FROM ai_suggestions s
            JOIN monitored_points mp ON s.monitored_point_id = mp.id
            JOIN rooms rm ON mp.room_id = rm.id
            WHERE rm.home_id = %s
        """, (home_id,))
        suggestion_max, pending = cursor.fetchone()

        new_alerts = []
        previous = _last.get(home_id)
        if previous and alert_max > previous["alert_max"]:
            cursor.execute("""
                SELECT a.id, a.type, mp.name
                FROM alerts a
                JOIN monitored_points mp ON a.monitored_point_id = mp.id
                JOIN rooms rm ON mp.room_id = rm.id
                WHERE rm.home_id = %s AND a.id > %s
                ORDER BY a.id LIMIT 5
            """, (home_id, previous["alert_max"]))
            new_alerts = [
                {"id": row[0], "type": row[1], "appliance": row[2]}
                for row in cursor.fetchall()
            ]
        return {
            "devices": (str(last_seen), states, int(count), int(rooms)),
            "alerts": (int(alert_max), int(unread)),
            "suggestions": (int(suggestion_max), int(pending)),
            "alert_max": int(alert_max),
            "new_alerts": new_alerts,
        }
    finally:
        conn.close()


async def _poll_forever():
    while True:
        await asyncio.sleep(TICK_SECONDS)
        for home_id in list(_subscribers):
            queues = _subscribers.get(home_id)
            if not queues:
                _subscribers.pop(home_id, None)
                _last.pop(home_id, None)
                continue
            try:
                current = await run_in_threadpool(_fingerprint, home_id)
            except Exception as exc:
                print(f"live: fingerprint for home {home_id} failed ({exc!r})")
                continue
            previous = _last.get(home_id)
            _last[home_id] = current
            if previous is None:
                continue
            topics = [
                topic for topic in ("devices", "alerts", "suggestions")
                if current[topic] != previous[topic]
            ]
            if topics:
                message = {"type": "changed", "topics": topics, "new_alerts": current["new_alerts"]}
                for queue in list(queues):
                    queue.put_nowait(message)


def _ensure_poller():
    global _poller
    if _poller is None or _poller.done():
        _poller = asyncio.get_running_loop().create_task(_poll_forever())


def _authorize(token, home_id):
    """Return the user id if the token is valid, the account active and
    the home theirs; None otherwise."""
    payload = decode_token(token) if isinstance(token, str) else None
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub"))
        home_id = int(home_id)
    except (TypeError, ValueError):
        return None
    if not _account_active(user_id):
        return None
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM homes WHERE id = %s AND user_id = %s", (home_id, user_id))
        return user_id if cursor.fetchone() else None
    finally:
        conn.close()


def _account_active(user_id):
    account = get_account_status(user_id)
    return account is not None and not account[2]


async def serve(websocket: WebSocket):
    await websocket.accept()
    try:
        first = await asyncio.wait_for(websocket.receive_text(), AUTH_TIMEOUT_SECONDS)
        hello = json.loads(first)
        home_id = int(hello.get("home_id"))
        user_id = await run_in_threadpool(_authorize, hello.get("token"), home_id)
    except (asyncio.TimeoutError, ValueError, TypeError, AttributeError, WebSocketDisconnect):
        user_id = None
    if user_id is None:
        # 4401 mirrors HTTP 401 in the private-use close-code range.
        await websocket.close(code=4401)
        return

    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(home_id, set()).add(queue)
    _ensure_poller()
    await websocket.send_json({"type": "ready"})

    async def drain_client():
        # The client sends nothing after the handshake; reading is how a
        # closed socket is noticed.
        while True:
            await websocket.receive_text()

    reader = asyncio.create_task(drain_client())
    loop = asyncio.get_running_loop()
    checked_at = loop.time()
    try:
        while True:
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({reader, getter}, timeout=PING_SECONDS,
                                         return_when=asyncio.FIRST_COMPLETED)
            if reader in done:
                getter.cancel()
                break
            if getter in done:
                message = getter.result()
            else:
                getter.cancel()
                message = {"type": "ping"}
            if loop.time() - checked_at >= RECHECK_SECONDS:
                checked_at = loop.time()
                if not await run_in_threadpool(_account_active, user_id):
                    await websocket.close(code=4403)
                    break
            await websocket.send_json(message)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        reader.cancel()
        queues = _subscribers.get(home_id)
        if queues is not None:
            queues.discard(queue)
