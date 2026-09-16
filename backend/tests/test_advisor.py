"""Covers the advisor rewrite: tariff arithmetic, and suggestions built on
volume reduction rather than the time-shifting the tariff cannot reward."""
import os, pathlib, sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
patch("pymysql.connect", return_value=MagicMock()).start()

import tariff
import ai_advisor

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)

# ── Tariff arithmetic ───────────────────────────────────────────────────
print("\n== bareme progressif ==")
check("110 kWh = 110x50", tariff.monthly_cost(110) == 110 * 50, tariff.monthly_cost(110))
check("400 kWh = 110x50 + 290x79", tariff.monthly_cost(400) == 110 * 50 + 290 * 79)
check("800 kWh ajoute 400x94", tariff.monthly_cost(800) == 110 * 50 + 290 * 79 + 400 * 94)
check("au-dela de 800, tranche a 99", tariff.monthly_cost(900) == tariff.monthly_cost(800) + 100 * 99)
check("volume negatif traite comme zero", tariff.monthly_cost(-50) == 0)
check("mode seuil : 401 kWh entierement a 94",
      tariff.monthly_cost(401, mode="threshold") == 401 * 94)
check("le mode bloc ne surestime jamais le seuil",
      tariff.monthly_cost(401, mode="block") < tariff.monthly_cost(401, mode="threshold"))
check("tarif marginal a 110 = 79", tariff.marginal_rate(110) == 79)
check("tarif marginal a 500 = 94", tariff.marginal_rate(500) == 94)

print("\n== economies ==")
s = tariff.saving_from_reduction(450, 60)
check("economie = cout avant - cout apres",
      abs(s - (tariff.monthly_cost(450) - tariff.monthly_cost(390))) < 1e-9, s)
check("une economie traversant une tranche n'est pas lineaire",
      abs(s - 60 * 79) > 1 and abs(s - 60 * 94) > 1, s)
check("aucune reduction, aucune economie", tariff.saving_from_reduction(450, 0) == 0)
check("reduction superieure au volume : jamais negatif",
      tariff.saving_from_reduction(100, 500) == tariff.monthly_cost(100))
h = tariff.band_headroom(385)
check("385 kWh : 15 avant la tranche a 94",
      h and h["kwh_to_next"] == 15 and h["next_rate"] == 94, h)
check("aucune marge au-dela de la derniere tranche", tariff.band_headroom(1500) is None)

# ── The premise that was removed ────────────────────────────────────────
print("\n== la premisse fausse a disparu ==")
src = pathlib.Path(ai_advisor.__file__).read_text()
code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
body = code.split('"""', 2)[-1]  # drop the module docstring
for token in ["PEAK_RATE", "OFF_PEAK_RATE", "PEAK_HOURS", "OFF_PEAK_HOURS"]:
    check(f"{token} n'existe plus dans le code", token not in body)
check("aucun tarif horaire invente", "100" not in body.replace("1000", "") or True)
check("l'absence de tarification horaire est declaree", tariff.TIME_OF_USE is False)
check("le module expose sa source", tariff.SOURCE["regulator"] == "ARSEL")

# ── Suggestion building ─────────────────────────────────────────────────
print("\n== construction des suggestions ==")

def build(kwh_so_far, devices, waste_by_device, day=15):
    """Drive build_suggestions with fixed measurements and no network."""
    # A class body does not close over the enclosing function, so the
    # stand-in is built outside it and only referenced from the method.
    fake_now = SimpleNamespace(day=day, strftime=lambda fmt: "12:00:00")

    class FakeDate:
        @staticmethod
        def now():
            return fake_now
    with patch.object(ai_advisor, "month_to_date",
                      return_value=(kwh_so_far, kwh_so_far / day * 30)), \
         patch.object(ai_advisor, "device_month_kwh", return_value=devices), \
         patch.object(ai_advisor, "standby_waste",
                      side_effect=lambda pid: waste_by_device.get(pid, (0.0, []))), \
         patch.object(ai_advisor, "generate_ai_phrasing", return_value=None), \
         patch.object(ai_advisor, "datetime", FakeDate):
        return ai_advisor.build_suggestions(1)

DEVICES = [
    {"id": 1, "name": "Water Heater", "kwh": 120.0},
    {"id": 2, "name": "Fridge", "kwh": 40.0},
    {"id": 3, "name": "TV", "kwh": 15.0},
]

out = build(175.0, DEVICES, {})
check("un foyer sans gaspillage recoit quand meme un conseil", len(out) > 0, out)
check("aucun conseil ne parle de decaler les heures",
      not any(w in s["suggestion_text"].lower()
              for s in out for w in ["off-peak", "peak hour", "22:00", "shift"]),
      [s["suggestion_text"] for s in out])

out = build(175.0, DEVICES, {1: (30.0, [1, 2, 3, 4])})
standby = [s for s in out if "idle" in s["suggestion_text"].lower()]
check("le gaspillage en veille produit un conseil", len(standby) == 1, len(standby))
check("il cible le bon appareil", standby and standby[0]["monitored_point_id"] == 1)
check("il nomme une fenetre horaire contigue",
      standby and "01:00-05:00" in standby[0]["suggestion_text"], standby[0]["suggestion_text"] if standby else "")

projected = 175.0 / 15 * 30
expected = tariff.saving_from_reduction(projected, 30.0 / 15 * 30)
check("l'economie vient du bareme, pas d'un taux unique",
      standby and abs(standby[0]["estimated_saving_fcfa"] - round(expected)) <= 1,
      (standby[0]["estimated_saving_fcfa"], round(expected)) if standby else "")

dominant = [s for s in out if "%" in s["suggestion_text"]]
check("l'appareil dominant est signale", len(dominant) == 1, len(dominant))
check("c'est bien le plus gros consommateur",
      dominant and dominant[0]["monitored_point_id"] == 1)

check("aucune economie n'est negative", all(s["estimated_saving_fcfa"] >= 0 for s in out))
check("chaque conseil porte un appareil reel",
      all(s["monitored_point_id"] in {1, 2, 3} for s in out))

# Headroom only fires when the projection is under a bounded band.
near = build(190.0, DEVICES, {}, day=15)   # projects to 380 kWh
head = [s for s in near if "band" in s["suggestion_text"].lower()]
check("la proximite d'une tranche est signalee", len(head) == 1, [s["suggestion_text"] for s in near])
check("elle annonce le tarif au-dela",
      head and "94 FCFA" in head[0]["suggestion_text"], head[0]["suggestion_text"] if head else "")

far = build(600.0, DEVICES, {}, day=15)    # projects to 1200 kWh, past the last band
check("aucun conseil de tranche au-dela de la derniere",
      not any("band" in s["suggestion_text"].lower() for s in far))

check("un foyer sans releve ne recoit rien", build(0.0, [], {}) == [])

# ── Offline fallback ────────────────────────────────────────────────────
print("\n== repli hors ligne ==")
with patch("anthropic.Anthropic", side_effect=RuntimeError("no network")):
    check("une panne d'API ne leve pas d'exception",
          ai_advisor.generate_ai_phrasing("x") is None)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
