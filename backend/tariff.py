"""Cameroonian low-voltage tariff, and the cost arithmetic that goes with it.

Published schedule: ARSEL decision 0096/ARSEL/DG/DCEC/SDCT of 28 May 2012.
The regulator (arsel-cm.org/tarifs-basse-tension) and the operator
(eneocameroon.cm) both still publish these figures.

WHAT THE BILLS SETTLE
---------------------
Five real ENEO bills for one LV-DOMESTIC household (Yaounde / MFOUNDI,
agency NSAM), billed between April 2024 and November 2025, plus the
five-month billing-history box each of them carries, settle the question
this module used to carry as an open one:

  * The tariff is applied BY THRESHOLD, not by block. The whole monthly
    volume is priced at the single rate its total attracts. Each bill
    prints one populated "Tranche / Tariff" line whose quantity is the
    entire month:

        157 kWh x 79 = 12 403 FCFA        (billed 17/09/2025)
        182 kWh x 79 = 14 378 FCFA        (billed 16/11/2025)
         83 kWh x 50 =  4 150 FCFA        (MAR-24, history box)

    Under block pricing 157 kWh would have cost 110x50 + 47x79 = 9 213
    FCFA. The bill says 12 403. So `threshold` is the default, and
    `block` is kept only to show what the difference costs.

  * Rate 50 applies at or below 110 kWh, rate 79 above it. Observed at
    83 and 105 kWh (50) and from 130 to 216 kWh (79). The 110 boundary
    itself is not directly witnessed by these bills, only bracketed by
    105 and 130; it is the published one.

  * The 94 and 99 bands (above 400 and 800 kWh) are NOT witnessed. This
    household never exceeded 216 kWh. They remain published-only.

  * No VAT was charged on any of them. Every bill prints "TOTAL Taxes /
    Tax (19.25%)" with nothing against it and a TOTAL TTC equal to the
    pre-tax total, including at 216 kWh. The 110 kWh exemption the
    regulator documents does not explain that, so what these bills show
    is recorded as an observation, not as a rule: LV-DOMESTIC
    consumption here was untaxed up to 216 kWh.

  * No fixed charge and no meter rent. "Location Compteur / Meter Rent"
    is blank on all five, and every total equals quantity x rate to the
    franc, so there is nothing to add on top of the energy.

  * No time-of-day pricing appears anywhere on the bills, confirming the
    published schedule. Shifting *when* a household consumes changes
    nothing; only consuming less lowers the bill. That is what the
    advisor acts on.

One figure is unexplained: the bill of 17/06/2025 prints "866" on the
tax lines while its total stays at the untaxed 12 245 FCFA. The other
four bills print nothing there. It is not reflected in any total, so
nothing here depends on it, but it is recorded rather than smoothed over.

BLOCK VS THRESHOLD, for reference:

  threshold total monthly volume picks one rate applied to every kWh, so
            crossing 110 re-prices the whole month at 79. What ENEO
            does, per the bills above.
  block     each kWh charged at the rate of the band it falls in, so
            110 kWh cost 110x50 and only the 111th costs 79.

The difference is not academic: under `threshold`, a household projected
at 130 kWh saves 4 770 FCFA (46% of its bill) by cutting 20 kWh to land
at 110. Under `block` the same 20 kWh saves 580. The advisor prices
savings with the mode that is real.
"""

SOURCE = {
    "operator": "ENEO",
    "regulator": "ARSEL",
    "decision": "0096/ARSEL/DG/DCEC/SDCT du 28 mai 2012",
    "effective_from": "2012-06-01",
    "regulator_url": "https://arsel-cm.org/tarifs-basse-tension/",
    "verified_on": "2026-09-16",
    # The 50 and 79 bands are confirmed against real bills (see below).
    # The bands above 400 kWh are not, and a harmonisation was announced
    # for November 2024 whose effect on them is unknown here.
    "may_be_outdated": False,
    "verified_against_bills": True,
    "bills_observed": 5,
    # Neutral range: this string is rendered inside both the English and
    # the French settings screen, so it carries no English word.
    "bills_period": "2024-04 \u2013 2025-11",
    "bands_verified_up_to_kwh": 216,
}

# (upper bound of the band in kWh/month, FCFA per kWh). The last entry is
# open-ended: `None` means "everything above the previous bound".
BANDS = {
    "residential": [(110, 50), (400, 79), (800, 94), (None, 99)],
    "non_residential": [(110, 84), (400, 92), (None, 99)],
}

# Volumes read off the five bills and their billing-history boxes, as
# (monthly kWh, FCFA billed). Every entry is a full month of one
# LV-DOMESTIC contract; personal identifiers are deliberately left out.
# test_tariff.py asserts monthly_cost() reproduces each one exactly, so
# this list is the regression test for the whole schedule.
OBSERVED_BILLS = [
    # Printed on a bill's own "Tranche 2 / Tariff 2" line, rate 79.
    (157, 12403),   # billed 17/09/2025
    (155, 12245),   # billed 17/06/2025
    (144, 11376),   # billed 20/05/2025
    (182, 14378),   # billed 16/11/2025
    (177, 13983),   # billed 16/04/2024
    # Read from the billing-history boxes, rate 79.
    (216, 17064),   # NOV-23
    (203, 16037),   # OCT-25
    (173, 13667),   # JAN-25
    (163, 12877),   # JUL-25
    (160, 12640),   # APR-25 and JAN-24
    (150, 11850),   # MAR-25
    (143, 11297),   # DEC-24
    (130, 10270),   # FEB-25
    # Rate 50, below the 110 kWh boundary.
    (105, 5250),    # FEB-24. The printed first digit is smudged; only
                    # 5 250 divides by 105 at a published rate.
    (83, 4150),     # MAR-24
]

# Printed on every bill, applied on none of them.
VAT_RATE = 0.1925
# What the bills show rather than what the schedule says. See the module
# docstring: no tax was charged on LV-DOMESTIC consumption up to 216 kWh.
VAT_OBSERVED_ON_LV_DOMESTIC = False
# The exemption the regulator documents. Kept for reference only: it does
# not explain bills of 216 kWh carrying no tax.
VAT_EXEMPT_BELOW_KWH = 110

# No meter rent, standing charge or rounding appeared on any bill.
FIXED_CHARGE_FCFA = 0

TIME_OF_USE = False

DEFAULT_CUSTOMER = "residential"
DEFAULT_MODE = "threshold"


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


def rate_for_month(month_kwh, customer=DEFAULT_CUSTOMER, mode=DEFAULT_MODE):
    """The FCFA/kWh a month of `month_kwh` is billed at.

    Under `threshold` this is the rate applied to the whole month, which
    is what the bills do, and the only correct way to price a slice of a
    month: a day, a week or one appliance's share. Under `block` there is
    no single rate, so the marginal one is returned as the closest
    equivalent.
    """
    month_kwh = max(month_kwh or 0, 0)
    if mode == "threshold":
        return _threshold_rate(month_kwh, customer)
    return marginal_rate(month_kwh, customer)


def marginal_rate(kwh, customer=DEFAULT_CUSTOMER):
    """FCFA for one more kWh on top of `kwh` already consumed this month.

    Meaningful under `block`. Under `threshold` one more kWh can re-price
    the entire month, so use monthly_cost or saving_from_reduction there
    instead of multiplying by this.
    """
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


def cost_of_share(share_kwh, month_kwh, customer=DEFAULT_CUSTOMER,
                  mode=DEFAULT_MODE):
    """Cost of `share_kwh` billed inside a month totalling `month_kwh`.

    For anything narrower than a whole month — one day, one week, one
    appliance. The rate comes from the month's total, never from the
    slice: a 6 kWh day inside a 180 kWh month is billed at 79, not at the
    50 that 6 kWh would attract on its own. Shares priced this way sum
    back to monthly_cost(month_kwh).
    """
    share_kwh = max(share_kwh or 0, 0)
    return share_kwh * rate_for_month(month_kwh, customer, mode)


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
    single rate is what produced the old advisor's fictional numbers, and
    under `threshold` it also misses the whole point — a reduction that
    drops the month into a lower band re-prices every kWh of it.
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


def band_crossing_cost(projected_kwh, customer=DEFAULT_CUSTOMER,
                       mode=DEFAULT_MODE):
    """What crossing into the next band would add to the month.

    Priced at the boundary: the cost of ending one kWh above it minus the
    cost of ending on it. Under `threshold` that is the whole month
    re-priced, which is why the figure is large and worth a warning.
    Returns None past the last bounded band.
    """
    headroom = band_headroom(projected_kwh, customer)
    if headroom is None:
        return None
    boundary = headroom["band_to_kwh"]
    return max(
        monthly_cost(boundary + 1, customer, mode)
        - monthly_cost(boundary, customer, mode),
        0,
    )


def band_drop(projected_kwh, customer=DEFAULT_CUSTOMER, mode=DEFAULT_MODE):
    """How much to cut to be billed in the band below, and what it saves.

    The lever `threshold` pricing creates: a month ending at 130 kWh is
    billed entirely at 79, so shedding 20 kWh to land at 110 re-prices
    all 110 at 50. Returns None for a month already in the cheapest band.
    """
    projected_kwh = max(projected_kwh or 0, 0)
    lower = 0
    for upper, rate in BANDS[customer]:
        if upper is not None and projected_kwh <= upper:
            return None if lower == 0 else _drop(
                projected_kwh, lower, rate, customer, mode)
        if upper is None:
            return _drop(projected_kwh, lower, rate, customer, mode)
        lower = upper
    return None


def _drop(projected_kwh, target_kwh, current_rate, customer, mode):
    """`band_drop`'s payload for a month sitting above `target_kwh`."""
    return {
        "target_kwh": target_kwh,
        "kwh_to_cut": round(projected_kwh - target_kwh, 1),
        "current_rate": current_rate,
        "target_rate": _threshold_rate(target_kwh, customer),
        "saving_fcfa": round(
            monthly_cost(projected_kwh, customer, mode)
            - monthly_cost(target_kwh, customer, mode)
        ),
    }
