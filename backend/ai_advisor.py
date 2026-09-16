"""Suggests ways to lower the bill.

Rewritten around what the published tariff actually is. The previous
version assumed peak/off-peak pricing and advised shifting appliances to
22:00-05:00, computing savings from a PEAK_RATE of 100 and an
OFF_PEAK_RATE of 60. Neither figure appears in any published band, and
Cameroon's low-voltage schedule has no time-of-day pricing at all, so
those savings could never materialise: moving *when* a household consumes
leaves the bill untouched.

What does lower a bill under a progressive tariff is consuming less. So
the advisor now looks for volume it can name and price:

  standby   a device drawing power during hours it is historically idle.
            Waste by definition, and the kWh is measurable.
  dominant  the one device responsible for an outsized share of the
            month, so effort goes where it pays.
  band      where the month will land in the tariff. ENEO bills by
            threshold: the month's total volume picks one rate applied
            to every kWh of it. So a month projected at 130 kWh is
            billed 130x79, and shedding 20 kWh to finish at 110 re-prices
            all of it at 50 — 4 770 FCFA, 46% of the bill. When the home
            is already in the cheapest band, the same arithmetic runs the
            other way and becomes a warning.

Every figure is priced with tariff.saving_from_reduction or
tariff.band_drop — cost before minus cost after — because under a
progressive tariff a saving is not a reduction times a rate, and under
threshold pricing the reduction that matters is the one that changes
which rate the whole month is billed at.
"""

from datetime import datetime

import anthropic

import tariff
from config import get_connection as get_db

# One reading every 2 seconds, the constant the whole backend assumes.
SAMPLES_PER_HOUR = 1800

# A device is "drawing" above this many watts. Below it, standby noise.
IDLE_WATTS = 5
# An hour counts as historically idle only with this much history behind
# it, so a single quiet evening cannot invent a pattern.
MIN_SAMPLES_PER_HOUR = 50
# Don't raise a suggestion over pocket change.
MIN_SAVING_FCFA = 100
# A device has to matter before it is worth naming.
DOMINANT_SHARE = 0.35
# Close enough to the next band that crossing it is worth warning about.
BAND_WARNING_KWH = 20


def _home_ids():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM homes")
    ids = [r[0] for r in cursor.fetchall()]
    conn.close()
    return ids


def month_to_date(home_id):
    """(kWh so far this month, projected kWh for the full month).

    Projection is linear on days elapsed, matching how /stats/overview
    already projects, so the two screens cannot disagree.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT SUM(r.watts) / 1000 / %s
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW()) AND YEAR(r.timestamp) = YEAR(NOW())
    """, (SAMPLES_PER_HOUR, home_id))
    kwh = cursor.fetchone()[0] or 0
    conn.close()

    day = datetime.now().day or 1
    return float(kwh), float(kwh) / day * 30


def device_month_kwh(home_id):
    """Every device in the home with its month-to-date kWh, biggest first."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mp.id, mp.name, SUM(r.watts) / 1000 / %s AS kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW()) AND YEAR(r.timestamp) = YEAR(NOW())
        GROUP BY mp.id, mp.name
        ORDER BY kwh DESC
    """, (SAMPLES_PER_HOUR, home_id))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "kwh": float(r[2] or 0)} for r in rows]


def standby_waste(monitored_point_id):
    """kWh this device burned during hours it is normally idle.

    An hour qualifies as normally idle when its historical average sits
    below IDLE_WATTS with enough samples behind it. Power drawn during
    those hours this month is waste the household can act on — something
    was left running.
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT HOUR(timestamp) AS hour, AVG(watts) AS avg_watts, COUNT(*) AS samples
        FROM readings
        WHERE monitored_point_id = %s
        AND timestamp < DATE_SUB(NOW(), INTERVAL 1 DAY)
        GROUP BY HOUR(timestamp)
    """, (monitored_point_id,))
    idle_hours = [
        row[0] for row in cursor.fetchall()
        if (row[2] or 0) >= MIN_SAMPLES_PER_HOUR and (row[1] or 0) < IDLE_WATTS
    ]

    if not idle_hours:
        conn.close()
        return 0.0, []

    placeholders = ", ".join(["%s"] * len(idle_hours))
    cursor.execute(f"""
        SELECT SUM(watts) / 1000 / %s
        FROM readings
        WHERE monitored_point_id = %s
        AND HOUR(timestamp) IN ({placeholders})
        AND watts > %s
        AND MONTH(timestamp) = MONTH(NOW()) AND YEAR(timestamp) = YEAR(NOW())
    """, (SAMPLES_PER_HOUR, monitored_point_id, *idle_hours, IDLE_WATTS))
    wasted = cursor.fetchone()[0] or 0
    conn.close()
    return float(wasted), sorted(idle_hours)


def generate_ai_phrasing(prompt_body):
    """Ask Claude to phrase the tip. Returns None on any failure — no API
    key, no internet, API down — so the caller falls back to the
    rule-based template and the advisor keeps working offline."""
    try:
        client = anthropic.Anthropic()
        response = client.with_options(timeout=6.0, max_retries=1).messages.create(
            model="claude-haiku-4-5",
            max_tokens=200,
            system=(
                "You write one short, friendly, plain-language energy-saving tip "
                "for a Cameroonian household. One to two sentences. No bullet "
                "points. Use the exact kWh and FCFA figures given and invent no "
                "others. Electricity there is billed by monthly volume, not by "
                "time of day, so never suggest shifting usage to cheaper hours."
            ),
            messages=[{"role": "user", "content": prompt_body}],
        )
        return next((b.text for b in response.content if b.type == "text"), None)
    except Exception:
        return None


def _hours_label(hours):
    """Contiguous hours as a range, scattered ones listed."""
    if not hours:
        return ""
    runs, start, prev = [], hours[0], hours[0]
    for h in hours[1:]:
        if h == prev + 1:
            prev = h
            continue
        runs.append((start, prev))
        start = prev = h
    runs.append((start, prev))
    return ", ".join(
        f"{a:02d}:00" if a == b else f"{a:02d}:00-{(b + 1) % 24:02d}:00"
        for a, b in runs
    )


def build_suggestions(home_id):
    """Every suggestion this home warrants, priced against the real bands."""
    kwh_so_far, projected = month_to_date(home_id)
    if kwh_so_far <= 0:
        return []

    devices = device_month_kwh(home_id)
    suggestions = []

    # ── Standby waste, per device ──
    for device in devices:
        wasted, idle_hours = standby_waste(device["id"])
        if wasted <= 0:
            continue
        # Waste seen so far scales to the full month the same way the
        # home's own projection does.
        day = datetime.now().day or 1
        projected_waste = wasted / day * 30
        saving = tariff.saving_from_reduction(projected, projected_waste)
        if saving < MIN_SAVING_FCFA:
            continue

        window = _hours_label(idle_hours)
        fallback = (
            f"{device['name']} drew about {projected_waste:.1f} kWh this month "
            f"during hours it is usually idle ({window}). Switching it off over "
            f"that window would cut roughly {saving:.0f} FCFA from the bill."
        )
        text = generate_ai_phrasing(
            f"Appliance: {device['name']}\n"
            f"Wasted while normally idle: {projected_waste:.1f} kWh this month\n"
            f"Idle window: {window}\n"
            f"Saving if eliminated: {saving:.0f} FCFA"
        ) or fallback

        suggestions.append({
            "monitored_point_id": device["id"],
            "suggestion_text": text,
            "estimated_saving_fcfa": round(saving),
        })

    # ── One device dominating the month ──
    total = sum(d["kwh"] for d in devices)
    if devices and total > 0:
        top = devices[0]
        share = top["kwh"] / total
        if share >= DOMINANT_SHARE and len(devices) > 1:
            # Price a tenth off the biggest consumer: concrete, and modest
            # enough not to promise something unreachable.
            target = top["kwh"] / (datetime.now().day or 1) * 30 * 0.10
            saving = tariff.saving_from_reduction(projected, target)
            if saving >= MIN_SAVING_FCFA:
                fallback = (
                    f"{top['name']} alone is {share * 100:.0f}% of this month's "
                    f"consumption. Cutting its use by a tenth would save about "
                    f"{saving:.0f} FCFA — the biggest single lever you have."
                )
                text = generate_ai_phrasing(
                    f"Appliance: {top['name']}\n"
                    f"Share of household consumption this month: {share * 100:.0f}%\n"
                    f"Saving if its use drops by 10%: {saving:.0f} FCFA"
                ) or fallback

                suggestions.append({
                    "monitored_point_id": top["id"],
                    "suggestion_text": text,
                    "estimated_saving_fcfa": round(saving),
                })

    # ── Which band the month will be billed in ──
    # Threshold pricing makes this the single biggest lever in the app:
    # dropping a band re-prices every kWh of the month, not just the ones
    # above the boundary.
    drop = tariff.band_drop(projected)
    if devices and drop and drop["saving_fcfa"] >= MIN_SAVING_FCFA:
        fallback = (
            f"You are on track for {projected:.0f} kWh this month, billed at "
            f"{drop['current_rate']} FCFA for every kWh. Finishing at "
            f"{drop['target_kwh']} kWh instead — {drop['kwh_to_cut']:.0f} kWh less — "
            f"re-prices the whole month at {drop['target_rate']} FCFA and saves about "
            f"{drop['saving_fcfa']:.0f} FCFA."
        )
        text = generate_ai_phrasing(
            f"Projected monthly consumption: {projected:.0f} kWh\n"
            f"Rate it would be billed at: {drop['current_rate']} FCFA per kWh, "
            f"on every kWh of the month\n"
            f"kWh to cut to reach the cheaper band: {drop['kwh_to_cut']:.0f}\n"
            f"Rate the whole month would then be billed at: "
            f"{drop['target_rate']} FCFA per kWh\n"
            f"Saving: {drop['saving_fcfa']:.0f} FCFA"
        ) or fallback

        # Pinned to the biggest consumer: ai_suggestions is keyed by
        # device, and that is where acting on it would start.
        suggestions.append({
            "monitored_point_id": devices[0]["id"],
            "suggestion_text": text,
            "estimated_saving_fcfa": round(drop["saving_fcfa"]),
        })
    elif devices:
        # Already in the cheapest band the home can reach. The same
        # arithmetic then warns instead of promising: crossing the
        # boundary re-prices the whole month upward.
        headroom = tariff.band_headroom(projected)
        crossing = tariff.band_crossing_cost(projected)
        if (headroom and crossing and crossing >= MIN_SAVING_FCFA
                and 0 < headroom["kwh_to_next"] <= BAND_WARNING_KWH):
            fallback = (
                f"You are on track for {projected:.0f} kWh, only "
                f"{headroom['kwh_to_next']:.0f} kWh under the "
                f"{headroom['band_to_kwh']} kWh limit. Going past it re-prices the "
                f"whole month at {headroom['next_rate']} FCFA instead of "
                f"{headroom['band_rate']} FCFA — about {crossing:.0f} FCFA more. "
                f"Staying under it is worth more than anything else this month."
            )
            text = generate_ai_phrasing(
                f"Projected monthly consumption: {projected:.0f} kWh\n"
                f"Limit of the current band: {headroom['band_to_kwh']} kWh\n"
                f"kWh of margin left: {headroom['kwh_to_next']:.0f}\n"
                f"Current rate: {headroom['band_rate']} FCFA per kWh\n"
                f"Rate if the limit is passed, applied to the whole month: "
                f"{headroom['next_rate']} FCFA per kWh\n"
                f"Extra cost of passing it: {crossing:.0f} FCFA"
            ) or fallback

            suggestions.append({
                "monitored_point_id": devices[0]["id"],
                "suggestion_text": text,
                "estimated_saving_fcfa": round(crossing),
            })

    return suggestions


def save_suggestion(suggestion):
    """Store a suggestion, replacing any pending one for the same device."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id FROM ai_suggestions
        WHERE monitored_point_id = %s AND status = 'pending'
    """, (suggestion["monitored_point_id"],))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE ai_suggestions
            SET suggestion_text = %s, estimated_saving_fcfa = %s, created_at = %s
            WHERE id = %s
        """, (
            suggestion["suggestion_text"],
            suggestion["estimated_saving_fcfa"],
            datetime.now(),
            existing[0],
        ))
    else:
        cursor.execute("""
            INSERT INTO ai_suggestions
            (monitored_point_id, suggestion_text, estimated_saving_fcfa, status, created_at)
            VALUES (%s, %s, %s, 'pending', %s)
        """, (
            suggestion["monitored_point_id"],
            suggestion["suggestion_text"],
            suggestion["estimated_saving_fcfa"],
            datetime.now(),
        ))

    conn.commit()
    conn.close()


def run_ai_advisor():
    """Rebuild suggestions for every home."""
    print(f"Running AI advisor at {datetime.now().strftime('%H:%M:%S')}")
    total = 0
    for home_id in _home_ids():
        for suggestion in build_suggestions(home_id):
            save_suggestion(suggestion)
            total += 1
    print(f"AI advisor: {total} suggestion(s) saved")
    return total
