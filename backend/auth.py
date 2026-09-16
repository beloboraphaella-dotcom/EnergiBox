from datetime import datetime, timedelta
from jose import JWTError, jwt
import hashlib

from config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    get_connection as get_db,
)

def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password

def create_access_token(user_id: int, email: str, role: str = "owner") -> str:
    """Generate a JWT token for a user"""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

def get_user_by_email(email: str):
    """Find a user by email"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, email, password_hash, role, is_suspended
        FROM users WHERE email = %s
    """, (email,))
    result = cursor.fetchone()
    conn.close()
    return result

def register_user(name: str, email: str, password: str, role: str = "owner"):
    """Create a new user account"""
    conn = get_db()
    cursor = conn.cursor()

    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
    if cursor.fetchone():
        conn.close()
        return None, "Email already registered"

    password_hash = hash_password(password)
    cursor.execute("""
        INSERT INTO users (name, email, password_hash, role)
        VALUES (%s, %s, %s, %s)
    """, (name, email, password_hash, role))
    conn.commit()

    user_id = cursor.lastrowid
    conn.close()
    return user_id, None

def update_user_name(user_id: int, name: str):
    """Update a user's display name"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET name = %s WHERE id = %s", (name, user_id))
    conn.commit()
    conn.close()

def change_password(user_id: int, current_password: str, new_password: str):
    """Verify the current password and set a new one"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
    result = cursor.fetchone()

    if not result:
        conn.close()
        return False, "User not found"

    if not verify_password(current_password, result[0]):
        conn.close()
        return False, "Current password is incorrect"

    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hash_password(new_password), user_id)
    )
    conn.commit()
    conn.close()
    return True, None

def login_user(email: str, password: str):
    """Verify credentials and return JWT token"""
    user = get_user_by_email(email)

    if not user:
        return None, "User not found"

    user_id, name, user_email, password_hash, role, is_suspended = user

    if not verify_password(password, password_hash):
        return None, "Incorrect password"

    if is_suspended:
        return None, "This account has been suspended"

    token = create_access_token(user_id, user_email, role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": name,
            "email": user_email,
            "role": role
        }
    }, None

def list_all_users():
    """Return every user account (admin use)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, email, role, is_suspended, created_at
        FROM users ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "role": row[3],
            "is_suspended": bool(row[4]),
            "created_at": str(row[5]),
        }
        for row in rows
    ]

def set_user_suspended(user_id: int, suspended: bool):
    """Suspend or reinstate a user account"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_suspended = %s WHERE id = %s", (suspended, user_id))
    conn.commit()
    conn.close()

def admin_set_password(user_id: int, new_password: str):
    """Directly set a user's password (admin recovery for lost/forgotten
    credentials) — unlike change_password, this does not require knowing
    the current password."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
    if not cursor.fetchone():
        conn.close()
        return False, "User not found"
    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (hash_password(new_password), user_id)
    )
    conn.commit()
    conn.close()
    return True, None

def delete_user(user_id: int):
    """Permanently delete a user account and their home/rooms/devices"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM homes WHERE user_id = %s", (user_id,))
    home_ids = [row[0] for row in cursor.fetchall()]
    for home_id in home_ids:
        cursor.execute("SELECT id FROM rooms WHERE home_id = %s", (home_id,))
        room_ids = [row[0] for row in cursor.fetchall()]
        for room_id in room_ids:
            cursor.execute("SELECT id FROM monitored_points WHERE room_id = %s", (room_id,))
            point_ids = [row[0] for row in cursor.fetchall()]
            for point_id in point_ids:
                cursor.execute("DELETE FROM readings WHERE monitored_point_id = %s", (point_id,))
                cursor.execute("DELETE FROM alerts WHERE monitored_point_id = %s", (point_id,))
                cursor.execute("DELETE FROM baselines WHERE monitored_point_id = %s", (point_id,))
                cursor.execute("DELETE FROM schedules WHERE monitored_point_id = %s", (point_id,))
                cursor.execute("DELETE FROM ai_suggestions WHERE monitored_point_id = %s", (point_id,))
            cursor.execute("DELETE FROM monitored_points WHERE room_id = %s", (room_id,))
        cursor.execute("DELETE FROM rooms WHERE home_id = %s", (home_id,))
    cursor.execute("DELETE FROM homes WHERE user_id = %s", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    conn.close()