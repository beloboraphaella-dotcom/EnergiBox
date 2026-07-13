import paho.mqtt.client as mqtt
import json
import time
import random
from datetime import datetime

# MQTT Broker settings
MQTT_BROKER = "localhost"
MQTT_PORT = 1883

# Simulated EnergiBox devices
devices = [
    {
        "mac": "AA:BB:CC:DD:EE:01",
        "name": "Fridge",
        "base_watts": 85,
    },
    {
        "mac": "AA:BB:CC:DD:EE:02", 
        "name": "Water Heater",
        "base_watts": 1500,
    },
]

# Connect to broker
client = mqtt.Client()
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_start()

print("ESP32 Simulator started...")
print(f"Simulating {len(devices)} EnergiBox devices")
print("Press Ctrl+C to stop\n")

try:
    while True:
        for device in devices:
            # Add realistic random variation ±10%
            variation = random.uniform(-0.10, 0.10)
            watts = device["base_watts"] * (1 + variation)

            # Build the payload
            payload = json.dumps({
                "watts": round(watts, 2),
                "timestamp": int(time.time())
            })

            # Publish to MQTT
            topic = f"energibox/{device['mac']}/consumption"
            client.publish(topic, payload)

            print(f"{datetime.now().strftime('%H:%M:%S')} | "
                  f"{device['name']} ({device['mac']}) | "
                  f"{watts:.1f}W")

        print("---")
        time.sleep(2)  # Send every 2 seconds like real ESP32

except KeyboardInterrupt:
    print("\nSimulator stopped.")
    client.loop_stop()
    client.disconnect()