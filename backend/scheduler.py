from datetime import datetime
import threading
import time

from config import get_connection as get_db
from mqtt_client import send_command, record_command_sent

def check_schedules():
    """Check all active schedules and execute if time matches"""
    conn = get_db()
    cursor = conn.cursor()

    now = datetime.now()
    current_time = now.strftime("%H:%M")

    # Get all active schedules
    cursor.execute("""
        SELECT s.id, s.on_time, s.off_time, 
               mp.name, e.mac_address
        FROM schedules s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        WHERE s.active = TRUE
    """)

    schedules = cursor.fetchall()
    conn.close()

    for schedule in schedules:
        schedule_id = schedule[0]
        on_time = str(schedule[1])[:5]   # Format HH:MM
        off_time = str(schedule[2])[:5]  # Format HH:MM
        appliance_name = schedule[3]
        mac_address = schedule[4]

        if current_time == on_time:
            print(f"Schedule triggered: {appliance_name} → ON")
            if send_command(mac_address, "ON"):
                record_command_sent(mac_address, "ON")

        elif current_time == off_time:
            print(f"Schedule triggered: {appliance_name} → OFF")
            if send_command(mac_address, "OFF"):
                record_command_sent(mac_address, "OFF")

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


def start_scheduler():
    """Run the scheduler loop in a background thread.

    Schedules and device liveness are checked every tick; baselines and the
    AI advisor run on their own longer intervals, tracked by elapsed time
    rather than a tick counter so a slow tick cannot make them drift.
    """
    def run():
        print(f"Scheduler started — tick every {TICK_SECONDS}s")
        # Run both slow jobs once at startup so a fresh deployment does not
        # wait a full interval before baselines exist.
        last_baseline = last_advisor = 0.0

        while True:
            now = time.monotonic()

            _run_job("check_schedules", check_schedules)
            _run_job("mark_stale_devices_offline", mark_stale_devices_offline)
            # An appliance that was running when its box dropped off the
            # network would otherwise hold a session open forever and
            # never contribute to its own runtime baseline.
            _run_job("close_stale_sessions", close_stale_sessions)

            if now - last_baseline >= BASELINE_INTERVAL_SECONDS:
                _run_job("refresh_baselines", refresh_baselines)
                last_baseline = now

            if now - last_advisor >= ADVISOR_INTERVAL_SECONDS:
                _run_job("run_advisor", run_advisor)
                last_advisor = now

            time.sleep(TICK_SECONDS)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread