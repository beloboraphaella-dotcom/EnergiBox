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

import json
from datetime import datetime

import bilingual
import energy
import insights
import llm
import tariff
from config import get_connection as get_db

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

    The projection comes from insights.forecast_month — the same one
    /stats/overview shows — so the advice and the dashboard cannot
    disagree about where the month is heading.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"""
        SELECT {energy.kwh('r.')}
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW()) AND YEAR(r.timestamp) = YEAR(NOW())
    """, (home_id,))
    kwh = float(cursor.fetchone()[0] or 0)
    conn.close()

    forecast = insights.forecast_month(home_id, kwh)
    return kwh, float(forecast["kwh"] or 0)


def device_month_kwh(home_id):
    """Every device in the home with its month-to-date kWh, biggest first."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"""
        SELECT mp.id, mp.name, {energy.kwh('r.')} AS kwh
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s
        AND MONTH(r.timestamp) = MONTH(NOW()) AND YEAR(r.timestamp) = YEAR(NOW())
        GROUP BY mp.id, mp.name
        ORDER BY kwh DESC
    """, (home_id,))
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
        SELECT {energy.kwh()}
        FROM readings
        WHERE monitored_point_id = %s
        AND HOUR(timestamp) IN ({placeholders})
        AND watts > %s
        AND MONTH(timestamp) = MONTH(NOW()) AND YEAR(timestamp) = YEAR(NOW())
    """, (monitored_point_id, *idle_hours, IDLE_WATTS))
    wasted = cursor.fetchone()[0] or 0
    conn.close()
    return float(wasted), sorted(idle_hours)


ADVISOR_SYSTEM = """You are the energy advisor of EnergiBox, an app that helps households in \
Cameroon lower their electricity bill. You receive saving tips already computed by the app, \
each with its facts and a draft in English and French. Rewrite each tip so it reads as \
personal, warm and concrete advice, in both languages.

Rules:
- One or two sentences per tip and language. Plain text, no markdown, no emoji.
- Use exactly the figures in the facts. Never add, change or compute a figure.
- Electricity is billed by monthly volume: the month's total picks one rate for every kWh. \
There is no cheaper time of day, so never suggest moving usage to other hours.
- French: natural French as spoken in Cameroon, addressing the household as "vous".
- Keep appliance names exactly as given.

Answer with a JSON object: {"items": [{"id": "<id>", "en": "<English tip>", "fr": "<French tip>"}]}"""


def _fcfa_fr(value):
    """9 459 with a no-break space, as French writes thousands."""
    return f"{value:,.0f}".replace(",", "\u00a0")


def _fr(value, digits=1):
    return f"{value:.{digits}f}".replace(".", ",")


def _valid(text, grounding):
    return (isinstance(text, str) and 20 <= len(text) <= 500
            and llm.numbers_are_grounded(text, grounding))


def phrase_suggestions(suggestions):
    """Have the language model reword a home's tips, in one request.

    Each tip keeps its template text unless the model returned a version
    in both languages that quotes only the figures it was given. One call
    per home per run keeps well inside free quotas; with no provider
    configured, or none answering, every tip keeps its template."""
    if not suggestions or not llm.enabled():
        return suggestions
    items = [
        {"id": str(i), "kind": s["kind"], "facts": s["facts"],
         "draft_en": s["suggestion_text"], "draft_fr": s["suggestion_text_fr"]}
        for i, s in enumerate(suggestions)
    ]
    reply = llm.complete_json(ADVISOR_SYSTEM, json.dumps({"tips": items}, ensure_ascii=False))
    by_id = {}
    for item in (reply or {}).get("items", []) if isinstance(reply, dict) else []:
        if isinstance(item, dict):
            by_id[str(item.get("id"))] = item
    for i, suggestion in enumerate(suggestions):
        item = by_id.get(str(i))
        if not item:
            continue
        grounding = "\n".join([suggestion["facts"], suggestion["suggestion_text"],
                               suggestion["suggestion_text_fr"]])
        en, fr = item.get("en"), item.get("fr")
        if _valid(en, grounding) and _valid(fr, grounding):
            suggestion.update(suggestion_text=en.strip(), suggestion_text_fr=fr.strip(), ai_written=True)
    return suggestions


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
        suggestions.append({
            "kind": "standby",
            "monitored_point_id": device["id"],
            "suggestion_text": fallback,
            "suggestion_text_fr": (
                f"{device['name']} a consommé environ {_fr(projected_waste)} kWh ce mois-ci "
                f"pendant des heures où il est d'habitude à l'arrêt ({window}). L'éteindre "
                f"sur ce créneau réduirait la facture d'environ {_fcfa_fr(saving)} FCFA."
            ),
            "facts": (
                f"Appliance: {device['name']}\n"
                f"Wasted while normally idle: {projected_waste:.1f} kWh this month\n"
                f"Idle window: {window}\n"
                f"Saving if eliminated: {saving:.0f} FCFA"
            ),
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
                suggestions.append({
                    "kind": "dominant",
                    "monitored_point_id": top["id"],
                    "suggestion_text": fallback,
                    "suggestion_text_fr": (
                        f"{top['name']} représente à lui seul {share * 100:.0f} % de la "
                        f"consommation du mois. Réduire son usage d'un dixième économiserait "
                        f"environ {_fcfa_fr(saving)} FCFA : c'est votre levier le plus important."
                    ),
                    "facts": (
                        f"Appliance: {top['name']}\n"
                        f"Share of household consumption this month: {share * 100:.0f}%\n"
                        f"Saving if its use drops by 10%: {saving:.0f} FCFA"
                    ),
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
        facts = (
            f"Projected monthly consumption: {projected:.0f} kWh\n"
            f"Rate it would be billed at: {drop['current_rate']} FCFA per kWh, "
            f"on every kWh of the month\n"
            f"Consumption to finish at instead: {drop['target_kwh']} kWh\n"
            f"kWh to cut to reach the cheaper band: {drop['kwh_to_cut']:.0f}\n"
            f"Rate the whole month would then be billed at: "
            f"{drop['target_rate']} FCFA per kWh\n"
            f"Saving: {drop['saving_fcfa']:.0f} FCFA"
        )
        text_fr = (
            f"Vous vous dirigez vers {projected:.0f} kWh ce mois-ci, facturés "
            f"{drop['current_rate']} FCFA chaque kWh. Terminer à {drop['target_kwh']} kWh, "
            f"soit {drop['kwh_to_cut']:.0f} kWh de moins, ferait facturer tout le mois à "
            f"{drop['target_rate']} FCFA le kWh et économiserait environ "
            f"{_fcfa_fr(drop['saving_fcfa'])} FCFA."
        )

        # Pinned to the biggest consumer: ai_suggestions is keyed by
        # device, and that is where acting on it would start.
        suggestions.append({
            "kind": "band",
            "monitored_point_id": devices[0]["id"],
            "suggestion_text": fallback,
            "suggestion_text_fr": text_fr,
            "facts": facts,
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
            suggestions.append({
                "kind": "band_warning",
                "monitored_point_id": devices[0]["id"],
                "suggestion_text": fallback,
                "suggestion_text_fr": (
                    f"Vous vous dirigez vers {projected:.0f} kWh, à seulement "
                    f"{headroom['kwh_to_next']:.0f} kWh de la limite de "
                    f"{headroom['band_to_kwh']} kWh. La dépasser ferait facturer tout le mois "
                    f"à {headroom['next_rate']} FCFA le kWh au lieu de {headroom['band_rate']} "
                    f"FCFA, soit environ {_fcfa_fr(crossing)} FCFA de plus. Rester en dessous "
                    f"compte plus que tout ce mois-ci."
                ),
                "facts": (
                    f"Projected monthly consumption: {projected:.0f} kWh\n"
                    f"Limit of the current band: {headroom['band_to_kwh']} kWh\n"
                    f"kWh of margin left: {headroom['kwh_to_next']:.0f}\n"
                    f"Current rate: {headroom['band_rate']} FCFA per kWh\n"
                    f"Rate if the limit is passed, applied to the whole month: "
                    f"{headroom['next_rate']} FCFA per kWh\n"
                    f"Extra cost of passing it: {crossing:.0f} FCFA"
                ),
                "estimated_saving_fcfa": round(crossing),
            })

    return suggestions


# Set by probe(). None means "never probed", treated as absent.
_has_kind_column = None


def probe(conn):
    """Look for `ai_suggestions.kind` (migration 004) once, at startup."""
    global _has_kind_column
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW COLUMNS FROM ai_suggestions LIKE 'kind'")
        _has_kind_column = cursor.fetchone() is not None
    except Exception as exc:
        print(f"ai_advisor: could not probe ai_suggestions.kind ({exc!r}) — "
              f"keeping one suggestion per device")
        _has_kind_column = False

    if not _has_kind_column:
        print("ai_advisor: ai_suggestions.kind is absent — apply "
              "backend/migrations/004_suggestion_kind.sql so a device can "
              "hold more than one pending suggestion")
    return _has_kind_column


def uses_kinds():
    """Whether suggestions are kept per (device, kind). Reported by /health."""
    return bool(_has_kind_column)


def save_suggestion(suggestion):
    """Store a suggestion, replacing the pending one it supersedes.

    With migration 004 that is the pending suggestion of the same kind for
    the same device, so a device can carry its own standby tip, the
    dominant-device tip and the band tip at once. An untyped row written
    before the migration is claimed when no typed one matches, so it is
    replaced rather than left alongside. Without the migration there is
    one pending suggestion per device, as before.
    """
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now()

    if uses_kinds():
        cursor.execute("""
            SELECT id FROM ai_suggestions
            WHERE monitored_point_id = %s AND status = 'pending'
            AND (kind = %s OR kind IS NULL)
            ORDER BY kind IS NULL
            LIMIT 1
        """, (suggestion["monitored_point_id"], suggestion["kind"]))
    else:
        cursor.execute("""
            SELECT id FROM ai_suggestions
            WHERE monitored_point_id = %s AND status = 'pending'
        """, (suggestion["monitored_point_id"],))
    existing = cursor.fetchone()

    text = suggestion["suggestion_text"]
    saving = suggestion["estimated_saving_fcfa"]
    if existing and uses_kinds():
        cursor.execute("""
            UPDATE ai_suggestions
            SET suggestion_text = %s, estimated_saving_fcfa = %s,
                created_at = %s, kind = %s
            WHERE id = %s
        """, (text, saving, now, suggestion["kind"], existing[0]))
    elif existing:
        cursor.execute("""
            UPDATE ai_suggestions
            SET suggestion_text = %s, estimated_saving_fcfa = %s, created_at = %s
            WHERE id = %s
        """, (text, saving, now, existing[0]))
    elif uses_kinds():
        cursor.execute("""
            INSERT INTO ai_suggestions
            (monitored_point_id, suggestion_text, estimated_saving_fcfa, status, created_at, kind)
            VALUES (%s, %s, %s, 'pending', %s, %s)
        """, (suggestion["monitored_point_id"], text, saving, now, suggestion["kind"]))
    else:
        cursor.execute("""
            INSERT INTO ai_suggestions
            (monitored_point_id, suggestion_text, estimated_saving_fcfa, status, created_at)
            VALUES (%s, %s, %s, 'pending', %s)
        """, (suggestion["monitored_point_id"], text, saving, now))

    # The French text and who wrote it, with migration 006.
    row_id = existing[0] if existing else getattr(cursor, "lastrowid", None)
    if bilingual.enabled() and row_id:
        cursor.execute("""
            UPDATE ai_suggestions SET suggestion_text_fr = %s, ai_written = %s
            WHERE id = %s
        """, (suggestion.get("suggestion_text_fr"), 1 if suggestion.get("ai_written") else 0, row_id))

    conn.commit()
    conn.close()


def one_per_device(suggestions):
    """Without migration 004 a device holds a single pending suggestion,
    so saving several would let the last one silently replace the rest.
    Keep the one worth the most instead — a deliberate choice rather than
    whichever the code happened to build last."""
    best = {}
    for suggestion in suggestions:
        point = suggestion["monitored_point_id"]
        if (point not in best or suggestion["estimated_saving_fcfa"]
                > best[point]["estimated_saving_fcfa"]):
            best[point] = suggestion
    return list(best.values())


def run_ai_advisor():
    """Rebuild suggestions for every home."""
    print(f"Running AI advisor at {datetime.now().strftime('%H:%M:%S')}")
    total = 0
    for home_id in _home_ids():
        suggestions = build_suggestions(home_id)
        if not uses_kinds():
            suggestions = one_per_device(suggestions)
        suggestions = phrase_suggestions(suggestions)
        for suggestion in suggestions:
            save_suggestion(suggestion)
            total += 1
    print(f"AI advisor: {total} suggestion(s) saved")
    return total
