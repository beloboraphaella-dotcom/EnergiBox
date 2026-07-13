import pymysql
from datetime import datetime
import anthropic

def get_db():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="belobo2008@",
        database="energibox"
    )

# SOCADEL peak hours (expensive) — 6am to 9am and 6pm to 9pm
PEAK_HOURS = list(range(6, 9)) + list(range(18, 21))
OFF_PEAK_HOURS = list(range(22, 24)) + list(range(0, 6)) + list(range(9, 18))

# SOCADEL tariff rates (FCFA per kWh)
PEAK_RATE = 100      # More expensive during peak hours
OFF_PEAK_RATE = 60   # Cheaper during off-peak hours

def get_monitored_points():
    """Get all monitored points"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.id, mp.name, e.mac_address
        FROM monitored_points mp
        JOIN energiboxes e ON mp.energibox_id = e.id
    """)
    results = cursor.fetchall()
    conn.close()
    return results

def analyze_usage_patterns(monitored_point_id):
    """Analyze when an appliance typically runs"""
    conn = get_db()
    cursor = conn.cursor()

    # Get average consumption per hour of day
    cursor.execute("""
        SELECT HOUR(timestamp) as hour, AVG(watts) as avg_watts, COUNT(*) as count
        FROM readings
        WHERE monitored_point_id = %s
        AND watts > 10
        GROUP BY HOUR(timestamp)
        ORDER BY hour
    """, (monitored_point_id,))

    results = cursor.fetchall()
    conn.close()

    # Build hourly profile
    hourly_profile = {}
    for row in results:
        hour, avg_watts, count = row
        if count >= 5:  # Need at least 5 readings for this hour
            hourly_profile[hour] = avg_watts

    return hourly_profile

def calculate_savings(avg_watts, peak_hours_count, off_peak_hours_count):
    """Calculate potential monthly savings by shifting from peak to off-peak"""
    # Average session duration: 1 hour
    kwh_per_session = avg_watts / 1000

    # Current cost (running during peak hours) per month
    current_cost = kwh_per_session * peak_hours_count * PEAK_RATE * 30

    # Potential cost (running during off-peak hours) per month  
    potential_cost = kwh_per_session * peak_hours_count * OFF_PEAK_RATE * 30

    savings = current_cost - potential_cost
    return round(savings, 0)

def generate_ai_phrasing(appliance_name, peak_hours_str, savings_fcfa):
    """Ask Claude to phrase a personalized suggestion. Returns None on any
    failure (no API key, no internet, API down) so the caller falls back to
    the rule-based template — the advisor must keep working fully offline."""
    try:
        client = anthropic.Anthropic()
        response = client.with_options(timeout=6.0, max_retries=1).messages.create(
            model="claude-haiku-4-5",
            max_tokens=150,
            system=(
                "You write one short, friendly, plain-language energy-saving tip for a "
                "Cameroonian household. One to two sentences. No bullet points. "
                "Mention the specific FCFA savings figure given. No hedging language."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Appliance: {appliance_name}\n"
                    f"Currently runs during peak tariff hours: {peak_hours_str}\n"
                    f"Estimated monthly saving if shifted to off-peak (22:00-05:00): "
                    f"{savings_fcfa:.0f} FCFA"
                ),
            }],
        )
        return next((b.text for b in response.content if b.type == "text"), None)
    except Exception:
        return None

def generate_suggestion(monitored_point_id, appliance_name):
    """Generate AI scheduling suggestion for an appliance"""
    hourly_profile = analyze_usage_patterns(monitored_point_id)

    if not hourly_profile:
        return None  # Not enough data

    # Find which peak hours the appliance runs in
    peak_usage = {h: w for h, w in hourly_profile.items() if h in PEAK_HOURS}

    if not peak_usage:
        return None  # Appliance doesn't run during peak hours — no suggestion needed

    # Calculate average watts during peak usage
    avg_watts = sum(peak_usage.values()) / len(peak_usage)
    peak_hours_count = len(peak_usage)

    # Calculate potential savings
    savings = calculate_savings(avg_watts, peak_hours_count, len(OFF_PEAK_HOURS))

    if savings < 1:
        return None  # Savings too small to suggest

    # Find best off-peak window to suggest
    suggested_on = "22:00"
    suggested_off = "05:00"

    peak_hours_str = ", ".join([f"{h}:00" for h in sorted(peak_usage.keys())])

    suggestion_text = generate_ai_phrasing(appliance_name, peak_hours_str, savings) or (
        f"{appliance_name} typically runs during peak tariff hours ({peak_hours_str}). "
        f"Shifting its usage to off-peak hours (10pm - 6am) could save approximately "
        f"{savings:.0f} FCFA per month based on your consumption patterns."
    )

    return {
        "monitored_point_id": monitored_point_id,
        "suggestion_text": suggestion_text,
        "estimated_saving_fcfa": savings,
        "suggested_on_time": suggested_on,
        "suggested_off_time": suggested_off
    }

def save_suggestion(suggestion):
    """Save a suggestion to the database"""
    conn = get_db()
    cursor = conn.cursor()

    # Check if a pending suggestion already exists for this appliance
    cursor.execute("""
        SELECT id FROM ai_suggestions
        WHERE monitored_point_id = %s
        AND status = 'pending'
    """, (suggestion["monitored_point_id"],))

    existing = cursor.fetchone()

    if existing:
        # Update existing suggestion
        cursor.execute("""
            UPDATE ai_suggestions
            SET suggestion_text = %s,
                estimated_saving_fcfa = %s,
                created_at = %s
            WHERE id = %s
        """, (
            suggestion["suggestion_text"],
            suggestion["estimated_saving_fcfa"],
            datetime.now(),
            existing[0]
        ))
    else:
        # Create new suggestion
        cursor.execute("""
            INSERT INTO ai_suggestions
            (monitored_point_id, suggestion_text, estimated_saving_fcfa, status, created_at)
            VALUES (%s, %s, %s, 'pending', %s)
        """, (
            suggestion["monitored_point_id"],
            suggestion["suggestion_text"],
            suggestion["estimated_saving_fcfa"],
            datetime.now()
        ))

    conn.commit()
    conn.close()
    print(f"AI suggestion saved: {suggestion['suggestion_text'][:60]}...")

def run_ai_advisor():
    """Run the AI advisor for all monitored points"""
    print(f"Running AI advisor at {datetime.now().strftime('%H:%M:%S')}")
    points = get_monitored_points()

    for point in points:
        monitored_point_id, appliance_name, mac = point
        suggestion = generate_suggestion(monitored_point_id, appliance_name)
        if suggestion:
            save_suggestion(suggestion)
        else:
            print(f"{appliance_name}: No suggestion needed")