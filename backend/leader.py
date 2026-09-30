"""Which process does the background work.

main.py starts an MQTT client and a scheduler thread in every process
that imports it. With one uvicorn process that is fine. With
`--workers N` it meant N subscribers to energibox/#, so every reading was
stored N times — N times the kWh, N times the bill — and N schedulers
switching the same relays and calling the advisor N times.

Every worker still needs an MQTT client, to publish the commands its own
requests send. What must happen once is consuming telemetry and running
the scheduler, and this module elects the one worker that does it.

The election is a MySQL named lock, GET_LOCK(), held on a connection of
its own. MySQL grants it to one connection at a time and releases it the
moment that connection ends, so a worker that dies hands the role over
without anyone having to notice: the standbys retry on every check and
one of them gets it. No new table and no new service — the workers
already share the database.

Two things keep the holder honest. The lock connection is pinged on every
check, which also stops MySQL's wait_timeout from closing it while idle.
And the holder asks MySQL whether the lock is still its own; if the
connection dropped and came back, it is not, and the process stands down
before another one takes over.

When the database cannot be reached at all nobody is leader, so no
reading is stored and no schedule runs — but nothing could have been
stored anyway. The role is taken as soon as the database answers.
"""

import threading
import time

from config import get_dedicated_connection

LOCK_NAME = "energibox.background"

# How often a standby tries for the lock, and the holder re-checks it.
# Also the longest two processes could both believe they lead after the
# holder's connection is lost, so it is kept short.
CHECK_SECONDS = 10

_leader = False
_conn = None
_listeners = []
_state_lock = threading.Lock()


def is_leader() -> bool:
    """Whether this process consumes telemetry and runs the scheduler."""
    return _leader


def on_change(callback):
    """Call `callback(is_leader)` whenever this process gains or loses the
    role. mqtt_client subscribes and unsubscribes through this."""
    _listeners.append(callback)


def _set(value):
    global _leader
    with _state_lock:
        if _leader == value:
            return
        _leader = value
    print("leader: this process now runs the background work" if value
          else "leader: this process stands down from the background work")
    for callback in list(_listeners):
        try:
            callback(value)
        except Exception as exc:
            print(f"leader: listener failed: {exc!r}")


def _close():
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
    _conn = None


def check():
    """One round of the election. Returns whether this process leads.

    Exposed for the tests; the thread below calls it every CHECK_SECONDS.
    """
    global _conn
    try:
        if _leader:
            cursor = _conn.cursor()
            cursor.execute("SELECT IS_USED_LOCK(%s) = CONNECTION_ID()", (LOCK_NAME,))
            row = cursor.fetchone()
            if not (row and row[0] == 1):
                _close()
                _set(False)
            return _leader

        # A plain connection, never a pooled one: the lock lives exactly
        # as long as this connection, and a pool would hand it to someone
        # else or reset it.
        if _conn is None:
            _conn = get_dedicated_connection(autocommit=True)
        cursor = _conn.cursor()
        cursor.execute("SELECT GET_LOCK(%s, 0)", (LOCK_NAME,))
        row = cursor.fetchone()
        if row and row[0] == 1:
            _set(True)
        return _leader
    except Exception as exc:
        # Lost the connection, or never had one. Either way this process
        # cannot prove it holds the lock, so it does not act as if it did.
        if _leader:
            print(f"leader: lost the lock connection ({exc!r})")
        _close()
        _set(False)
        return False


def start():
    """Run the election in a daemon thread. The first round is synchronous,
    so a single-process deployment is leader before it serves a request."""
    check()

    def run():
        while True:
            time.sleep(CHECK_SECONDS)
            check()

    thread = threading.Thread(target=run, daemon=True, name="leader-election")
    thread.start()
    return thread
