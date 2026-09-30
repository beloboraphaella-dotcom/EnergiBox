from datetime import date, datetime, time as dtime, timedelta
import threading
import time

import leader
from config import get_connection as get_db
from mqtt_client import send_command, record_command_sent

# ── Schedules ───────────────────────────────────────────────────────────
# A schedule fires on its boundaries: on_time switches the device ON,
# off_time switches it OFF. This used to compare "HH:MM" strings on every
# 30-second tick, which had three problems:
#
#   * every boundary fired twice, since two ticks land in each minute;
#   * a boundary that passed while the backend was down was simply lost,
#     leaving a water heater on until the next day's off_time;
#   * PyMySQL returns TIME columns as timedelta, and str(timedelta) does
#     not zero-pad the hour ("5:00:00"), so no schedule before 10:00 ever
#     matched "05:00" and none of them ever fired.
#
# Now each tick fires the boundaries that fell since the previous tick,
# which is exactly once each whatever the tick rate. And the first tick —
# at startup, or when this process becomes the leader — cannot know what
# it missed, so it aligns every scheduled device with where its schedules
# say it should be right now. That also means a manual switch made during
# a window is overridden after a restart; between restarts, a manual
# switch holds until the next boundary, as before.

# When the schedules were last evaluated. None means "never, in this
# process as leader", which triggers the alignment.
_last_evaluated = None
# Commands whose publish failed (broker down), retried on every tick
# until one gets through or a newer boundary supersedes it.
_pending = {}


def _as_time(value):
    """A TIME column as datetime.time, whatever the driver returned."""
    if isinstance(value, dtime):
        return value
    if isinstance(value, timedelta):
        seconds = int(value.total_seconds()) % 86400
        return dtime(seconds // 3600, seconds % 3600 // 60, seconds % 60)
    hours, minutes, *rest = str(value).split(":")
    return dtime(int(hours), int(minutes), int(float(rest[0])) if rest else 0)


def _last_occurrence(at, now):
    """The most recent moment, at or before `now`, the clock read `at`."""
    moment = datetime.combine(now.date(), at)
    return moment if moment <= now else moment - timedelta(days=1)


def in_window(now, on_time, off_time):
    """Whether a schedule says ON at `now`. A window may wrap midnight
    (22:00-05:00); an empty one (on == off) never says ON."""
    t = now.time()
    if on_time < off_time:
        return on_time <= t < off_time
    if on_time > off_time:
        return t >= on_time or t < off_time
    return False


def reset_schedule_state():
    """Forget the last evaluation, so the next one aligns every device.
    Called whenever this process is not the leader."""
    global _last_evaluated
    _last_evaluated = None
    _pending.clear()


def _send(mac, command, name, reason):
    print(f"Schedule {reason}: {name} → {command}")
    if send_command(mac, command):
        record_command_sent(mac, command)
        _pending.pop(mac, None)
    else:
        _pending[mac] = (command, name)


def check_schedules(now=None):
    """Fire the boundaries passed since the last call, once each."""
    global _last_evaluated
    now = now or datetime.now()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, s.on_time, s.off_time,
               mp.name, e.mac_address, e.last_commanded_state
        FROM schedules s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        WHERE s.active = TRUE
    """)
    rows = cursor.fetchall()
    conn.close()

    since, _last_evaluated = _last_evaluated, now

    # {mac: (name, last_commanded_state, [(moment, command), ...], wants_on)}
    devices = {}
    for _id, on_raw, off_raw, name, mac, commanded in rows:
        on_time, off_time = _as_time(on_raw), _as_time(off_raw)
        entry = devices.setdefault(mac, [name, commanded, [], False])
        if on_time != off_time:
            entry[2].append((_last_occurrence(on_time, now), "ON"))
            entry[2].append((_last_occurrence(off_time, now), "OFF"))
        entry[3] = entry[3] or in_window(now, on_time, off_time)

    for mac, (name, commanded, boundaries, wants_on) in devices.items():
        if since is None:
            desired = "ON" if wants_on else "OFF"
            if commanded != desired:
                _send(mac, desired, name, "aligned at startup")
            continue

        passed = [b for b in boundaries if since < b[0] <= now]
        if passed:
            # Only the latest boundary matters: after a long gap, an ON
            # and an OFF that both passed must not make the relay chatter.
            # On a tie, OFF wins — the conservative side for a relay.
            _moment, command = max(passed, key=lambda b: (b[0], b[1] == "OFF"))
            _send(mac, command, name, "triggered")
        elif mac in _pending:
            _send(mac, _pending[mac][0], name, "retried")

    # A device whose schedules were all deleted or paused keeps no retry.
    for mac in list(_pending):
        if mac not in devices:
            _pending.pop(mac, None)

def mark_stale_devices_offline():
    """Flip any device that hasn't published in over a minute back to
    offline, so status self-corrects without every device needing to
    send an explicit 'going offline' message."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE energiboxes
        SET status = 'offline'
        WHERE status = 'online'
        AND (last_seen IS NULL OR last_seen < DATE_SUB(NOW(), INTERVAL 60 SECOND))
    """)
    conn.commit()
    conn.close()

# Periodic jobs that are slower than the 30-second tick. Both used to have
# no caller at all: baselines were never computed (so spike alerts could
# never fire) and the AI advisor only ran if someone hit /suggestions/run
# by hand.
TICK_SECONDS = 30
BASELINE_INTERVAL_SECONDS = 15 * 60
ADVISOR_INTERVAL_SECONDS = 6 * 60 * 60


def _run_job(name, func):
    """Run one periodic job. A failure in any single job must not take the
    scheduler thread down with it, nor stop the others from running."""
    try:
        return func()
    except Exception as e:
        print(f"Scheduler job '{name}' failed: {e!r}")
        return None


def purge_rate_limits():
    from rate_limit import purge_all_expired
    purge_all_expired()


def close_stale_sessions():
    import runtime
    closed = runtime.close_stale()
    if closed:
        print(f"Closed {closed} runtime session(s) whose device went quiet")


def refresh_baselines():
    from alert_engine import refresh_all_baselines
    updated = refresh_all_baselines()
    print(f"Baselines refreshed for {updated} monitored point(s)")


def run_advisor():
    from ai_advisor import run_ai_advisor
    run_ai_advisor()


def check_anomalies():
    """Yesterday's consumption of every device against its last four
    weeks (insights.py). Once a day: a day has to be complete to judge."""
    import insights
    insights.run_anomaly_check()


def start_scheduler():
    """Run the scheduler loop in a background thread.

    Schedules and device liveness are checked every tick; baselines and the
    AI advisor run on their own longer intervals, tracked by elapsed time
    rather than a tick counter so a slow tick cannot make them drift.
    """
    def run():
        print(f"Scheduler started — tick every {TICK_SECONDS}s")
        # Run both slow jobs once at startup so a fresh deployment does not
        # wait a full interval before baselines exist. None rather than 0:
        # time.monotonic() can itself be smaller than an interval on a
        # freshly booted machine, which would silently skip the first run.
        last_baseline = last_advisor = None
        # The calendar day the anomaly check last ran for. A restart on
        # the same day runs it again, and create_alert's per-day dedupe
        # keeps that from raising anything twice.
        last_anomaly_day = None

        while True:
            now = time.monotonic()

            # Only the elected process does any of this; see leader.py.
            # A standby forgets its schedule state, so that if it is
            # elected it starts by aligning devices rather than assuming
            # the previous leader left nothing undone. Its slow-job clocks
            # are reset too, so the new leader runs them straight away.
            if not leader.is_leader():
                reset_schedule_state()
                last_baseline = last_advisor = None
                last_anomaly_day = None
                time.sleep(TICK_SECONDS)
                continue

            _run_job("check_schedules", check_schedules)
            _run_job("mark_stale_devices_offline", mark_stale_devices_offline)
            # An appliance that was running when its box dropped off the
            # network would otherwise hold a session open forever and
            # never contribute to its own runtime baseline.
            _run_job("close_stale_sessions", close_stale_sessions)
            # Nothing called this before, so expired auth counters were
            # only ever dropped by a restart.
            _run_job("purge_rate_limits", purge_rate_limits)

            if last_baseline is None or now - last_baseline >= BASELINE_INTERVAL_SECONDS:
                _run_job("refresh_baselines", refresh_baselines)
                last_baseline = now

            if last_advisor is None or now - last_advisor >= ADVISOR_INTERVAL_SECONDS:
                _run_job("run_advisor", run_advisor)
                last_advisor = now

            today = date.today()
            if last_anomaly_day != today:
                _run_job("check_anomalies", check_anomalies)
                last_anomaly_day = today

            time.sleep(TICK_SECONDS)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread