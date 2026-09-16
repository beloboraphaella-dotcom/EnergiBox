from datetime import datetime

from config import get_connection as get_db

def compute_baseline(monitored_point_id):
    """Calculate average watts for a monitored point from last 100 readings"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT AVG(watts), COUNT(*) 
        FROM readings 
        WHERE monitored_point_id = %s
    """, (monitored_point_id,))
    
    result = cursor.fetchone()
    avg_watts = result[0] or 0
    count = result[1] or 0
    conn.close()
    
    return avg_watts, count

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

def create_alert(monitored_point_id, alert_type, message):
    """Save an alert to the database"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Avoid duplicate alerts — check if same alert exists in last 5 minutes
    cursor.execute("""
        SELECT id FROM alerts
        WHERE monitored_point_id = %s
        AND type = %s
        AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    """, (monitored_point_id, alert_type))
    
    existing = cursor.fetchone()
    
    if not existing:
        cursor.execute("""
            INSERT INTO alerts (monitored_point_id, type, message, created_at)
            VALUES (%s, %s, %s, %s)
        """, (monitored_point_id, alert_type, message, datetime.now()))
        conn.commit()
        print(f"ALERT GENERATED: {message}")
    
    conn.close()

def check_spike(monitored_point_id, current_watts, appliance_name):
    """Check if current consumption is 30% above baseline"""
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
        create_alert(monitored_point_id, "spike", message)
    else:
        print(f"{appliance_name}: {current_watts:.1f}W — normal "
              f"(baseline: {avg_watts:.1f}W)")
    
    # Check extended runtime
    check_extended_runtime(monitored_point_id, appliance_name)
    
    # Check idle waste
    check_idle_waste(monitored_point_id, current_watts, appliance_name)
def check_extended_runtime(monitored_point_id, appliance_name):
    """Alert when appliance runs much longer than normal"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Get baseline runtime
    cursor.execute("""
        SELECT avg_runtime_min FROM baselines
        WHERE monitored_point_id = %s
    """, (monitored_point_id,))
    
    result = cursor.fetchone()
    
    if not result or not result[0]:
        conn.close()
        return
    
    avg_runtime = result[0]
    
    # Count consecutive readings above 10W (appliance is ON)
    cursor.execute("""
        SELECT COUNT(*) FROM (
            SELECT watts FROM readings
            WHERE monitored_point_id = %s
            AND watts > 10
            ORDER BY timestamp DESC
            LIMIT 150
        ) recent
    """, (monitored_point_id,))
    
    consecutive = cursor.fetchone()[0]
    current_runtime_min = (consecutive * 2) / 60  # 2 seconds per reading
    conn.close()
    
    if current_runtime_min > avg_runtime * 2:
        message = (
            f"{appliance_name} has been running for "
            f"{current_runtime_min:.0f} minutes — "
            f"normally runs for {avg_runtime:.0f} minutes. "
            f"Consider checking if it was left on accidentally."
        )
        create_alert(monitored_point_id, "extended_runtime", message)
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
        create_alert(monitored_point_id, "idle_waste", message)