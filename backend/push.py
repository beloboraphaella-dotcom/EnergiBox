"""Phone notifications for new alerts, through Expo's push service.

An alert used to wait, unseen, until the household next opened the app —
by which time the appliance had been running for hours. The mobile app
now registers its Expo push token (POST /push/register) and each new
alert is pushed to the home owner's phones.

The text is composed here, in the language the phone registered with,
from the alert's type and the appliance's name — not from the stored
English message, which the apps cannot translate.

Optional, like migrations 002–004: probe() looks for the `push_tokens`
table (migration 005) at startup. Without it, registration answers 409
and alerts are simply not pushed.

Sending happens on a daemon thread so a slow or unreachable push service
never holds up telemetry processing, which is where alerts are raised.
Only the leader worker processes telemetry, so each alert is pushed once.
"""

import json
import threading
import urllib.request

from config import get_connection

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

_has_table = False

TITLES = {
    "en": {
        "spike": "Consumption spike",
        "extended_runtime": "Running for a long time",
        "idle_waste": "Unusual standby draw",
        "anomaly_high": "Unusual day of consumption",
        "anomaly_low": "Consumption has dropped",
    },
    "fr": {
        "spike": "Pic de consommation",
        "extended_runtime": "Fonctionne depuis longtemps",
        "idle_waste": "Consommation de veille inhabituelle",
        "anomaly_high": "Journée de consommation inhabituelle",
        "anomaly_low": "Consommation en forte baisse",
    },
}
BODIES = {
    "en": "{appliance}: open EnergiBox to see the details.",
    "fr": "{appliance} : ouvrez EnergiBox pour voir le détail.",
}


def probe(conn):
    """Look for the `push_tokens` table (migration 005) once, at startup."""
    global _has_table
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES LIKE 'push_tokens'")
        _has_table = cursor.fetchone() is not None
    except Exception as exc:
        print(f"push: could not probe push_tokens ({exc!r}) — notifications off")
        _has_table = False
    if not _has_table:
        print("push: push_tokens is absent — apply "
              "backend/migrations/005_budget_and_push.sql to send alerts to phones")
    return _has_table


def enabled():
    return bool(_has_table)


def register(user_id, token, platform, language):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        # A token belongs to one phone; if that phone now signs in as
        # someone else, the token follows the new account.
        cursor.execute("""
            INSERT INTO push_tokens (user_id, token, platform, language)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE user_id = VALUES(user_id),
                                    platform = VALUES(platform),
                                    language = VALUES(language)
        """, (user_id, token, platform, language))
        conn.commit()
    finally:
        conn.close()


def unregister(user_id, token):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM push_tokens WHERE user_id = %s AND token = %s", (user_id, token))
        conn.commit()
    finally:
        conn.close()


def _tokens_for_point(monitored_point_id):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT pt.token, pt.language, mp.name
            FROM monitored_points mp
            JOIN rooms rm ON mp.room_id = rm.id
            JOIN homes h ON rm.home_id = h.id
            JOIN push_tokens pt ON pt.user_id = h.user_id
            WHERE mp.id = %s
        """, (monitored_point_id,))
        return cursor.fetchall()
    finally:
        conn.close()


def _forget(tokens):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.executemany("DELETE FROM push_tokens WHERE token = %s", [(t,) for t in tokens])
        conn.commit()
    finally:
        conn.close()


def build_messages(rows, alert_type):
    messages = []
    for token, language, appliance in rows:
        lang = language if language in TITLES else "en"
        messages.append({
            "to": token,
            "title": TITLES[lang].get(alert_type, TITLES[lang]["spike"]),
            "body": BODIES[lang].format(appliance=appliance),
            "sound": "default",
            "data": {"kind": "alert", "type": alert_type},
        })
    return messages


def _send(monitored_point_id, alert_type):
    try:
        rows = _tokens_for_point(monitored_point_id)
        if not rows:
            return
        messages = build_messages(rows, alert_type)
        request = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            tickets = json.loads(response.read()).get("data", [])
        # A phone that uninstalled the app reports DeviceNotRegistered;
        # keeping its token would mean trying it again on every alert.
        gone = [
            message["to"] for message, ticket in zip(messages, tickets)
            if ticket.get("details", {}).get("error") == "DeviceNotRegistered"
        ]
        if gone:
            _forget(gone)
    except Exception as exc:
        print(f"push: sending failed ({exc!r})")


def notify_alert(monitored_point_id, alert_type):
    if not _has_table:
        return
    threading.Thread(target=_send, args=(monitored_point_id, alert_type), daemon=True).start()
