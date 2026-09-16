"""How long appliances run, learned from the live stream.

`baselines.avg_runtime_min` was read by the extended-runtime alert and
written by nothing, so that alert could never fire — the column was
always NULL and the check returned early every time. This module fills
it, and fixes what the alert did with it.

The old measure of "how long has this been running" counted rows above
10 W among the last 150 readings and multiplied by two seconds. Three
things were wrong with it: the rows did not have to be consecutive, so
an appliance that cycled on and off all afternoon looked like one long
run; 150 readings caps the answer at five minutes, so nothing could ever
exceed twice a baseline of more than 2.5 minutes; and the two seconds
was the same assumed cadence energy.py stopped trusting.

What replaces it is a session, tracked as readings arrive:

  start   the first reading at or above ON_WATTS after a quiet period
  end     the first reading below it — or silence longer than
          SESSION_GAP_S, which closes the session at its last reading
          rather than letting a device that vanished mid-run hold one
          open forever

A finished session updates the baseline as an exponential moving
average. A plain mean would need a count column and would weight a
fridge's first week as heavily as this month; the EWMA follows how the
household actually uses the appliance now, which is what "longer than
normal" should mean. ALPHA sets how fast it follows.

Two deliberate limits. Sessions live in memory, so restarting the
backend drops the ones in progress — the next complete session starts
the tracking again, and no wrong figure is ever written. And the
baseline row is only ever updated, never inserted: alert_engine owns
creating it, and inserting a row here with a placeholder avg_watts would
make check_spike compare against zero and alert on everything.
"""

import threading
from datetime import datetime

from config import get_connection as get_db

# An appliance is running at or above this. Matches the threshold the
# extended-runtime alert has always used.
ON_WATTS = 10

# Silence longer than this closes the open session at its last reading.
# A device that stops reporting mid-run is not evidence of a run that
# continues.
SESSION_GAP_S = 120

# Sessions shorter than this are not habits worth learning from — a
# kettle's minute of boiling should not drag a washing machine's baseline
# down, and a single spike should not count as a run at all.
MIN_SESSION_MIN = 1.0

# How fast the baseline follows recent behaviour. At 0.25 a session
# carries a quarter of the weight, so roughly the last dozen sessions
# shape the figure.
ALPHA = 0.25

# {monitored_point_id: [started_at, last_seen_at]}. Touched from paho's
# network thread and the scheduler thread, hence the lock.
_open_sessions = {}
_lock = threading.Lock()


def observe(monitored_point_id, watts, now=None):
    """Feed one reading in. Returns the current session length in minutes.

    Zero means the appliance is not running. The return value is what the
    extended-runtime alert compares against the baseline, so the alert no
    longer needs a query of its own.
    """
    now = now or datetime.now()
    running = watts is not None and watts >= ON_WATTS

    with _lock:
        session = _open_sessions.get(monitored_point_id)

        if session and (now - session[1]).total_seconds() > SESSION_GAP_S:
            # The device went quiet mid-run: close at its last reading,
            # not at now, and do not credit the silence.
            finished = _close(monitored_point_id, session)
            session = None
        else:
            finished = None

        if running:
            if session is None:
                _open_sessions[monitored_point_id] = [now, now]
                current = 0.0
            else:
                session[1] = now
                current = (now - session[0]).total_seconds() / 60
        else:
            if session is not None:
                finished = _close(monitored_point_id, session) or finished
            current = 0.0

    if finished is not None:
        _record(monitored_point_id, finished)
    return current


def close_stale(now=None):
    """Close sessions whose device has stopped reporting.

    Called on the scheduler tick. Without it, an appliance that was
    running when its box dropped off the network would hold a session
    open indefinitely and never contribute to the baseline.
    """
    now = now or datetime.now()
    finished = []
    with _lock:
        for point_id, session in list(_open_sessions.items()):
            if (now - session[1]).total_seconds() > SESSION_GAP_S:
                minutes = _close(point_id, session)
                if minutes is not None:
                    finished.append((point_id, minutes))

    for point_id, minutes in finished:
        _record(point_id, minutes)
    return len(finished)


def current_session_minutes(monitored_point_id, now=None):
    """How long the appliance has been running, without feeding a reading."""
    now = now or datetime.now()
    with _lock:
        session = _open_sessions.get(monitored_point_id)
        if session is None:
            return 0.0
        if (now - session[1]).total_seconds() > SESSION_GAP_S:
            return 0.0
        return (now - session[0]).total_seconds() / 60


def _close(monitored_point_id, session):
    """Drop the open session and return its length, if it was long enough.

    Called with the lock held.
    """
    _open_sessions.pop(monitored_point_id, None)
    minutes = (session[1] - session[0]).total_seconds() / 60
    return minutes if minutes >= MIN_SESSION_MIN else None


def _record(monitored_point_id, minutes):
    """Fold a finished session into the stored average.

    Only ever an UPDATE: see the module docstring on why a row must not
    be invented here. A failure is swallowed because this runs on the
    MQTT thread, where an exception costs the whole ingest.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT avg_runtime_min FROM baselines WHERE monitored_point_id = %s",
            (monitored_point_id,),
        )
        row = cursor.fetchone()
        if row is None:
            # No baseline yet — alert_engine.refresh_all_baselines creates
            # it within the quarter hour, and the next session lands.
            conn.close()
            return None

        previous = row[0]
        updated = minutes if previous is None else (
            previous * (1 - ALPHA) + minutes * ALPHA
        )
        cursor.execute(
            "UPDATE baselines SET avg_runtime_min = %s WHERE monitored_point_id = %s",
            (updated, monitored_point_id),
        )
        conn.commit()
        conn.close()
        return updated
    except Exception as exc:
        print(f"runtime: could not store session for point "
              f"{monitored_point_id}: {exc!r}")
        return None
