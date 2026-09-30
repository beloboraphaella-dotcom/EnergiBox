from datetime import datetime

import bilingual
import push
import runtime
from config import get_connection as get_db

# A baseline is only meaningful once there is enough history behind it.
# At one reading every 2 seconds that is roughly three minutes of data.
MIN_READINGS_FOR_BASELINE = 100


def compute_baseline(monitored_point_id):
    """Average watts for a monitored point while it is actually drawing
    power. Idle readings are excluded: averaging them in would drag the
    baseline towards zero and make check_spike fire on every normal start."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT AVG(watts), COUNT(*)
        FROM readings
        WHERE monitored_point_id = %s
        AND watts > 1
    """, (monitored_point_id,))

    result = cursor.fetchone()
    avg_watts = result[0] or 0
    count = result[1] or 0
    conn.close()

    return avg_watts, count


def refresh_all_baselines():
    """Recompute and store the baseline for every monitored point.

    Nothing called compute_baseline/save_baseline before this, so the
    baselines table stayed empty and check_spike returned early every
    time — the spike alerts never fired at all. The scheduler now calls
    this periodically.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM monitored_points")
    point_ids = [row[0] for row in cursor.fetchall()]
    conn.close()

    updated = 0
    for point_id in point_ids:
        avg_watts, count = compute_baseline(point_id)
        if count >= MIN_READINGS_FOR_BASELINE and avg_watts:
            save_baseline(point_id, avg_watts)
            updated += 1
    return updated

def save_baseline(monitored_point_id, avg_watts):
    """Save or update the baseline for a monitored point"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if baseline already exists
    cursor.execute("""
        SELECT id FROM baselines 
        WHERE monitored_point_id = %s
    """, (monitored_point_id,))
    
    existing = cursor.fetchone()
    
    if existing:
        cursor.execute("""
            UPDATE baselines 
            SET avg_watts = %s, computed_at = %s
            WHERE monitored_point_id = %s
        """, (avg_watts, datetime.now(), monitored_point_id))
    else:
        cursor.execute("""
            INSERT INTO baselines (monitored_point_id, avg_watts, computed_at)
            VALUES (%s, %s, %s)
        """, (monitored_point_id, avg_watts, datetime.now()))
    
    conn.commit()
    conn.close()

def _fr(value, digits=1):
    """A number the way a French reader writes it: 83,1 rather than 83.1."""
    return f"{value:.{digits}f}".replace(".", ",")


def create_alert(monitored_point_id, alert_type, message, message_fr=None, dedupe="5min"):
    """Save an alert, in English and — with migration 006 — in French.

    `dedupe` is how far back an alert of the same type on the same device
    suppresses this one: five minutes for alerts raised on live readings,
    a calendar day for the daily anomaly check. Returns whether it was
    saved."""
    conn = get_db()
    cursor = conn.cursor()

    window = ("created_at >= CURDATE()" if dedupe == "day"
              else "created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)")
    cursor.execute(f"""
        SELECT id FROM alerts
        WHERE monitored_point_id = %s
        AND type = %s
        AND {window}
    """, (monitored_point_id, alert_type))

    existing = cursor.fetchone()
    saved = False

    if not existing:
        if bilingual.enabled():
            cursor.execute("""
                INSERT INTO alerts (monitored_point_id, type, message, message_fr, created_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (monitored_point_id, alert_type, message, message_fr, datetime.now()))
        else:
            cursor.execute("""
                INSERT INTO alerts (monitored_point_id, type, message, created_at)
                VALUES (%s, %s, %s, %s)
            """, (monitored_point_id, alert_type, message, datetime.now()))
        conn.commit()
        saved = True
        print(f"ALERT GENERATED: {message}")
        push.notify_alert(monitored_point_id, alert_type)

    conn.close()
    return saved

def check_spike(monitored_point_id, current_watts, appliance_name):
    """Check if current consumption is 30% above baseline"""
    # The session tracker must see every reading, including the ones that
    # arrive before this device has a baseline at all — otherwise the
    # early return below would stop it ever learning how long the
    # appliance normally runs, and the extended-runtime alert would stay
    # as inert as it was.
    session_minutes = runtime.observe(monitored_point_id, current_watts)

    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT avg_watts FROM baselines 
        WHERE monitored_point_id = %s
    """, (monitored_point_id,))
    
    result = cursor.fetchone()
    conn.close()
    
    if not result:
        print(f"{appliance_name}: No baseline found — skipping alert check")
        return
    
    avg_watts = result[0]
    
    # Check spike
    if current_watts > avg_watts * 1.30:
        percentage = ((current_watts / avg_watts) - 1) * 100
        message = (
            f"{appliance_name} is consuming {current_watts:.1f}W — "
            f"{percentage:.0f}% above its normal average of {avg_watts:.1f}W."
        )
        message_fr = (
            f"{appliance_name} consomme {_fr(current_watts)} W, soit "
            f"{percentage:.0f} % de plus que sa moyenne habituelle de {_fr(avg_watts)} W."
        )
        create_alert(monitored_point_id, "spike", message, message_fr)
    else:
        print(f"{appliance_name}: {current_watts:.1f}W — normal "
              f"(baseline: {avg_watts:.1f}W)")
    
    # Check extended runtime
    check_extended_runtime(monitored_point_id, appliance_name, session_minutes)
    
    # Check idle waste
    check_idle_waste(monitored_point_id, current_watts, appliance_name)
def check_extended_runtime(monitored_point_id, appliance_name, current_runtime_min):
    """Alert when an appliance runs much longer than it normally does.

    The current run is measured by runtime.py, which tracks sessions as
    readings arrive. What this used to do — count rows above 10 W among
    the last 150 readings, consecutive or not, and call each one two
    seconds — could neither tell one long run from an afternoon of
    cycling nor report more than five minutes. The baseline it compares
    against is written by that same tracker; before it, nothing wrote the
    column and this alert never fired at all.
    """
    if current_runtime_min <= 0:
        return

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT avg_runtime_min FROM baselines
        WHERE monitored_point_id = %s
    """, (monitored_point_id,))
    result = cursor.fetchone()
    conn.close()

    if not result or not result[0]:
        # No sessions learned yet. Silence is the right answer: "longer
        # than normal" means nothing before normal is known.
        return

    avg_runtime = result[0]

    if current_runtime_min > avg_runtime * 2:
        message = (
            f"{appliance_name} has been running for "
            f"{current_runtime_min:.0f} minutes — "
            f"normally runs for {avg_runtime:.0f} minutes. "
            f"Consider checking if it was left on accidentally."
        )
        message_fr = (
            f"{appliance_name} fonctionne depuis {current_runtime_min:.0f} minutes, "
            f"alors qu'il tourne d'habitude {avg_runtime:.0f} minutes. "
            f"Vérifiez qu'il n'a pas été oublié allumé."
        )
        create_alert(monitored_point_id, "extended_runtime", message, message_fr)
def check_idle_waste(monitored_point_id, current_watts, appliance_name):
    """Alert when appliance consumes power during historically idle hours"""
    if current_watts < 10:
        return

    conn = get_db()
    cursor = conn.cursor()
    from datetime import datetime

    current_hour = datetime.now().hour

    # Check how many readings exist for this hour historically
    cursor.execute("""
        SELECT COUNT(*), AVG(watts) FROM readings
        WHERE monitored_point_id = %s
        AND HOUR(timestamp) = %s
        AND timestamp < DATE_SUB(NOW(), INTERVAL 1 DAY)
    """, (monitored_point_id, current_hour))

    result = cursor.fetchone()
    conn.close()

    count = result[0] or 0
    historical_avg = result[1] or 0

    # Need at least 50 historical readings for this hour before checking
    if count < 50:
        return

    if historical_avg < 5 and current_watts > 20:
        message = (
            f"{appliance_name} is consuming {current_watts:.1f}W "
            f"at {current_hour}:00 — this is unusual based on its history. "
            f"It may have been left on accidentally."
        )
        message_fr = (
            f"{appliance_name} consomme {_fr(current_watts)} W à {current_hour} h, "
            f"ce qui est inhabituel d'après son historique. "
            f"Il a peut-être été oublié allumé."
        )
        create_alert(monitored_point_id, "idle_waste", message, message_fr)