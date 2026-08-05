from auth import (
    register_user, login_user, decode_token, update_user_name, change_password,
    list_all_users, set_user_suspended, delete_user, admin_set_password
)
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from mqtt_client import start_mqtt
from scheduler import start_scheduler
import pymysql
import re

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def normalize_mac(raw: str):
    """Accepts colon, hyphen, dot or no separator and normalizes to the
    canonical AA:BB:CC:DD:EE:FF form the EnergiBox firmware and MQTT topics
    actually use. Returns None if raw isn't 12 hex digits once separators
    are stripped."""
    hex_only = re.sub(r"[^0-9A-Fa-f]", "", raw)
    if len(hex_only) != 12:
        return None
    hex_only = hex_only.upper()
    return ":".join(hex_only[i:i + 2] for i in range(0, 12, 2))

Base.metadata.create_all(bind=engine)
mqtt_client = start_mqtt()
scheduler_thread = start_scheduler()

app = FastAPI(title="EnergiBox API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_raw_db():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="belobo2008@",
        database="energibox"
    )

def _derive_is_on(watts, last_commanded_state):
    """Sensor-reported wattage takes priority. Devices that have never
    reported a reading (e.g. relay-only modules with no SCT-013 sensor)
    fall back to the last ON/OFF command actually sent to them, since
    watts-based detection can never reflect their state."""
    if watts is not None:
        return bool(watts > 1)
    return last_commanded_state == "ON"

def _fmt_time(value):
    """pymysql returns MySQL TIME columns as datetime.timedelta, whose str()
    doesn't zero-pad hours under 10 (e.g. "5:00:00" instead of "05:00:00").
    Format as a proper zero-padded HH:MM:SS string."""
    if value is None:
        return None
    total_seconds = int(value.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

# ── AUTHENTICATION ──────────────────────────────────────────────────────
# HTTPBearer (rather than a plain `authorization: str = Header(...)`
# parameter) is what makes Swagger UI render the padlock icon and
# "Authorize" button — paste a token once there and it's sent on every
# "Try it out" call. A bare Header(...) parameter named "authorization"
# doesn't get that treatment and Swagger silently drops manually-typed
# Authorization headers, making the docs unusable for testing.
bearer_scheme = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    """Decode and verify the caller's JWT (same secret/algorithm as before).
    Returns the current user as {user_id, email, role}. Raises 401 if the
    token is missing, malformed or expired."""
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {
        "user_id": int(payload.get("sub")),
        "email": payload.get("email"),
        "role": payload.get("role"),
    }

def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    """Same as get_current_user, but additionally requires the admin role."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def _verify_home_ownership(user_id: int, home_id: int):
    """Raise 403 unless home_id belongs to user_id"""
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM homes WHERE id = %s AND user_id = %s", (home_id, user_id))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=403, detail="This home does not belong to you")

def _room_home_id(room_id: int) -> int:
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT home_id FROM rooms WHERE id = %s", (room_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Room not found")
    return row[0]

def _monitored_point_home_id(point_id: int) -> int:
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.home_id FROM monitored_points mp
        JOIN rooms r ON mp.room_id = r.id
        WHERE mp.id = %s
    """, (point_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found")
    return row[0]

def _schedule_home_id(schedule_id: int) -> int:
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.home_id FROM schedules s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE s.id = %s
    """, (schedule_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return row[0]

def _suggestion_home_id(suggestion_id: int) -> int:
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.home_id FROM ai_suggestions s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE s.id = %s
    """, (suggestion_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return row[0]

def _mac_home_id(mac: str):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.home_id FROM monitored_points mp
        JOIN rooms r ON mp.room_id = r.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        WHERE e.mac_address = %s
    """, (mac,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None

# Resource-ownership dependencies. Each one takes the same path/query
# parameter name the endpoint itself declares (FastAPI resolves a
# dependency's parameters against the request exactly like it does for the
# endpoint function, whether that name is a path segment or a query string
# param) so it can be dropped in as `Depends(...)` without changing the
# endpoint's existing parameter list.

def get_scoped_user(home_id: int, user: dict = Depends(get_current_user)) -> dict:
    """Verifies the caller owns home_id (path or query parameter)."""
    _verify_home_ownership(user["user_id"], home_id)
    return user

def get_room_owner(room_id: int, user: dict = Depends(get_current_user)) -> dict:
    _verify_home_ownership(user["user_id"], _room_home_id(room_id))
    return user

def get_point_owner(point_id: int, user: dict = Depends(get_current_user)) -> dict:
    _verify_home_ownership(user["user_id"], _monitored_point_home_id(point_id))
    return user

def get_monitored_point_owner(monitored_point_id: int, user: dict = Depends(get_current_user)) -> dict:
    _verify_home_ownership(user["user_id"], _monitored_point_home_id(monitored_point_id))
    return user

def get_schedule_owner(schedule_id: int, user: dict = Depends(get_current_user)) -> dict:
    _verify_home_ownership(user["user_id"], _schedule_home_id(schedule_id))
    return user

def get_suggestion_owner(suggestion_id: int, user: dict = Depends(get_current_user)) -> dict:
    _verify_home_ownership(user["user_id"], _suggestion_home_id(suggestion_id))
    return user

def get_mac_owner(mac: str, user: dict = Depends(get_current_user)) -> dict:
    home_id = _mac_home_id(mac)
    if home_id is None:
        raise HTTPException(status_code=404, detail="Device not found")
    _verify_home_ownership(user["user_id"], home_id)
    return user

@app.get("/")
def root():
    return {
        "message": "EnergiBox API is running",
        "version": "1.0",
        "status": "online"
    }

@app.get("/health")
def health():
    return {
        "database": "connected",
        "mqtt": "connected",
        "status": "healthy"
    }

@app.get("/readings")
def get_readings():
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.name, r.watts, r.timestamp
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        ORDER BY r.timestamp DESC
        LIMIT 20
    """)
    rows = cursor.fetchall()
    conn.close()
    return [
        {"appliance": row[0], "watts": row[1], "timestamp": str(row[2])}
        for row in rows
    ]

@app.get("/readings/{mac}")
def get_readings_by_device(mac: str):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.watts, r.timestamp
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        WHERE e.mac_address = %s
        ORDER BY r.timestamp DESC
        LIMIT 10
    """, (mac,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {"watts": row[0], "timestamp": str(row[1])}
        for row in rows
    ]

@app.get("/bill/estimate")
def estimate_bill(home_id: int, user: dict = Depends(get_scoped_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT SUM(r.watts) / 1000 / 1800
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW())
        AND YEAR(r.timestamp) = YEAR(NOW())
    """, (home_id,))
    kwh = cursor.fetchone()[0] or 0
    conn.close()
    fcfa = round(kwh * 79, 0)
    return {
        "kwh_consumed": round(kwh, 3),
        "estimated_bill_fcfa": fcfa,
        "tariff_per_kwh": 79
    }

@app.get("/alerts")
def get_alerts(home_id: int, user: dict = Depends(get_scoped_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.name, a.type, a.message, a.read_status, a.created_at
        FROM alerts a
        JOIN monitored_points mp ON a.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s
        ORDER BY a.created_at DESC
        LIMIT 20
    """, (home_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "appliance": row[0],
            "type": row[1],
            "message": row[2],
            "read": bool(row[3]),
            "created_at": str(row[4])
        }
        for row in rows
    ]

@app.get("/alerts/unread")
def get_unread_alerts():
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.name, a.type, a.message, a.created_at
        FROM alerts a
        JOIN monitored_points mp ON a.monitored_point_id = mp.id
        WHERE a.read_status = FALSE
        ORDER BY a.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return {
        "count": len(rows),
        "alerts": [
            {
                "appliance": row[0],
                "type": row[1],
                "message": row[2],
                "created_at": str(row[3])
            }
            for row in rows
        ]
    }

@app.get("/dashboard")
def get_dashboard(home_id: int, user: dict = Depends(get_scoped_user)):
    """Single endpoint that returns everything the dashboard needs"""
    conn = get_raw_db()
    cursor = conn.cursor()

    # Latest reading per appliance
    cursor.execute("""
        SELECT mp.name, r.watts, r.timestamp
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND r.id IN (
            SELECT MAX(id) FROM readings GROUP BY monitored_point_id
        )
    """, (home_id,))
    latest = cursor.fetchall()

    # Bill estimate
    cursor.execute("""
        SELECT SUM(r.watts) / 1000 / 1800
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW())
        AND YEAR(r.timestamp) = YEAR(NOW())
    """, (home_id,))
    kwh = cursor.fetchone()[0] or 0

    # Unread alerts count
    cursor.execute("""
        SELECT COUNT(*) FROM alerts a
        JOIN monitored_points mp ON a.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND a.read_status = FALSE
    """, (home_id,))
    unread_alerts = cursor.fetchone()[0]

    conn.close()

    return {
        "appliances": [
            {
                "name": row[0],
                "watts": row[1],
                "timestamp": str(row[2])
            }
            for row in latest
        ],
        "bill": {
            "kwh_consumed": round(kwh, 3),
            "estimated_fcfa": round(kwh * 79, 0)
        },
        "unread_alerts": unread_alerts
    }
@app.get("/schedules")
def get_schedules(home_id: int, user: dict = Depends(get_scoped_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, mp.name, s.on_time, s.off_time,
               s.active, s.source, mp.id
        FROM schedules s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s
    """, (home_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "appliance": row[1],
            "on_time": _fmt_time(row[2]),
            "off_time": _fmt_time(row[3]),
            "active": bool(row[4]),
            "source": row[5],
            "monitored_point_id": row[6]
        }
        for row in rows
    ]

@app.post("/schedules")
def create_schedule(
    monitored_point_id: int,
    on_time: str,
    off_time: str,
    source: str = "manual",
    user: dict = Depends(get_monitored_point_owner),
):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO schedules
        (monitored_point_id, on_time, off_time, active, source)
        VALUES (%s, %s, %s, TRUE, %s)
    """, (monitored_point_id, on_time, off_time, source))
    conn.commit()
    schedule_id = cursor.lastrowid
    conn.close()
    return {"message": "Schedule created successfully", "id": schedule_id}

@app.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, on_time: str = None, off_time: str = None, user: dict = Depends(get_schedule_owner)):
    """Edit the on/off times of a manual or accepted-AI schedule"""
    fields, values = [], []
    if on_time is not None:
        fields.append("on_time = %s")
        values.append(on_time)
    if off_time is not None:
        fields.append("off_time = %s")
        values.append(off_time)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    conn = get_raw_db()
    cursor = conn.cursor()
    values.append(schedule_id)
    cursor.execute(f"UPDATE schedules SET {', '.join(fields)} WHERE id = %s", values)
    conn.commit()
    conn.close()
    return {"message": "Schedule updated"}

@app.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, user: dict = Depends(get_schedule_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM schedules WHERE id = %s", (schedule_id,))
    conn.commit()
    conn.close()
    return {"message": "Schedule deleted successfully"}

@app.put("/schedules/{schedule_id}/toggle")
def toggle_schedule(schedule_id: int, user: dict = Depends(get_schedule_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE schedules
        SET active = NOT active
        WHERE id = %s
    """, (schedule_id,))
    conn.commit()
    conn.close()
    return {"message": "Schedule toggled successfully"}

@app.get("/rooms")
def get_rooms(home_id: int, user: dict = Depends(get_scoped_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM rooms WHERE home_id = %s ORDER BY name", (home_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": row[0], "name": row[1]} for row in rows]

@app.post("/rooms")
def create_room(name: str, home_id: int, user: dict = Depends(get_scoped_user)):
    """Add a room to one of the caller's homes"""
    if not name.strip():
        raise HTTPException(status_code=400, detail="Room name cannot be empty")

    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM rooms WHERE home_id = %s AND LOWER(name) = LOWER(%s)",
        (home_id, name.strip())
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"A room named \"{name.strip()}\" already exists in this home")

    cursor.execute("INSERT INTO rooms (home_id, name) VALUES (%s, %s)", (home_id, name.strip()))
    conn.commit()
    room_id = cursor.lastrowid
    conn.close()
    return {"id": room_id, "name": name.strip()}

@app.put("/rooms/{room_id}")
def update_room(room_id: int, name: str, user: dict = Depends(get_room_owner)):
    """Rename a room"""
    if not name.strip():
        raise HTTPException(status_code=400, detail="Room name cannot be empty")

    home_id = _room_home_id(room_id)
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM rooms WHERE home_id = %s AND LOWER(name) = LOWER(%s) AND id != %s",
        (home_id, name.strip(), room_id)
    )
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail=f"A room named \"{name.strip()}\" already exists in this home")

    cursor.execute("UPDATE rooms SET name = %s WHERE id = %s", (name.strip(), room_id))
    conn.commit()
    conn.close()
    return {"id": room_id, "name": name.strip()}

@app.delete("/rooms/{room_id}")
def delete_room(room_id: int, user: dict = Depends(get_room_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM monitored_points WHERE room_id = %s", (room_id,))
    device_count = cursor.fetchone()[0]
    if device_count > 0:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Remove or reassign {device_count} device(s) in this room before deleting it"
        )
    cursor.execute("DELETE FROM rooms WHERE id = %s", (room_id,))
    conn.commit()
    conn.close()
    return {"message": "Room deleted"}

@app.post("/monitored_points")
def create_monitored_point(
    room_id: int,
    name: str,
    mac_address: str,
    type: str = "appliance",
    protocol: str = "wifi",
    user: dict = Depends(get_room_owner),
):
    """Add an appliance or socket to a room, pairing it to a physical EnergiBox by MAC.
    If the MAC hasn't been seen before, the EnergiBox is pre-registered as offline —
    it comes online automatically the first time it publishes over MQTT."""
    if type not in ("appliance", "socket"):
        raise HTTPException(status_code=400, detail="type must be 'appliance' or 'socket'")
    mac_address = normalize_mac(mac_address)
    if not mac_address:
        raise HTTPException(status_code=400, detail="Enter a valid MAC address — 12 hex digits, e.g. AA:BB:CC:DD:EE:FF")

    conn = get_raw_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM energiboxes WHERE mac_address = %s", (mac_address,))
    row = cursor.fetchone()
    if row:
        energibox_id = row[0]
    else:
        cursor.execute(
            "INSERT INTO energiboxes (mac_address, protocol, status) VALUES (%s, %s, 'offline')",
            (mac_address, protocol)
        )
        conn.commit()
        energibox_id = cursor.lastrowid

    cursor.execute("SELECT id FROM monitored_points WHERE energibox_id = %s", (energibox_id,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="This EnergiBox is already paired to another device")

    cursor.execute(
        "INSERT INTO monitored_points (room_id, name, type, energibox_id) VALUES (%s, %s, %s, %s)",
        (room_id, name, type, energibox_id)
    )
    conn.commit()
    point_id = cursor.lastrowid
    conn.close()
    return {"id": point_id, "name": name, "type": type, "room_id": room_id, "mac": mac_address}

@app.put("/monitored_points/{point_id}")
def update_monitored_point(point_id: int, name: str = None, type: str = None, room_id: int = None, user: dict = Depends(get_point_owner)):
    if type is not None and type not in ("appliance", "socket"):
        raise HTTPException(status_code=400, detail="type must be 'appliance' or 'socket'")

    if room_id is not None:
        _verify_home_ownership(user["user_id"], _room_home_id(room_id))

    fields, values = [], []
    if name is not None:
        fields.append("name = %s")
        values.append(name)
    if type is not None:
        fields.append("type = %s")
        values.append(type)
    if room_id is not None:
        fields.append("room_id = %s")
        values.append(room_id)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    conn = get_raw_db()
    cursor = conn.cursor()
    values.append(point_id)
    cursor.execute(f"UPDATE monitored_points SET {', '.join(fields)} WHERE id = %s", values)
    conn.commit()
    conn.close()
    return {"message": "Device updated"}

@app.delete("/monitored_points/{point_id}")
def delete_monitored_point(point_id: int, user: dict = Depends(get_point_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM monitored_points WHERE id = %s", (point_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Device not found")

    for table in ("readings", "alerts", "baselines", "schedules", "ai_suggestions"):
        cursor.execute(f"DELETE FROM {table} WHERE monitored_point_id = %s", (point_id,))
    cursor.execute("DELETE FROM monitored_points WHERE id = %s", (point_id,))
    conn.commit()
    conn.close()
    return {"message": "Device deleted"}

@app.get("/devices")
def get_devices(home_id: int, user: dict = Depends(get_scoped_user)):
    """Returns every monitored point with its room, connectivity and live power"""
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.id, mp.name, r.name, e.mac_address, e.status, latest.watts, latest.timestamp, mp.type, r.id, e.last_commanded_state
        FROM monitored_points mp
        JOIN rooms r ON mp.room_id = r.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        LEFT JOIN (
            SELECT monitored_point_id, watts, timestamp
            FROM readings
            WHERE id IN (SELECT MAX(id) FROM readings GROUP BY monitored_point_id)
        ) latest ON latest.monitored_point_id = mp.id
        WHERE r.home_id = %s
        ORDER BY r.name, mp.name
    """, (home_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "name": row[1],
            "room": row[2],
            "mac": row[3],
            "status": row[4],
            "watts": round(row[5] or 0, 1),
            "is_on": _derive_is_on(row[5], row[9]),
            "last_seen": str(row[6]) if row[6] else None,
            "type": row[7],
            "room_id": row[8],
        }
        for row in rows
    ]

@app.get("/devices/{mac}")
def get_device_detail(mac: str, user: dict = Depends(get_mac_owner)):
    """Returns full detail + runtime stats for a single device"""
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.id, mp.name, r.name, e.mac_address, e.status, latest.watts, latest.timestamp, mp.type, r.id, e.last_commanded_state
        FROM monitored_points mp
        JOIN rooms r ON mp.room_id = r.id
        JOIN energiboxes e ON mp.energibox_id = e.id
        LEFT JOIN (
            SELECT monitored_point_id, watts, timestamp
            FROM readings
            WHERE id IN (SELECT MAX(id) FROM readings GROUP BY monitored_point_id)
        ) latest ON latest.monitored_point_id = mp.id
        WHERE e.mac_address = %s
    """, (mac,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Device not found")

    monitored_point_id = row[0]

    def runtime_hours(days):
        cursor.execute("""
            SELECT COUNT(*) FROM readings
            WHERE monitored_point_id = %s AND watts > 1
            AND timestamp >= DATE_SUB(NOW(), INTERVAL %s DAY)
        """, (monitored_point_id, days))
        count = cursor.fetchone()[0] or 0
        return round(count / 1800, 1)

    today_count_query = """
        SELECT COUNT(*) FROM readings
        WHERE monitored_point_id = %s AND watts > 1 AND DATE(timestamp) = CURDATE()
    """
    cursor.execute(today_count_query, (monitored_point_id,))
    today_hours = round((cursor.fetchone()[0] or 0) / 1800, 1)

    week_hours = runtime_hours(7)
    month_hours = runtime_hours(30)

    cursor.execute("""
        SELECT watts, timestamp FROM readings
        WHERE monitored_point_id = %s
        ORDER BY timestamp DESC LIMIT 30
    """, (monitored_point_id,))
    recent = list(reversed(cursor.fetchall()))

    conn.close()

    return {
        "id": row[0],
        "name": row[1],
        "room": row[2],
        "mac": row[3],
        "status": row[4],
        "watts": round(row[5] or 0, 1),
        "is_on": _derive_is_on(row[5], row[9]),
        "last_seen": str(row[6]) if row[6] else None,
        "type": row[7],
        "room_id": row[8],
        "runtime": {
            "today_hours": today_hours,
            "past_7_days_hours": week_hours,
            "past_30_days_hours": month_hours,
        },
        "recent_readings": [
            {"watts": r[0], "timestamp": str(r[1])} for r in recent
        ],
    }

@app.post("/control/{mac}")
def control_device(mac: str, command: str, user: dict = Depends(get_mac_owner)):
    """Send ON or OFF command to an EnergiBox"""
    if command not in ["ON", "OFF"]:
        return {"error": "Command must be ON or OFF"}

    from mqtt_client import send_command
    sent = send_command(mac, command)
    if sent:
        conn = get_raw_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE energiboxes SET last_commanded_state = %s WHERE mac_address = %s", (command, mac))
        conn.commit()
        conn.close()
    return {
        "message": f"Command {command} sent to {mac}",
        "mac": mac,
        "command": command
    }
@app.post("/auth/register")
def register(name: str, email: str, password: str):
    if not EMAIL_REGEX.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    user_id, error = register_user(name, email, password)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {
        "message": "Account created successfully",
        "user_id": user_id
    }

@app.post("/auth/login")
def login(email: str, password: str):
    result, error = login_user(email, password)
    if error:
        raise HTTPException(status_code=401, detail=error)
    return result

@app.get("/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    """Get current logged in user from JWT token"""
    return user

@app.get("/homes")
def get_homes(user: dict = Depends(get_current_user)):
    """List every home belonging to the caller"""
    user_id = user["user_id"]
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT h.id, h.name, h.address,
               (SELECT COUNT(*) FROM rooms WHERE home_id = h.id) as room_count,
               (SELECT COUNT(*) FROM monitored_points mp JOIN rooms r ON mp.room_id = r.id WHERE r.home_id = h.id) as device_count
        FROM homes h WHERE h.user_id = %s ORDER BY h.created_at
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": row[0], "name": row[1], "address": row[2], "room_count": row[3], "device_count": row[4]}
        for row in rows
    ]

@app.post("/homes")
def create_home(name: str, address: str = None, user: dict = Depends(get_current_user)):
    """Create a new home for the caller"""
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO homes (user_id, name, address) VALUES (%s, %s, %s)", (user["user_id"], name, address))
    conn.commit()
    home_id = cursor.lastrowid
    conn.close()
    return {"id": home_id, "name": name, "address": address}

@app.put("/homes/{home_id}")
def update_home(home_id: int, name: str = None, address: str = None, user: dict = Depends(get_scoped_user)):
    fields, values = [], []
    if name is not None:
        fields.append("name = %s")
        values.append(name)
    if address is not None:
        fields.append("address = %s")
        values.append(address)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    conn = get_raw_db()
    cursor = conn.cursor()
    values.append(home_id)
    cursor.execute(f"UPDATE homes SET {', '.join(fields)} WHERE id = %s", values)
    conn.commit()
    conn.close()
    return {"message": "Home updated"}

@app.delete("/homes/{home_id}")
def delete_home(home_id: int, user: dict = Depends(get_scoped_user)):
    user_id = user["user_id"]
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM homes WHERE user_id = %s", (user_id,))
    if cursor.fetchone()[0] <= 1:
        conn.close()
        raise HTTPException(status_code=400, detail="You cannot delete your only home")

    cursor.execute("SELECT id FROM rooms WHERE home_id = %s", (home_id,))
    room_ids = [row[0] for row in cursor.fetchall()]
    for room_id in room_ids:
        cursor.execute("SELECT id FROM monitored_points WHERE room_id = %s", (room_id,))
        point_ids = [row[0] for row in cursor.fetchall()]
        for point_id in point_ids:
            for table in ("readings", "alerts", "baselines", "schedules", "ai_suggestions"):
                cursor.execute(f"DELETE FROM {table} WHERE monitored_point_id = %s", (point_id,))
        cursor.execute("DELETE FROM monitored_points WHERE room_id = %s", (room_id,))
    cursor.execute("DELETE FROM rooms WHERE home_id = %s", (home_id,))
    cursor.execute("DELETE FROM homes WHERE id = %s", (home_id,))
    conn.commit()
    conn.close()
    return {"message": "Home deleted"}

@app.put("/auth/profile")
def update_profile(name: str, user: dict = Depends(get_current_user)):
    """Update the current user's display name"""
    update_user_name(user["user_id"], name)
    return {"message": "Profile updated", "name": name}

@app.put("/auth/password")
def update_password(current_password: str, new_password: str, user: dict = Depends(get_current_user)):
    """Change the current user's password"""
    ok, error = change_password(user["user_id"], current_password, new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Password updated successfully"}

@app.get("/suggestions")
def get_suggestions(home_id: int, user: dict = Depends(get_scoped_user)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, mp.name, s.suggestion_text,
               s.estimated_saving_fcfa, s.status, s.created_at
        FROM ai_suggestions s
        JOIN monitored_points mp ON s.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s
        ORDER BY s.created_at DESC
    """, (home_id,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "appliance": row[1],
            "suggestion": row[2],
            "estimated_saving_fcfa": row[3],
            "status": row[4],
            "created_at": str(row[5])
        }
        for row in rows
    ]

@app.put("/suggestions/{suggestion_id}/accept")
def accept_suggestion(suggestion_id: int, user: dict = Depends(get_suggestion_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()

    # Get suggestion details
    cursor.execute("""
        SELECT s.monitored_point_id
        FROM ai_suggestions s
        WHERE s.id = %s
    """, (suggestion_id,))

    result = cursor.fetchone()
    if not result:
        conn.close()
        raise HTTPException(status_code=404, detail="Suggestion not found")

    monitored_point_id = result[0]

    # Mark as accepted
    cursor.execute("""
        UPDATE ai_suggestions SET status = 'accepted'
        WHERE id = %s
    """, (suggestion_id,))

    # Create schedule from suggestion
    cursor.execute("""
        INSERT INTO schedules (monitored_point_id, on_time, off_time, active, source)
        VALUES (%s, '22:00:00', '05:00:00', TRUE, 'ai')
    """, (monitored_point_id,))

    conn.commit()
    conn.close()
    return {"message": "Suggestion accepted and schedule created"}

@app.put("/suggestions/{suggestion_id}/ignore")
def ignore_suggestion(suggestion_id: int, user: dict = Depends(get_suggestion_owner)):
    conn = get_raw_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE ai_suggestions SET status = 'ignored'
        WHERE id = %s
    """, (suggestion_id,))
    conn.commit()
    conn.close()
    return {"message": "Suggestion ignored"}
@app.post("/suggestions/run")
def run_advisor_now():
    from ai_advisor import run_ai_advisor
    run_ai_advisor()
    return {"message": "AI advisor executed"}
@app.get("/suggestions/debug")
def debug_suggestions():
    from ai_advisor import analyze_usage_patterns, PEAK_HOURS
    conn = get_raw_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT HOUR(timestamp) as hour, AVG(watts) as avg_watts, COUNT(*) as count
        FROM readings
        WHERE monitored_point_id = 6
        GROUP BY HOUR(timestamp)
    """)
    rows = cursor.fetchall()
    conn.close()

    return {
        "peak_hours": PEAK_HOURS,
        "fridge_hourly_data": [
            {"hour": row[0], "avg_watts": row[1], "count": row[2]}
            for row in rows
        ]
    }
@app.get("/suggestions/debug")
def debug_suggestions():
    from ai_advisor import analyze_usage_patterns, PEAK_HOURS, calculate_savings

    hourly_profile = analyze_usage_patterns(6)
    peak_usage = {h: w for h, w in hourly_profile.items() if h in PEAK_HOURS}

    savings = 0
    if peak_usage:
        avg_watts = sum(peak_usage.values()) / len(peak_usage)
        savings = calculate_savings(avg_watts, len(peak_usage), 17)

    return {
        "hourly_profile": hourly_profile,
        "peak_usage": peak_usage,
        "calculated_savings": savings,
        "peak_hours": PEAK_HOURS
    }
@app.get("/suggestions/debug2")
def debug_suggestions2():
    from ai_advisor import analyze_usage_patterns, PEAK_HOURS, calculate_savings

    hourly_profile = analyze_usage_patterns(6)
    peak_usage = {h: w for h, w in hourly_profile.items() if h in PEAK_HOURS}

    savings = 0
    avg_watts = 0
    if peak_usage:
        avg_watts = sum(peak_usage.values()) / len(peak_usage)
        savings = calculate_savings(avg_watts, len(peak_usage), 17)

    return {
        "hourly_profile": hourly_profile,
        "peak_usage": peak_usage,
        "avg_watts": avg_watts,
        "calculated_savings": savings,
        "savings_threshold": 1
    }
@app.get("/history/daily")
def get_daily_history(home_id: int, month: int = None, year: int = None, user: dict = Depends(get_scoped_user)):
    """Returns consumption per day for a given month"""
    conn = get_raw_db()
    cursor = conn.cursor()

    if not month or not year:
        cursor.execute("SELECT MONTH(NOW()), YEAR(NOW())")
        row = cursor.fetchone()
        month, year = row[0], row[1]

    cursor.execute("""
        SELECT
            DAY(r.timestamp) as day,
            SUM(r.watts) / 1000 / 1800 as kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND MONTH(r.timestamp) = %s AND YEAR(r.timestamp) = %s
        GROUP BY DAY(r.timestamp)
        ORDER BY DAY(r.timestamp)
    """, (home_id, month, year))

    rows = cursor.fetchall()

    # Get previous month for comparison
    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1

    cursor.execute("""
        SELECT SUM(r.watts) / 1000 / 1800
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND MONTH(r.timestamp) = %s AND YEAR(r.timestamp) = %s
    """, (home_id, prev_month, prev_year))

    prev_total = cursor.fetchone()[0] or 0
    current_total = sum(r[1] for r in rows)
    days = len(rows) or 1

    conn.close()

    change = ((current_total - prev_total) / prev_total * 100) if prev_total > 0 else 0

    return {
        "month": month,
        "year": year,
        "total_kwh": round(current_total, 3),
        "avg_per_day_kwh": round(current_total / days, 3),
        "change_vs_prev": round(change, 1),
        "estimated_fcfa": round(current_total * 79, 0),
        "avg_fcfa_per_day": round((current_total / days) * 79, 0),
        "bars": [
            {"day": row[0], "kwh": round(row[1], 3)}
            for row in rows
        ]
    }

@app.get("/history/weekly")
def get_weekly_history(home_id: int, user: dict = Depends(get_scoped_user)):
    """Returns consumption per day for the last 7 days"""
    conn = get_raw_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            DATE(r.timestamp) as date,
            SUM(r.watts) / 1000 / 1800 as kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND r.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(r.timestamp)
        ORDER BY DATE(r.timestamp)
    """, (home_id,))

    rows = cursor.fetchall()
    total = sum(r[1] for r in rows)
    days = len(rows) or 1
    conn.close()

    return {
        "total_kwh": round(total, 3),
        "avg_per_day_kwh": round(total / days, 3),
        "estimated_fcfa": round(total * 79, 0),
        "bars": [
            {
                "day": str(row[0]),
                "kwh": round(row[1], 3)
            }
            for row in rows
        ]
    }

@app.get("/history/yearly")
def get_yearly_history(home_id: int, year: int = None, user: dict = Depends(get_scoped_user)):
    """Returns consumption per month for a given year"""
    conn = get_raw_db()
    cursor = conn.cursor()

    if not year:
        cursor.execute("SELECT YEAR(NOW())")
        year = cursor.fetchone()[0]

    cursor.execute("""
        SELECT
            MONTH(r.timestamp) as month,
            SUM(r.watts) / 1000 / 1800 as kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND YEAR(r.timestamp) = %s
        GROUP BY MONTH(r.timestamp)
        ORDER BY MONTH(r.timestamp)
    """, (home_id, year))

    rows = cursor.fetchall()
    total = sum(r[1] for r in rows)
    conn.close()

    months = ['Jan','Feb','Mar','Apr','May','Jun',
              'Jul','Aug','Sep','Oct','Nov','Dec']

    return {
        "year": year,
        "total_kwh": round(total, 3),
        "estimated_fcfa": round(total * 79, 0),
        "bars": [
            {
                "month": months[int(row[0]) - 1],
                "kwh": round(row[1], 3)
            }
            for row in rows
        ]
    }

@app.get("/history/by-appliance")
def get_history_by_appliance(home_id: int, month: int = None, year: int = None, user: dict = Depends(get_scoped_user)):
    """Returns total consumption per appliance for a given month"""
    conn = get_raw_db()
    cursor = conn.cursor()

    if not month or not year:
        cursor.execute("SELECT MONTH(NOW()), YEAR(NOW())")
        row = cursor.fetchone()
        month, year = row[0], row[1]

    cursor.execute("""
        SELECT
            mp.name,
            SUM(r.watts) / 1000 / 1800 as kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND MONTH(r.timestamp) = %s AND YEAR(r.timestamp) = %s
        GROUP BY mp.id, mp.name
        ORDER BY kwh DESC
    """, (home_id, month, year))

    rows = cursor.fetchall()
    total = sum(r[1] for r in rows)
    conn.close()

    return [
        {
            "name": row[0],
            "kwh": round(row[1], 3),
            "percentage": round((row[1] / total * 100) if total > 0 else 0, 1),
            "estimated_fcfa": round(row[1] * 79, 0)
        }
        for row in rows
    ]
@app.get("/stats/overview")
def get_overview(home_id: int, user: dict = Depends(get_scoped_user)):
    """Returns today, week, month stats and device counts"""
    conn = get_raw_db()
    cursor = conn.cursor()

    def readings_sum(where_clause):
        cursor.execute(f"""
            SELECT SUM(r.watts) / 1000 / 1800
            FROM readings r
            JOIN monitored_points mp ON r.monitored_point_id = mp.id
            JOIN rooms rm ON mp.room_id = rm.id
            WHERE rm.home_id = %s AND {where_clause}
        """, (home_id,))
        return cursor.fetchone()[0] or 0

    today_kwh = readings_sum("DATE(r.timestamp) = CURDATE()")
    yesterday_kwh = readings_sum("DATE(r.timestamp) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)")
    week_kwh = readings_sum("YEARWEEK(r.timestamp) = YEARWEEK(NOW())")
    last_week_kwh = readings_sum("YEARWEEK(r.timestamp) = YEARWEEK(DATE_SUB(NOW(), INTERVAL 1 WEEK))")
    month_kwh = readings_sum("MONTH(r.timestamp) = MONTH(NOW()) AND YEAR(r.timestamp) = YEAR(NOW())")
    last_month_kwh = readings_sum(
        "MONTH(r.timestamp) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH)) "
        "AND YEAR(r.timestamp) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH))"
    )

    # Total monitored points in this home
    cursor.execute("""
        SELECT COUNT(*) FROM monitored_points mp
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s
    """, (home_id,))
    total_devices = cursor.fetchone()[0] or 0

    # Online devices in this home
    cursor.execute("""
        SELECT COUNT(*) FROM energiboxes e
        JOIN monitored_points mp ON mp.energibox_id = e.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s AND e.status = 'online'
    """, (home_id,))
    online_devices = cursor.fetchone()[0] or 0

    # Active alerts in this home
    cursor.execute("""
        SELECT COUNT(*) FROM alerts a
        JOIN monitored_points mp ON a.monitored_point_id = mp.id
        JOIN rooms r ON mp.room_id = r.id
        WHERE r.home_id = %s AND a.read_status = FALSE
    """, (home_id,))
    active_alerts = cursor.fetchone()[0] or 0

    conn.close()

    # Calculate changes
    def pct_change(current, previous):
        if previous == 0:
            return 0
        return round((current - previous) / previous * 100, 1)

    # Projected bill (linear projection)
    from datetime import datetime
    day_of_month = datetime.now().day
    days_in_month = 30
    projected_kwh = (month_kwh / day_of_month) * days_in_month if day_of_month > 0 else 0

    return {
        "today": {
            "kwh": round(today_kwh, 3),
            "change_vs_yesterday": pct_change(today_kwh, yesterday_kwh)
        },
        "week": {
            "kwh": round(week_kwh, 3),
            "change_vs_last_week": pct_change(week_kwh, last_week_kwh)
        },
        "month": {
            "kwh": round(month_kwh, 3),
            "change_vs_last_month": pct_change(month_kwh, last_month_kwh),
            "estimated_fcfa": round(month_kwh * 79, 0),
            "projected_fcfa": round(projected_kwh * 79, 0)
        },
        "devices": {
            "total": total_devices,
            "online": online_devices,
            "active_alerts": active_alerts
        }
    }

# ── ADMIN ──

@app.get("/admin/users")
def admin_list_users(admin: dict = Depends(get_current_admin)):
    return list_all_users()

@app.post("/admin/users")
def admin_create_user(name: str, email: str, password: str, admin: dict = Depends(get_current_admin)):
    """Create a new (owner-role) account on a user's behalf"""
    if not EMAIL_REGEX.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user_id, error = register_user(name, email, password, role="owner")
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"id": user_id, "name": name, "email": email, "role": "owner"}

@app.put("/admin/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, new_password: str, admin: dict = Depends(get_current_admin)):
    """Set a new password for a user who lost access to their account —
    unlike the self-service change-password flow, this doesn't require
    knowing the current password."""
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    ok, error = admin_set_password(user_id, new_password)
    if not ok:
        raise HTTPException(status_code=404, detail=error)
    return {"message": "Password reset successfully"}

@app.put("/admin/users/{user_id}/suspend")
def admin_suspend_user(user_id: int, suspended: bool, admin: dict = Depends(get_current_admin)):
    set_user_suspended(user_id, suspended)
    return {"message": "User suspended" if suspended else "User reinstated"}

@app.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, admin: dict = Depends(get_current_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    delete_user(user_id)
    return {"message": "User deleted"}

@app.get("/admin/stats")
def admin_platform_stats(admin: dict = Depends(get_current_admin)):
    conn = get_raw_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM users WHERE is_suspended = 0")
    active_users = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM energiboxes")
    total_energiboxes = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM energiboxes WHERE status = 'online'")
    online_energiboxes = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts")
    total_alerts = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")
    alerts_last_7_days = cursor.fetchone()[0]

    conn.close()
    return {
        "users": {"active": active_users, "total": total_users},
        "energiboxes": {"total": total_energiboxes, "online": online_energiboxes},
        "alerts": {"total": total_alerts, "last_7_days": alerts_last_7_days},
    }

@app.get("/rooms/consumption")
def get_rooms_consumption(home_id: int, user: dict = Depends(get_scoped_user)):
    """Returns current consumption per room"""
    conn = get_raw_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            r.id,
            r.name,
            COUNT(mp.id) as device_count,
            SUM(latest.watts) as total_watts
        FROM rooms r
        LEFT JOIN monitored_points mp ON mp.room_id = r.id
        LEFT JOIN (
            SELECT monitored_point_id, watts
            FROM readings
            WHERE id IN (
                SELECT MAX(id) FROM readings GROUP BY monitored_point_id
            )
        ) latest ON latest.monitored_point_id = mp.id
        WHERE r.home_id = %s
        GROUP BY r.id, r.name
    """, (home_id,))

    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "id": row[0],
            "name": row[1],
            "device_count": row[2] or 0,
            "watts": round(row[3] or 0, 1),
            "kw": round((row[3] or 0) / 1000, 3)
        }
        for row in rows
    ]
