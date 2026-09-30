"""The monthly report: what the month cost, what changed, what to do.

The figures are computed here, from readings, exactly as the history
screens compute them. The language model (llm.py) only turns them into
a short summary and three actions, in English and French at once, and
may not quote a figure it was not given (llm.numbers_are_grounded). With
no model available — no key, quota spent, provider down — the same
figures are written up by a template, so the report is never missing.

A finished month is written once and kept (migration 006); the current
month is rewritten at most once a day, as its figures move. Free quotas
are counted in requests per day, and a report nobody reopens should not
spend them twice.
"""

import json
from datetime import date, datetime, timedelta

import bilingual
import energy
import insights
import llm
import tariff
from config import get_connection as get_db

MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]
MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
             "août", "septembre", "octobre", "novembre", "décembre"]
CURRENT_MONTH_TTL = timedelta(hours=24)

REPORT_SYSTEM = """You write the monthly electricity report of EnergiBox for a household in \
Cameroon. You receive the month's figures, computed by the app. Write, in English and in \
French:
- "summary": 3 or 4 sentences on what the month cost, how it compares with the previous \
month, which appliances drove it and, for the current month, where it is heading.
- "actions": exactly 3 short, concrete actions (at most 20 words each) the household can \
take next month, based on the figures.

Rules: use only the figures given, exactly as given, and never compute new ones. \
Electricity is billed by monthly volume with no cheaper hours, so never suggest shifting \
usage in time. Plain text, no markdown, no emoji. French: natural, addressing the household \
as "vous". Keep appliance names exactly as given.

Answer with a JSON object: {"en": {"summary": "...", "actions": ["...", "...", "..."]}, \
"fr": {"summary": "...", "actions": ["...", "...", "..."]}}"""


def _bounds(year, month):
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def _previous(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _device_kwh(cursor, home_id, start, end):
    cursor.execute(f"""
        SELECT mp.name, {energy.kwh('r.')}
        FROM readings r
        JOIN monitored_points mp ON r.monitored_point_id = mp.id
        JOIN rooms rm ON mp.room_id = rm.id
        WHERE rm.home_id = %s AND r.timestamp >= %s AND r.timestamp < %s
        GROUP BY mp.id, mp.name
    """, (home_id, start, end))
    return {row[0]: float(row[1] or 0) for row in cursor.fetchall()}


def month_facts(home_id, year, month, now=None):
    """Every figure the report states, computed from readings."""
    now = now or datetime.now()
    start, end = _bounds(year, month)
    prev_start, prev_end = _bounds(*_previous(year, month))
    current = start <= now.date() < end

    conn = get_db()
    try:
        cursor = conn.cursor()
        devices = _device_kwh(cursor, home_id, start, end)
        previous = _device_kwh(cursor, home_id, prev_start, prev_end)
        cursor.execute("""
            SELECT a.type, COUNT(*), GROUP_CONCAT(DISTINCT mp.name)
            FROM alerts a
            JOIN monitored_points mp ON a.monitored_point_id = mp.id
            JOIN rooms rm ON mp.room_id = rm.id
            WHERE rm.home_id = %s AND a.created_at >= %s AND a.created_at < %s
            GROUP BY a.type
        """, (home_id, start, end))
        alerts = [{"type": r[0], "count": int(r[1]), "appliances": (r[2] or "").split(",")[:3]}
                  for r in cursor.fetchall()]
        budget = None
        if _has_budget(cursor):
            cursor.execute("SELECT monthly_budget_fcfa FROM homes WHERE id = %s", (home_id,))
            row = cursor.fetchone()
            budget = row[0] if row else None
    finally:
        conn.close()

    kwh = sum(devices.values())
    prev_kwh = sum(previous.values())
    top = sorted(devices.items(), key=lambda kv: kv[1], reverse=True)[:3]
    facts = {
        "year": year,
        "month": month,
        "is_current_month": current,
        "kwh": round(kwh, 1),
        "cost_fcfa": round(tariff.monthly_cost(kwh)),
        "previous_kwh": round(prev_kwh, 1) if prev_kwh > 0 else None,
        "previous_cost_fcfa": round(tariff.monthly_cost(prev_kwh)) if prev_kwh > 0 else None,
        "change_pct": round((kwh - prev_kwh) / prev_kwh * 100) if prev_kwh > 0 else None,
        "top_appliances": [
            {
                "name": name,
                "kwh": round(value, 1),
                "share_pct": round(value / kwh * 100) if kwh > 0 else 0,
                "previous_kwh": round(previous[name], 1) if previous.get(name) else None,
            }
            for name, value in top
        ],
        "alerts": alerts,
        "budget_fcfa": budget,
        "forecast": None,
    }
    if current and kwh > 0:
        forecast = insights.forecast_month(home_id, kwh, budget, now)
        facts["forecast"] = {k: forecast[k] for k in ("fcfa", "low_fcfa", "high_fcfa", "budget_risk")}
    return facts


_budget_column = None


def _has_budget(cursor):
    global _budget_column
    if _budget_column is None:
        try:
            cursor.execute("SHOW COLUMNS FROM homes LIKE 'monthly_budget_fcfa'")
            _budget_column = cursor.fetchone() is not None
        except Exception:
            _budget_column = False
    return _budget_column


# ── Template, in both languages ─────────────────────────────────────────

def _fr_num(value, digits=0):
    text = f"{value:,.{digits}f}".replace(",", " ")
    return text.replace(".", ",") if digits else text


def _en_num(value, digits=0):
    return f"{value:,.{digits}f}"


def template_report(facts):
    month_en = f"{MONTHS_EN[facts['month'] - 1]} {facts['year']}"
    month_fr = f"{MONTHS_FR[facts['month'] - 1]} {facts['year']}"
    if facts["kwh"] <= 0:
        return {
            "en": {"summary": f"No consumption was recorded in {month_en}.", "actions": []},
            "fr": {"summary": f"Aucune consommation n'a été enregistrée en {month_fr}.", "actions": []},
        }

    en = [f"In {month_en} the home used {_en_num(facts['kwh'], 1)} kWh, "
          f"about {_en_num(facts['cost_fcfa'])} FCFA."]
    fr = [f"En {month_fr}, le foyer a consommé {_fr_num(facts['kwh'], 1)} kWh, "
          f"soit environ {_fr_num(facts['cost_fcfa'])} FCFA."]
    change = facts["change_pct"]
    if change is not None:
        if change >= 0:
            en.append(f"That is {change}% more than the previous month.")
            fr.append(f"C'est {change} % de plus que le mois précédent.")
        else:
            en.append(f"That is {-change}% less than the previous month.")
            fr.append(f"C'est {-change} % de moins que le mois précédent.")
    top = facts["top_appliances"]
    if top:
        en.append(f"{top[0]['name']} accounted for {top[0]['share_pct']}% of it.")
        fr.append(f"{top[0]['name']} en représente {top[0]['share_pct']} %.")
    forecast = facts.get("forecast")
    if forecast and forecast.get("fcfa"):
        en.append(f"At the current pace the month should end around {_en_num(forecast['fcfa'])} FCFA.")
        fr.append(f"À ce rythme, le mois devrait se terminer autour de {_fr_num(forecast['fcfa'])} FCFA.")

    actions_en, actions_fr = [], []
    if top:
        actions_en.append(f"Use {top[0]['name']} a little less: it is where effort pays most.")
        actions_fr.append(f"Utilisez un peu moins {top[0]['name']} : c'est là que l'effort paie le plus.")
    alerted = [a for a in facts["alerts"] if a["appliances"] and a["appliances"][0]]
    if alerted:
        name = alerted[0]["appliances"][0]
        actions_en.append(f"Check {name}, which raised alerts this month.")
        actions_fr.append(f"Vérifiez {name}, qui a déclenché des alertes ce mois-ci.")
    if not facts["budget_fcfa"]:
        actions_en.append("Set a monthly budget so EnergiBox can warn you before you pass it.")
        actions_fr.append("Fixez un budget mensuel pour qu'EnergiBox vous prévienne avant de le dépasser.")
    actions_en.append("Switch appliances off at the wall at night rather than leaving them on standby.")
    actions_fr.append("Éteignez les appareils à la prise la nuit plutôt que de les laisser en veille.")
    return {
        "en": {"summary": " ".join(en), "actions": actions_en[:3]},
        "fr": {"summary": " ".join(fr), "actions": actions_fr[:3]},
    }


# ── Language model ──────────────────────────────────────────────────────

def _grounded_report(reply, grounding):
    """The model's report if it has both languages, the right shape and
    only figures from the facts; None otherwise."""
    if not isinstance(reply, dict):
        return None
    out = {}
    for lang in ("en", "fr"):
        part = reply.get(lang)
        if not isinstance(part, dict):
            return None
        summary, actions = part.get("summary"), part.get("actions")
        if not isinstance(summary, str) or not (40 <= len(summary) <= 1200):
            return None
        if not isinstance(actions, list) or not (1 <= len(actions) <= 4):
            return None
        if not all(isinstance(a, str) and 5 <= len(a) <= 240 for a in actions):
            return None
        texts = [summary, *actions]
        if not all(llm.numbers_are_grounded(t, grounding) for t in texts):
            return None
        out[lang] = {"summary": summary.strip(), "actions": [a.strip() for a in actions[:3]]}
    return out


def write_report(facts):
    """(content, source): the model's text when it can be trusted, else
    the template's."""
    template = template_report(facts)
    if facts["kwh"] > 0 and llm.enabled():
        facts_json = json.dumps(facts, ensure_ascii=False)
        grounding = "\n".join([facts_json, json.dumps(template, ensure_ascii=False),
                               f"{MONTHS_EN[facts['month'] - 1]} {facts['year']}"])
        reply = llm.complete_json(REPORT_SYSTEM, facts_json, max_tokens=2000)
        content = _grounded_report(reply, grounding)
        if content:
            return content, "ai"
    return template, "template"


def monthly_report(home_id, year, month, now=None):
    """The report for one month, from the cache when it is fresh enough."""
    now = now or datetime.now()
    current = (year, month) == (now.year, now.month)

    if bilingual.reports_cached():
        conn = get_db()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT content, source, generated_at FROM monthly_reports
                WHERE home_id = %s AND year = %s AND month = %s
            """, (home_id, year, month))
            row = cursor.fetchone()
        finally:
            conn.close()
        if row:
            age = now - row[2]
            stale = (current and age >= CURRENT_MONTH_TTL) or \
                (row[1] == "template" and llm.enabled() and age >= timedelta(hours=6))
            if not stale:
                return {"facts": month_facts(home_id, year, month, now),
                        "content": json.loads(row[0]), "source": row[1],
                        "generated_at": row[2].isoformat()}

    facts = month_facts(home_id, year, month, now)
    if not bilingual.reports_cached():
        # Without the cache every view would spend quota: template only.
        return {"facts": facts, "content": template_report(facts), "source": "template",
                "generated_at": now.isoformat()}

    content, source = write_report(facts)
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO monthly_reports (home_id, year, month, content, source, generated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE content = VALUES(content), source = VALUES(source),
                                    generated_at = VALUES(generated_at)
        """, (home_id, year, month, json.dumps(content, ensure_ascii=False), source, now))
        conn.commit()
    finally:
        conn.close()
    return {"facts": facts, "content": content, "source": source, "generated_at": now.isoformat()}
