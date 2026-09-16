"""Checks the tariff module against the real ENEO bills it was built from.

Fifteen month/amount pairs read off five LV-DOMESTIC bills and their
billing-history boxes (April 2024 to November 2025). Every one of them
has to come back to the franc, because they are the only evidence the
app has that its costs match what the household is actually charged.

If a future rate change breaks these, that is the point: the figures are
dated, and the test says which month it stopped agreeing with.
"""
import os, pathlib, re, sys
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
patch("pymysql.connect", return_value=MagicMock()).start()

import tariff

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


# ── The bills ───────────────────────────────────────────────────────────
print("\n== reproduction des factures reelles ==")
check("quinze mois releves", len(tariff.OBSERVED_BILLS) == 15,
      len(tariff.OBSERVED_BILLS))
for kwh, fcfa in tariff.OBSERVED_BILLS:
    computed = tariff.monthly_cost(kwh)
    check(f"{kwh} kWh = {fcfa} FCFA", abs(computed - fcfa) < 0.5, computed)

# The reason `block` is not the default. Had ENEO billed by block, the
# September 2025 bill would have read 9 213 FCFA instead of 12 403.
print("\n== le mode bloc est exclu par les factures ==")
check("157 kWh en bloc ne donne pas le montant facture",
      tariff.monthly_cost(157, mode="block") != 12403,
      tariff.monthly_cost(157, mode="block"))
check("aucune facture ne s'explique par le mode bloc",
      not any(abs(tariff.monthly_cost(k, mode="block") - f) < 0.5
              for k, f in tariff.OBSERVED_BILLS if k > 110))
check("sous 110 kWh les deux modes coincident",
      all(tariff.monthly_cost(k, mode="block") == tariff.monthly_cost(k)
          for k, _ in tariff.OBSERVED_BILLS if k <= 110))

# ── Threshold semantics ─────────────────────────────────────────────────
print("\n== semantique du seuil ==")
check("le seuil de 110 kWh est inclusif", tariff.rate_for_month(110) == 50)
check("111 kWh basculent tout le mois a 79", tariff.rate_for_month(111) == 79)
check("un kWh de plus a 110 coute un mois entier",
      tariff.monthly_cost(111) - tariff.monthly_cost(110) == 111 * 79 - 110 * 50)
check("le cout du franchissement est expose",
      tariff.band_crossing_cost(105) == tariff.monthly_cost(111) - tariff.monthly_cost(110),
      tariff.band_crossing_cost(105))
check("aucun franchissement au-dela de la derniere tranche",
      tariff.band_crossing_cost(2000) is None)

# ── Slices of a month ───────────────────────────────────────────────────
print("\n== parts d'un mois ==")
# A week, a day or one appliance must be priced at the month's rate. This
# is the trap the migration had to avoid: 6 kWh priced on their own fall
# in the 50 band even inside a month billed at 79.
check("une part est facturee au tarif du mois",
      tariff.cost_of_share(6, 180) == 6 * 79, tariff.cost_of_share(6, 180))
check("une part n'est jamais facturee a son propre tarif",
      tariff.cost_of_share(6, 180) != tariff.monthly_cost(6))
check("les parts d'un mois se somment a la facture",
      abs(sum(tariff.cost_of_share(s, 180) for s in (60, 60, 60))
          - tariff.monthly_cost(180)) < 1e-9)
check("un mois sous 110 kWh facture ses parts a 50",
      tariff.cost_of_share(10, 90) == 10 * 50)
check("part negative traitee comme zero", tariff.cost_of_share(-5, 180) == 0)

# ── What the bills say about tax and fixed charges ──────────────────────
print("\n== taxes et charges fixes ==")
check("aucune TVA constatee sur les factures",
      tariff.VAT_OBSERVED_ON_LV_DOMESTIC is False)
check("le taux de TVA imprime est conserve", tariff.VAT_RATE == 0.1925)
check("aucune charge fixe", tariff.FIXED_CHARGE_FCFA == 0)
check("aucune tarification horaire", tariff.TIME_OF_USE is False)
check("les factures sont revendiquees comme source",
      tariff.SOURCE["verified_against_bills"] is True
      and tariff.SOURCE["bills_observed"] == 5
      and tariff.SOURCE["bands_verified_up_to_kwh"] == 216, tariff.SOURCE)

# ── No rate escapes the module ──────────────────────────────────────────
print("\n== aucun tarif code en dur ailleurs ==")
_backend = pathlib.Path(__file__).resolve().parent.parent
for name in ("main.py", "ai_advisor.py"):
    src = _backend.joinpath(name).read_text()
    # Only lines that actually produce FCFA count: a "* 100" elsewhere is
    # a percentage, and a "/ 1800" is the sampling constant.
    lines = [l for l in src.splitlines()
             if "fcfa" in l.lower() and not l.strip().startswith("#")]
    rates = {m for line in lines for m in re.findall(r"\*\s*(\d+)", line)}
    check(f"{name} ne multiplie plus par un tarif", not rates, sorted(rates))

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
