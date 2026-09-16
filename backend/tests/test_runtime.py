"""Checks the session tracker, and the alert it finally makes possible.

`baselines.avg_runtime_min` was read by check_extended_runtime and
written by nothing, so that alert could never fire. These tests drive
runtime.py through the shapes that matter — a clean run, an appliance
that cycles, a device that vanishes mid-run — and assert the alert now
compares a real session against a learned baseline.
"""
import os, pathlib, sys
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
patch("pymysql.connect", return_value=MagicMock()).start()

import runtime
import alert_engine

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


class FakeDB:
    """A baselines table of one row, or none at all."""
    def __init__(self, baseline_row=(None,)):
        self.baseline_row, self.calls, self._next = baseline_row, [], None
    def cursor(self): return self
    def execute(self, sql, params=()):
        flat = " ".join(sql.split())
        self.calls.append((flat, params))
        if flat.startswith("SELECT avg_runtime_min"):
            self._next = self.baseline_row
    def fetchone(self): return self._next
    def commit(self): pass
    def close(self): pass

def written(db):
    """The value the tracker stored, if it stored one."""
    for sql, params in db.calls:
        if sql.startswith("UPDATE baselines SET avg_runtime_min"):
            return params[0]
    return None

def run(readings, db, start=None):
    """Feed (offset_seconds, watts) pairs to the tracker as one device."""
    runtime._open_sessions.clear()
    base = start or datetime(2026, 9, 16, 8, 0, 0)
    last = 0.0
    with patch.object(runtime, "get_db", return_value=db):
        for offset, watts in readings:
            last = runtime.observe(1, watts, base + timedelta(seconds=offset))
    return last


# ── A session, start to finish ──────────────────────────────────────────
print("\n== une session simple ==")
db = FakeDB()
# Ten minutes above the threshold, then off.
minutes = run([(s, 1500) for s in range(0, 601, 60)] + [(660, 0)], db)
check("la session est fermee par l'arret", minutes == 0.0, minutes)
check("sa duree est enregistree", written(db) == 10.0, written(db))
check("un seul enregistrement par session",
      sum(1 for c in db.calls if c[0].startswith("UPDATE baselines")) == 1)

db = FakeDB()
last = run([(s, 1500) for s in range(0, 301, 60)], db)
check("tant qu'elle tourne, la duree courante est rendue", last == 5.0, last)
check("rien n'est ecrit avant la fin de la session", written(db) is None, written(db))

# ── What must not count as a session ────────────────────────────────────
print("\n== ce qui n'est pas une session ==")
db = FakeDB()
run([(0, 1500), (2, 0)], db)
check("un pic de deux secondes n'est pas une habitude", written(db) is None, written(db))

db = FakeDB()
run([(0, 5), (60, 3), (120, 0)], db)
check("la veille ne demarre pas de session", written(db) is None, written(db))

db = FakeDB()
run([(0, 1500), (60, 1500), (120, 0), (180, 1500), (240, 1500), (300, 0)], db)
check("un appareil qui cycle produit deux sessions, pas une longue",
      sum(1 for c in db.calls if c[0].startswith("UPDATE baselines")) == 2,
      [c[1] for c in db.calls if c[0].startswith("UPDATE baselines")])

# ── A device that goes quiet mid-run ────────────────────────────────────
print("\n== un appareil qui disparait en pleine marche ==")
db = FakeDB()
# Five minutes of running, then silence, then a reading an hour later.
run([(s, 1500) for s in range(0, 301, 60)] + [(3900, 1500)], db)
check("la session est cloturee au dernier releve, pas a l'heure du retour",
      written(db) == 5.0, written(db))

db = FakeDB()
runtime._open_sessions.clear()
base = datetime(2026, 9, 16, 8, 0, 0)
with patch.object(runtime, "get_db", return_value=db):
    for s in range(0, 301, 60):
        runtime.observe(1, 1500, base + timedelta(seconds=s))
    closed = runtime.close_stale(base + timedelta(seconds=1000))
check("le balayage du scheduler ferme la session orpheline", closed == 1, closed)
check("il enregistre sa vraie duree", written(db) == 5.0, written(db))
check("plus rien a fermer ensuite", runtime.close_stale(base + timedelta(seconds=2000)) == 0)

# ── Learning, over several sessions ─────────────────────────────────────
print("\n== la moyenne apprise ==")
db = FakeDB(baseline_row=(20.0,))
run([(s, 1500) for s in range(0, 601, 60)] + [(660, 0)], db)
expected = 20.0 * (1 - runtime.ALPHA) + 10.0 * runtime.ALPHA
check("une nouvelle session deplace la moyenne, sans l'ecraser",
      abs(written(db) - expected) < 1e-9, (written(db), expected))
check("la moyenne reste entre l'ancienne et la nouvelle valeur",
      10.0 < written(db) < 20.0, written(db))

db = FakeDB(baseline_row=None)  # no baseline row at all yet
run([(s, 1500) for s in range(0, 601, 60)] + [(660, 0)], db)
check("sans ligne de reference, rien n'est insere",
      not any(c[0].startswith("INSERT") for c in db.calls),
      [c[0][:40] for c in db.calls])

class BrokenDB(FakeDB):
    def execute(self, sql, params=()): raise RuntimeError("table is gone")

runtime._open_sessions.clear()
with patch.object(runtime, "get_db", return_value=BrokenDB()):
    try:
        base = datetime(2026, 9, 16, 8, 0, 0)
        for s in (0, 600):
            runtime.observe(1, 1500 if s == 0 else 0, base + timedelta(seconds=s))
        survived = True
    except Exception:
        survived = False
check("une erreur de base ne remonte pas au thread MQTT", survived)

# ── The alert that depends on all this ──────────────────────────────────
print("\n== l'alerte fonctionnement prolonge ==")

def fire(current_minutes, baseline):
    db = FakeDB(baseline_row=(baseline,) if baseline is not None else None)
    alerts = []
    with patch.object(alert_engine, "get_db", return_value=db), \
         patch.object(alert_engine, "create_alert",
                      side_effect=lambda *a: alerts.append(a)):
        alert_engine.check_extended_runtime(1, "Water Heater", current_minutes)
    return alerts

check("elle se declenche au-dela du double de la normale", len(fire(45, 20)) == 1)
check("elle se tait en deca", len(fire(30, 20)) == 0)
check("elle se tait sans moyenne apprise", len(fire(45, None)) == 0)
check("elle se tait quand l'appareil est a l'arret", len(fire(0, 20)) == 0)
alerts = fire(45, 20)
check("le message porte les deux durees",
      alerts and "45" in alerts[0][2] and "20" in alerts[0][2],
      alerts[0][2] if alerts else "")

# The count-the-last-150-rows heuristic must be gone: it could not report
# more than five minutes, so no baseline above 2.5 could ever be doubled.
src = pathlib.Path(alert_engine.__file__).read_text()
code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
body = code.split('"""')[0] + "".join(code.split('"""')[2::2])
check("l'ancienne heuristique des 150 lignes a disparu", "LIMIT 150" not in code)
check("plus de cadence de 2 secondes codee en dur dans l'alerte",
      "* 2) / 60" not in code)

# Every reading must reach the tracker, including before a baseline
# exists — otherwise a device never learns anything.
runtime._open_sessions.clear()
seen = []
with patch.object(alert_engine, "get_db", return_value=FakeDB(baseline_row=None)), \
     patch.object(alert_engine.runtime, "observe",
                  side_effect=lambda *a, **k: seen.append(a) or 0.0):
    alert_engine.check_spike(1, 1500, "Water Heater")
check("le suivi voit le releve meme sans ligne de reference", len(seen) == 1, seen)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
