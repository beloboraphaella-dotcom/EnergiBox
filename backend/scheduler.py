import pymysql
from datetime import datetime
import threading
import time

from mqtt_client import send_command

def get_db():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="belobo2008@",
        database="energibox"
    )

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
            send_command(mac_address, "ON")

        elif current_time == off_time:
            print(f"Schedule triggered: {appliance_name} → OFF")
            send_command(mac_address, "OFF")

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

def start_scheduler():
    """Run the scheduler every 30 seconds in a background thread"""
    def run():
        print("Scheduler started — checking every 30 seconds")
        while True:
            try:
                check_schedules()
                mark_stale_devices_offline()
            except Exception as e:
                print(f"Scheduler error: {e}")
            time.sleep(30)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread