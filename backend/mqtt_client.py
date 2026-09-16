import paho.mqtt.client as mqtt
import json
from datetime import datetime

from alert_engine import check_spike
from config import (
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USERNAME,
    get_connection as get_db,
)

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
    """Save a reading to the database"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO readings (monitored_point_id, watts, timestamp)
            VALUES (%s, %s, %s)
        """, (monitored_point_id, watts, datetime.now()))
        conn.commit()
        conn.close()
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
    global _mqtt_client
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    # Only set credentials when the broker is configured to require them;
    # an anonymous Mosquitto rejects a connection that sends a username.
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD or None)
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    _mqtt_client = client
    return client

def send_command(mac, command):
    """Publish an ON/OFF command to a specific EnergiBox device"""
    if _mqtt_client is None:
        print(f"WARNING: MQTT client not connected yet — dropped command '{command}' for {mac}")
        return False

    topic = f"energibox/{mac}/control"
    _mqtt_client.publish(topic, command)
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