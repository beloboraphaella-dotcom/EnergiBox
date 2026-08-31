import paho.mqtt.client as mqtt
import json
from datetime import datetime
import pymysql
from alert_engine import check_spike

MQTT_BROKER = "192.168.1.168"
MQTT_PORT = 1883

def get_db():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="belobo2008@",
        database="energibox"
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

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to Mosquitto broker successfully")
        client.subscribe("energibox/#")
        print("Subscribed to energibox/# topics")
    else:
        print(f"Failed to connect. Code: {rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    parts = topic.split("/")
    mac = parts[1]
    message_type = parts[2]

    if message_type == "consumption":
        payload = json.loads(msg.payload.decode())
        watts = payload.get("watts", 0)
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
    client.on_message = on_message
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