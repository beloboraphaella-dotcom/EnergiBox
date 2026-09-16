"""How readings become energy, in one place.

Every kWh and every FCFA in this app used to come from the same
assumption: `SUM(watts) / 1000 / 1800`, meaning "there are exactly 1800
readings in an hour, because the firmware publishes every 2 seconds".
That is wrong in the one case that matters. When a box drops off the
network for an hour, its readings for that hour are missing, so the sum
is short and the household is told it consumed less than it did. The
error is invisible — the figure is plausible, just quietly low — and it
scales with how unreliable the connection is.

What replaces it is an integral. Each reading is credited with the time
that actually elapsed since the previous one from the same device:

    energy = SUM(watts x interval_seconds)

`interval_s` is written at ingest, where the previous timestamp is known
(mqtt_client.py), so the arithmetic costs nothing at query time and
needs no window function.

Two bounds keep it honest:

  MAX_INTERVAL_S  A gap is not a measurement. If a device goes quiet for
                  three hours, we do not know whether it was drawing
                  power the whole time or was unplugged, so only the
                  first MAX_INTERVAL_S of that gap are credited at the
                  last known power. This under-counts a genuinely-running
                  appliance that lost its connection, which is the
                  direction to err in: the alternative invents
                  consumption that may never have happened.
  DEFAULT_INTERVAL_S
                  Rows written before the column existed have no
                  interval. They keep the old assumption rather than
                  being dropped, so history stays continuous across the
                  migration.

Everything degrades gracefully. `probe()` looks for the column once at
startup; if migration 002 has not been applied the module emits exactly
the old expression, so an un-migrated deployment keeps working and keeps
its old numbers instead of failing.
"""

# The cadence the ESP32 firmware publishes at. Only used for rows that
# predate migration 002.
DEFAULT_INTERVAL_S = 2

# Beyond this, silence is treated as unknown rather than as consumption.
# Two minutes is generous next to a 2-second cadence: it absorbs a WiFi
# reconnection without absorbing an outage.
MAX_INTERVAL_S = 120

# Set by probe(). None means "never probed", which is treated as absent:
# the fallback expression is always the safe one to emit.
_has_interval_column = None


def probe(conn):
    """Look for `readings.interval_s` once, at startup.

    Returns True when the column is there. Takes the connection rather
    than opening one so the caller controls the lifecycle, and so this is
    trivial to drive from a test.
    """
    global _has_interval_column
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW COLUMNS FROM readings LIKE 'interval_s'")
        _has_interval_column = cursor.fetchone() is not None
    except Exception as exc:  # a missing table, no permission, no server
        print(f"energy: could not probe readings.interval_s ({exc!r}) — "
              f"falling back to the fixed {DEFAULT_INTERVAL_S}s cadence")
        _has_interval_column = False

    if not _has_interval_column:
        print("energy: readings.interval_s is absent — apply "
              "backend/migrations/002_reading_interval.sql to bill on "
              "measured intervals instead of an assumed sample rate")
    return _has_interval_column


def uses_intervals():
    """Whether energy is being integrated or assumed. Reported by /health."""
    return bool(_has_interval_column)


def watt_seconds(prefix=""):
    """SQL summing watt-seconds over whatever rows the query selects.

    `prefix` is the table alias when the query joins, e.g. "r." — the
    caller's own SQL decides which rows are in scope; this only decides
    how each of them is weighted.
    """
    watts = f"{prefix}watts"
    if not _has_interval_column:
        # No per-row interval: every reading stands for the nominal
        # cadence, which is exactly the old behaviour.
        return f"SUM({watts}) * {DEFAULT_INTERVAL_S}"
    interval = f"{prefix}interval_s"
    return (f"SUM({watts} * LEAST(COALESCE({interval}, {DEFAULT_INTERVAL_S}), "
            f"{MAX_INTERVAL_S}))")


def kwh(prefix=""):
    """SQL for energy in kWh. 3 600 000 watt-seconds make one kWh."""
    return f"({watt_seconds(prefix)}) / 3600000"


def avg_watts(seconds, prefix=""):
    """SQL for mean power over a bucket `seconds` long.

    Energy divided by the bucket's own duration, so an hour with half its
    readings missing reports the power actually measured rather than
    twice it.
    """
    return f"({watt_seconds(prefix)}) / {seconds}"


def hours(prefix=""):
    """SQL for time-in-scope in hours, for "this ran N hours today".

    Counting rows and dividing by an assumed cadence answered a different
    question — how many readings arrived — which reads the same until a
    device goes quiet.
    """
    if not _has_interval_column:
        return f"COUNT(*) * {DEFAULT_INTERVAL_S} / 3600"
    interval = f"{prefix}interval_s"
    return (f"SUM(LEAST(COALESCE({interval}, {DEFAULT_INTERVAL_S}), "
            f"{MAX_INTERVAL_S})) / 3600")


def clamp_interval(seconds):
    """The interval to store for a reading, given the gap before it.

    None (no previous reading known) becomes the nominal cadence: the
    very first reading of a device cannot be credited a gap it has no
    evidence for. A negative gap — a clock that stepped backwards — is
    treated the same way.
    """
    if seconds is None or seconds <= 0:
        return DEFAULT_INTERVAL_S
    return min(int(seconds), MAX_INTERVAL_S)
