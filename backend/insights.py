"""Forecast and anomaly detection, computed here — no API, no quota.

Forecast. The month-end projection used to be linear: kWh so far ÷ days
elapsed × 30. That over-reads a heavy weekend at the start of the month
and knows nothing about the household's week. `forecast_from_daily`
instead learns a weekday profile from the last eight weeks (a home that
runs the washing machine on Saturdays has heavier Saturdays), takes the
recent level from the last two weeks, and projects the remaining days of
the month day by day. The spread of past days around that model gives
an 80 % range, and from it the probability of ending over the budget.
With under a week of history it falls back to the linear projection and
gives no range, rather than inventing one.

Anomalies. Once a day, each device's consumption for the previous day is
compared with its own last four weeks using a robust z-score (median and
median absolute deviation, which one odd day cannot drag the way a mean
and standard deviation can). A day far above the usual, and by a margin
worth money, raises an `anomaly_high` alert; a device that normally draws
steadily but almost stopped — a fridge that failed — raises
`anomaly_low`. The existing alerts watch single readings; this watches
whole days, which is where a slow drift shows.
"""

import calendar
import math
from datetime import date, datetime, timedelta
from statistics import mean, median, stdev

import energy
import tariff
from config import get_connection as get_db

HISTORY_DAYS = 56
LEVEL_DAYS = 14
MIN_FORECAST_DAYS = 7
Z_80 = 1.2816

ANOMALY_HISTORY_DAYS = 28
MIN_ANOMALY_HISTORY = 14
ANOMALY_Z = 3.5
# Not worth an alert below these, however unusual.
MIN_EXTRA_KWH = 0.5
MIN_STEADY_KWH = 0.3


# ── Forecast ────────────────────────────────────────────────────────────

def _weekday_factors(history):
    overall = mean(history.values())
    if overall <= 0:
        return [1.0] * 7
    factors = []
    for weekday in range(7):
        values = [v for d, v in history.items() if d.weekday() == weekday]
        if len(values) >= 2:
            factors.append(min(max(mean(values) / overall, 0.5), 2.0))
        else:
            factors.append(1.0)
    return factors


def kwh_for_budget(budget_fcfa):
    """The most kWh a month can use and still cost at most `budget_fcfa`.
    Monthly cost only grows with volume, so a bisection finds it."""
    low, high = 0.0, 1.0
    while tariff.monthly_cost(high) <= budget_fcfa and high < 1e6:
        high *= 2
    for _ in range(60):
        middle = (low + high) / 2
        if tariff.monthly_cost(middle) <= budget_fcfa:
            low = middle
        else:
            high = middle
    return low


def _normal_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def forecast_from_daily(history, month_to_date_kwh, now, budget_fcfa=None):
    """Project the month's kWh and cost.

    `history` maps each complete past day to its kWh (days with no
    readings left out); `month_to_date_kwh` includes today so far."""
    today = now.date()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    history = {d: v for d, v in history.items() if d < today}
    result = {"method": "linear", "kwh": None, "fcfa": None,
              "low_fcfa": None, "high_fcfa": None, "budget_risk": None}

    if len(history) < MIN_FORECAST_DAYS:
        start = datetime(today.year, today.month, 1)
        elapsed_days = max((now - start).total_seconds() / 86400, 1.0)
        kwh = month_to_date_kwh / elapsed_days * days_in_month
        result.update(kwh=round(kwh, 1), fcfa=round(tariff.monthly_cost(kwh)))
        if budget_fcfa:
            result["budget_risk"] = 1.0 if result["fcfa"] > budget_fcfa else 0.0
        return result

    factors = _weekday_factors(history)
    ordered = sorted(history)
    recent = ordered[-LEVEL_DAYS:]
    level = mean(history[d] / factors[d.weekday()] for d in recent)
    residuals = [history[d] / factors[d.weekday()] - level for d in ordered[-28:]]
    spread = stdev(residuals) if len(residuals) >= 2 else 0.0

    fraction_left_today = 1 - (now.hour * 3600 + now.minute * 60 + now.second) / 86400
    remaining = level * factors[today.weekday()] * fraction_left_today
    days_left = fraction_left_today
    for offset in range(1, days_in_month - today.day + 1):
        day = today + timedelta(days=offset)
        remaining += level * factors[day.weekday()]
        days_left += 1

    kwh = month_to_date_kwh + remaining
    sigma = spread * math.sqrt(days_left)
    low = max(month_to_date_kwh, kwh - Z_80 * sigma)
    high = kwh + Z_80 * sigma
    result.update(
        method="weekday_profile",
        kwh=round(kwh, 1),
        fcfa=round(tariff.monthly_cost(kwh)),
        low_fcfa=round(tariff.monthly_cost(low)),
        high_fcfa=round(tariff.monthly_cost(high)),
    )
    if budget_fcfa:
        limit = kwh_for_budget(budget_fcfa)
        if sigma > 0:
            result["budget_risk"] = round(1 - _normal_cdf((limit - kwh) / sigma), 2)
        else:
            result["budget_risk"] = 1.0 if kwh > limit else 0.0
    return result


def daily_kwh(home_id=None, point_id=None, days=HISTORY_DAYS, until=None):
    """{date: kWh} for a home or a device over the last `days` days."""
    since = (until or date.today()) - timedelta(days=days)
    conn = get_db()
    try:
        cursor = conn.cursor()
        if point_id is not None:
            cursor.execute(f"""
                SELECT DATE(timestamp), {energy.kwh()}
                FROM readings
                WHERE monitored_point_id = %s AND timestamp >= %s
                GROUP BY DATE(timestamp)
            """, (point_id, since))
        else:
            cursor.execute(f"""
                SELECT DATE(r.timestamp), {energy.kwh('r.')}
                FROM readings r
                JOIN monitored_points mp ON r.monitored_point_id = mp.id
                JOIN rooms rm ON mp.room_id = rm.id
                WHERE rm.home_id = %s AND r.timestamp >= %s
                GROUP BY DATE(r.timestamp)
            """, (home_id, since))
        return {row[0]: float(row[1] or 0) for row in cursor.fetchall()}
    finally:
        conn.close()


def forecast_month(home_id, month_to_date_kwh, budget_fcfa=None, now=None):
    now = now or datetime.now()
    return forecast_from_daily(daily_kwh(home_id=home_id), month_to_date_kwh, now, budget_fcfa)


# ── Anomalies ───────────────────────────────────────────────────────────

def detect_anomaly(history, value):
    """'high', 'low' or None for one day's kWh against past days."""
    if len(history) < MIN_ANOMALY_HISTORY:
        return None
    usual = median(history)
    mad = median(abs(v - usual) for v in history)
    # A device that draws the same every day has a MAD near zero, which
    # would make any wobble look extreme.
    mad = max(mad, 0.05 * usual, 0.02)
    z = 0.6745 * (value - usual) / mad
    if z >= ANOMALY_Z and value - usual >= max(MIN_EXTRA_KWH, 0.5 * usual):
        return "high"
    if z <= -ANOMALY_Z and usual >= MIN_STEADY_KWH and value <= 0.5 * usual:
        return "low"
    return None


def _fr(value):
    return f"{value:.1f}".replace(".", ",")


def anomaly_messages(kind, name, value, usual):
    if kind == "high":
        ratio = value / usual if usual > 0 else 0
        en = (f"{name} used {value:.1f} kWh yesterday, against a usual {usual:.1f} kWh"
              + (f" — about {ratio:.1f} times as much" if ratio >= 1.5 else "")
              + ". Check that it was not left on, or that it is not faulty.")
        fr = (f"{name} a consommé {_fr(value)} kWh hier, contre {_fr(usual)} kWh d'habitude"
              + (f", soit environ {_fr(ratio)} fois plus" if ratio >= 1.5 else "")
              + ". Vérifiez qu'il n'est pas resté allumé ou qu'il ne fonctionne pas mal.")
    else:
        en = (f"{name} used only {value:.1f} kWh yesterday, against a usual {usual:.1f} kWh. "
              f"If it should run all the time, like a fridge or a freezer, check that it still works.")
        fr = (f"{name} n'a consommé que {_fr(value)} kWh hier, contre {_fr(usual)} kWh d'habitude. "
              f"S'il doit fonctionner en permanence, comme un réfrigérateur ou un congélateur, "
              f"vérifiez qu'il marche toujours.")
    return en, fr


def run_anomaly_check(day=None):
    """Compare every device's consumption on `day` (yesterday by default)
    with its own last four weeks, and raise an alert for each outlier."""
    from alert_engine import create_alert

    day = day or (date.today() - timedelta(days=1))
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM monitored_points")
        points = cursor.fetchall()
    finally:
        conn.close()

    raised = 0
    for point_id, name in points:
        series = daily_kwh(point_id=point_id, days=ANOMALY_HISTORY_DAYS + 1, until=day + timedelta(days=1))
        if day not in series:
            continue  # no readings: the device was offline, not anomalous
        history = [v for d, v in series.items() if d < day]
        kind = detect_anomaly(history, series[day])
        if not kind:
            continue
        en, fr = anomaly_messages(kind, name, series[day], median(history))
        if create_alert(point_id, f"anomaly_{kind}", en, message_fr=fr, dedupe="day"):
            raised += 1
    print(f"insights: {raised} anomaly alert(s) for {day}")
    return raised
