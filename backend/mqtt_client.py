import paho.mqtt.client as mqtt
import json
import threading
from datetime import datetime

import energy
from alert_engine import check_spike
from config import (
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USERNAME,
    get_connection as get_db,
)

# Timestamp of the last reading stored for each monitored point, so the
# gap a reading stands for costs no query. Only the first message of each
# device after a restart falls through to the database. Guarded because
# paho delivers messages on its own thread.
_last_reading_at = {}
_last_reading_lock = threading.Lock()


def _previous_reading_at(cursor, monitored_point_id):
    """When this device last reported, from memory or from the table."""
    with _last_reading_lock:
        known = _last_reading_at.get(monitored_point_id)
    if known is not None:
        return known
    cursor.execute(
        "SELECT MAX(timestamp) FROM readings WHERE monitored_point_id = %s",
        (monitored_point_id,),
    )
    row = cursor.fetchone()
    return row[0] if row else None

def get_monitored_point(mac):
    """Get monitored point id and name from MAC address"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.id, mp.name 
        FROM monitored_points mp
        JOIN energiboxes e ON mp.energibox_id = e.id
        WHERE e.mac_address = %s
    """, (mac,))
    result = cursor.fetchone()
    conn.close()
    return result

def save_reading(monitored_point_id, watts):
    """Store a reading, and the span of time it stands for.

    `interval_s` is the gap since this device's previous reading, capped
    by energy.clamp_interval. Writing it here is what lets every kWh in
    the app be an integral instead of a guess about the sample rate — see
    energy.py. When migration 002 has not been applied the column is
    absent and the insert falls back to its original form.
    """
    try:
        conn = get_db()
        cursor = conn.cursor()
        now = datetime.now()

        if energy.uses_intervals():
            previous = _previous_reading_at(cursor, monitored_point_id)
            gap = (now - previous).total_seconds() if previous else None
            cursor.execute("""
                INSERT INTO readings (monitored_point_id, watts, timestamp, interval_s)
                VALUES (%s, %s, %s, %s)
            """, (monitored_point_id, watts, now, energy.clamp_interval(gap)))
        else:
            cursor.execute("""
                INSERT INTO readings (monitored_point_id, watts, timestamp)
                VALUES (%s, %s, %s)
            """, (monitored_point_id, watts, now))

        conn.commit()
        conn.close()
        with _last_reading_lock:
            _last_reading_at[monitored_point_id] = now
    except Exception as e:
        print(f"Database error: {e}")

def mark_device_online(mac):
    """Record that a device is actively communicating right now."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE energiboxes SET status = 'online', last_seen = %s WHERE mac_address = %s",
        (datetime.now(), mac)
    )
    conn.commit()
    conn.close()

# Tracks whether the broker connection is currently up, so /health can
# report the truth instead of assuming.
_connected = False


def is_mqtt_connected() -> bool:
    return _connected


def on_disconnect(client, userdata, rc):
    global _connected
    _connected = False
    print(f"Disconnected from broker (code {rc}) — paho will retry")


def on_connect(client, userdata, flags, rc):
    global _connected
    _connected = rc == 0
    if rc == 0:
        print("Connected to Mosquitto broker successfully")
        client.subscribe("energibox/#")
        print("Subscribed to energibox/# topics")
    else:
        print(f"Failed to connect. Code: {rc}")

def on_message(client, userdata, msg):
    """Paho calls this on its network thread. An exception escaping here
    kills message processing, so nothing inside may raise: a malformed
    topic, a non-JSON payload or a database hiccup must all degrade to a
    log line."""
    try:
        _handle_message(msg)
    except Exception as exc:
        print(f"Error handling message on {msg.topic}: {exc!r}")


def _handle_message(msg):
    parts = msg.topic.split("/")
    if len(parts) < 3:
        print(f"Ignoring malformed topic: {msg.topic}")
        return

    mac = parts[1]
    message_type = parts[2]

    if message_type == "consumption":
        try:
            payload = json.loads(msg.payload.decode())
        except (ValueError, UnicodeDecodeError):
            print(f"Ignoring non-JSON payload from {mac}")
            return

        watts = payload.get("watts", 0)
        if not isinstance(watts, (int, float)):
            print(f"Ignoring non-numeric watts from {mac}: {watts!r}")
            return

        timestamp = datetime.now().strftime("%H:%M:%S")

        mark_device_online(mac)
        result = get_monitored_point(mac)
        if result:
            monitored_point_id, appliance_name = result
            save_reading(monitored_point_id, watts)
            print(f"{timestamp} | {appliance_name} | {watts:.1f}W")
            check_spike(monitored_point_id, watts, appliance_name)
        else:
            print(f"Unknown device: {mac}")

    elif message_type == "status":
        # ESP32 confirming relay state — only fires reactively after a
        # control command today, but still counts as a live sign of life
        mark_device_online(mac)
        print(f"Status update from {mac}: {msg.payload.decode()}")

# ── Global client reference so we can publish from other files ──
_mqtt_client = None

def start_mqtt():
    """Start the broker connection without making it a startup condition.

    `connect()` raises when nothing is listening, and this runs at import,
    so a broker that is down — or simply slower to come up than the API —
    used to stop the backend from starting at all. Yet everything here is
    already built to survive a missing broker: /health reports the state,
    send_command refuses politely, and paho reconnects on its own.

    connect_async hands the connection attempt to the network thread, so
    the API serves requests while the broker is unreachable and picks it
    up whenever it appears.
    """
    global _mqtt_client
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    # Only set credentials when the broker is configured to require them;
    # an anonymous Mosquitto rejects a connection that sends a username.
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD or None)
    # Back off up to a minute between attempts rather than hammering a
    # broker that is down.
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    _mqtt_client = client
    return client

def send_command(mac, command):
    """Publish an ON/OFF command to a specific EnergiBox device"""
    if _mqtt_client is None:
        print(f"WARNING: MQTT client not connected yet — dropped command '{command}' for {mac}")
        return False

    topic = f"energibox/{mac}/control"
    info = _mqtt_client.publish(topic, command)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        # Nothing left the process — the broker is not connected. Saying
        # so is what stops record_command_sent from remembering a state
        # the device was never told about.
        print(f"WARNING: could not publish '{command}' to {topic} "
              f"(rc={info.rc}) — broker not connected")
        return False
    print(f"Published '{command}' to {topic}")
    return True

def record_command_sent(mac, command):
    """Persist the commanded state after a successful send_command().
    This is the source of truth for is_on (see main.py's _derive_is_on),
    so every call site that sends a command must call this too."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE energiboxes SET last_commanded_state = %s WHERE mac_address = %s",
        (command, mac)
    )
    conn.commit()
    conn.close()