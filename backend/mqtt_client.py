import paho.mqtt.client as mqtt
import json
from datetime import datetime
import pymysql
from alert_engine import check_spike

MQTT_BROKER = "localhost"
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

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to Mosquitto broker successfully")
        client.subscribe("energibox/#")
        print("Subscribed to energibox/# topics")
    else:
        print(f"Failed to connect. Code: {rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = json.loads(msg.payload.decode())

    parts = topic.split("/")
    mac = parts[1]
    message_type = parts[2]

    if message_type == "consumption":
        watts = payload.get("watts", 0)
        timestamp = datetime.now().strftime("%H:%M:%S")

        # Get monitored point
        result = get_monitored_point(mac)
        
        if result:
            monitored_point_id, appliance_name = result
            
            # Save reading to database
            save_reading(monitored_point_id, watts)
            
            print(f"{timestamp} | {appliance_name} | {watts:.1f}W")
            
            # Check for alerts
            check_spike(monitored_point_id, watts, appliance_name)
        else:
            print(f"Unknown device: {mac}")

def start_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    return client