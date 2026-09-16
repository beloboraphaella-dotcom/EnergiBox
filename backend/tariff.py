"""Cameroonian low-voltage tariff, and the cost arithmetic that goes with it.

Published schedule: ARSEL decision 0096/ARSEL/DG/DCEC/SDCT of 28 May 2012,
effective 1 June 2012. The regulator (arsel-cm.org/tarifs-basse-tension)
and the operator (eneocameroon.cm) both still publish these figures, and
both note they may be out of date — a harmonisation was announced for
November 2024. Treat as reference until a real ENEO bill confirms them.

Two facts this schedule settles, and the reason this module exists:

  - Billing is progressive by monthly volume, not a flat rate. The 79
    FCFA the rest of the backend multiplies by is the 111-400 kWh
    residential band applied to everything.
  - There is NO time-of-day pricing for low-voltage customers, so shifting
    *when* a household consumes changes nothing. Only reducing *how much*
    it consumes lowers the bill. That is what the advisor now acts on.

HOW THE BANDS APPLY is the one thing neither source states, and it changes
the maths materially:

  block     each kWh is charged at the rate of the band it falls in, so
            110 kWh cost 110x50 and the 111th costs 79. Crossing a
            boundary only re-prices the kWh beyond it.
  threshold total monthly volume picks one rate applied to every kWh, so
            crossing 400 re-prices the whole month at 94.

`block` is the default: it is the common reading of a "tranche
progressive", and it is the conservative one — it never overstates what a
customer saves by cutting consumption. A real bill will settle it.
"""

SOURCE = {
    "operator": "ENEO",
    "regulator": "ARSEL",
    "decision": "0096/ARSEL/DG/DCEC/SDCT du 28 mai 2012",
    "effective_from": "2012-06-01",
    "regulator_url": "https://arsel-cm.org/tarifs-basse-tension/",
    "verified_on": "2026-09-16",
    "may_be_outdated": True,
}

# (upper bound of the band in kWh/month, FCFA per kWh). The last entry is
# open-ended: `None` means "everything above the previous bound".
BANDS = {
    "residential": [(110, 50), (400, 79), (800, 94), (None, 99)],
    "non_residential": [(110, 84), (400, 92), (None, 99)],
}

VAT_EXEMPT_BELOW_KWH = 110
TIME_OF_USE = False

# What the billing queries in main.py actually multiply by today.
APPLIED_FLAT_RATE_FCFA = 79

DEFAULT_CUSTOMER = "residential"
DEFAULT_MODE = "block"


def bands_as_dicts(customer=DEFAULT_CUSTOMER):
    """The schedule in the shape the API and the settings screen want."""
    out, lower = [], 0
    for upper, rate in BANDS[customer]:
        out.append({
            "from_kwh": lower,
            "to_kwh": upper,
            "fcfa_per_kwh": rate,
        })
        lower = (upper + 1) if upper is not None else lower
    return out


def marginal_rate(kwh, customer=DEFAULT_CUSTOMER):
    """FCFA for one more kWh on top of `kwh` already consumed this month."""
    for upper, rate in BANDS[customer]:
        if upper is None or kwh < upper:
            return rate
    return BANDS[customer][-1][1]


def monthly_cost(kwh, customer=DEFAULT_CUSTOMER, mode=DEFAULT_MODE):
    """Cost in FCFA of `kwh` consumed over one month.

    Never returns a negative figure, and treats a negative input as zero
    so callers can subtract a saving without special-casing it.
    """
    kwh = max(kwh or 0, 0)

    if mode == "threshold":
        return kwh * _threshold_rate(kwh, customer)

    total, lower = 0.0, 0
    for upper, rate in BANDS[customer]:
        if upper is None:
            total += max(kwh - lower, 0) * rate
            break
        span = min(kwh, upper) - lower
        if span <= 0:
            break
        total += span * rate
        lower = upper
    return total


def _threshold_rate(kwh, customer):
    for upper, rate in BANDS[customer]:
        if upper is None or kwh <= upper:
            return rate
    return BANDS[customer][-1][1]


def saving_from_reduction(projected_kwh, reduction_kwh,
                          customer=DEFAULT_CUSTOMER, mode=DEFAULT_MODE):
    """FCFA saved by consuming `reduction_kwh` less over the month.

    This is the only honest way to price a saving under a progressive
    tariff: cost before minus cost after. Multiplying the reduction by a
    single rate is what produced the old advisor's fictional numbers.
    """
    reduction_kwh = max(reduction_kwh or 0, 0)
    before = monthly_cost(projected_kwh, customer, mode)
    after = monthly_cost(max(projected_kwh - reduction_kwh, 0), customer, mode)
    return max(before - after, 0)


def band_headroom(projected_kwh, customer=DEFAULT_CUSTOMER):
    """Where a projected month lands, and how close the next band is.

    Returns None once past the last bounded band — there is nothing left
    to cross. `kwh_to_next` is how much more would tip into the next band,
    and `next_rate` what the kWh beyond it would cost.
    """
    lower = 0
    for upper, rate in BANDS[customer]:
        if upper is None:
            return None
        if projected_kwh <= upper:
            nxt = BANDS[customer][BANDS[customer].index((upper, rate)) + 1]
            return {
                "band_from_kwh": lower,
                "band_to_kwh": upper,
                "band_rate": rate,
                "kwh_to_next": round(upper - projected_kwh, 1),
                "next_rate": nxt[1],
            }
        lower = upper
    return None
