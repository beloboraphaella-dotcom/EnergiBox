"""Checks how readings become kWh, in both schema states.

The whole point of energy.py is that it behaves in two ways on purpose:
with migration 002 applied it integrates over measured intervals, and
without it it reproduces the old fixed-cadence arithmetic exactly. Both
have to be asserted, because a deployment can sit in either state and the
un-migrated one must not change what it reports.
"""
import os, pathlib, sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
patch("pymysql.connect", return_value=MagicMock()).start()

import energy

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


class FakeConn:
    """Answers SHOW COLUMNS the way a migrated or un-migrated server would."""
    def __init__(self, has_column=True, raises=False):
        self.has_column, self.raises, self.sql = has_column, raises, None
    def cursor(self): return self
    def execute(self, sql, params=()):
        if self.raises:
            raise RuntimeError("server has gone away")
        self.sql = sql
    def fetchone(self): return ("interval_s",) if self.has_column else None


# ── Probing ─────────────────────────────────────────────────────────────
print("\n== detection de la colonne ==")
conn = FakeConn(has_column=True)
check("la colonne presente est detectee", energy.probe(conn) is True)
check("la sonde interroge bien readings.interval_s",
      "SHOW COLUMNS FROM readings LIKE 'interval_s'" in (conn.sql or ""), conn.sql)
check("l'etat est expose", energy.uses_intervals() is True)

check("la colonne absente est detectee", energy.probe(FakeConn(has_column=False)) is False)
check("une base injoignable ne leve pas", energy.probe(FakeConn(raises=True)) is False)
check("l'etat retombe a faux", energy.uses_intervals() is False)

# ── Un-migrated: the old arithmetic, unchanged ──────────────────────────
print("\n== sans la migration : l'ancien calcul, a l'identique ==")
energy.probe(FakeConn(has_column=False))
check("l'energie reste SUM(watts) x 2 / 3600000",
      energy.kwh() == "(SUM(watts) * 2) / 3600000", energy.kwh())
check("ce qui vaut bien l'ancien / 1000 / 1800",
      abs((1000 * 2) / 3600000 - 1000 / 1000 / 1800) < 1e-12)
check("la moyenne horaire vaut l'ancien / 1800",
      abs((900 * 2) / 3600 - 900 / 1800) < 1e-12)
check("aucune reference a interval_s", "interval_s" not in energy.kwh())
check("les heures d'usage restent un comptage",
      energy.hours() == "COUNT(*) * 2 / 3600", energy.hours())

# ── Migrated: the integral ──────────────────────────────────────────────
print("\n== avec la migration : l'integrale ==")
energy.probe(FakeConn(has_column=True))
sql = energy.kwh("r.")
check("chaque releve est pondere par son intervalle", "r.interval_s" in sql, sql)
check("les anciennes lignes gardent la cadence nominale",
      f"COALESCE(r.interval_s, {energy.DEFAULT_INTERVAL_S})" in sql, sql)
check("un trou n'est pas compte comme de la consommation",
      f"LEAST(COALESCE(r.interval_s, {energy.DEFAULT_INTERVAL_S}), {energy.MAX_INTERVAL_S})" in sql,
      sql)
check("le diviseur reste 3600000 watt-secondes par kWh", sql.endswith("/ 3600000"), sql)
check("le prefixe de table est applique partout", "SUM(r.watts *" in sql, sql)
check("sans prefixe, aucune table n'est supposee",
      "SUM(watts *" in energy.kwh() and "r." not in energy.kwh(), energy.kwh())
check("les heures d'usage somment les intervalles",
      energy.hours().startswith("SUM(LEAST(COALESCE(interval_s"), energy.hours())
check("la moyenne divise par la duree de la tranche",
      energy.avg_watts(3600).endswith("/ 3600")
      and energy.avg_watts(86400).endswith("/ 86400"))

# ── Writing an interval ─────────────────────────────────────────────────
print("\n== intervalle stocke a l'ingestion ==")
check("un intervalle normal passe tel quel", energy.clamp_interval(2) == 2)
check("un intervalle fractionnaire est tronque", energy.clamp_interval(2.9) == 2)
check("le premier releve d'un appareil prend la cadence nominale",
      energy.clamp_interval(None) == energy.DEFAULT_INTERVAL_S)
check("une horloge qui recule ne cree pas d'energie",
      energy.clamp_interval(-30) == energy.DEFAULT_INTERVAL_S)
check("un intervalle nul est traite pareil", energy.clamp_interval(0) == energy.DEFAULT_INTERVAL_S)
check("une coupure de trois heures est plafonnee",
      energy.clamp_interval(3 * 3600) == energy.MAX_INTERVAL_S)

# ── The ingest path stores it ───────────────────────────────────────────
print("\n== l'ingestion ecrit la colonne ==")
import mqtt_client

class FakeDB:
    def __init__(self): self.calls = []
    def cursor(self): return self
    def execute(self, sql, params=()): self.calls.append((" ".join(sql.split()), params))
    def fetchone(self): return (None,)
    def commit(self): pass
    def close(self): pass

def insert(point_id, has_column, previous=None):
    mqtt_client._last_reading_at.clear()
    if previous is not None:
        mqtt_client._last_reading_at[point_id] = previous
    energy.probe(FakeConn(has_column=has_column))
    db = FakeDB()
    with patch.object(mqtt_client, "get_db", return_value=db):
        mqtt_client.save_reading(point_id, 1200.0)
    return db

from datetime import datetime, timedelta

db = insert(7, True, previous=datetime.now() - timedelta(seconds=6))
insert_sql, params = next(c for c in db.calls if c[0].startswith("INSERT"))
check("la colonne est renseignee", "interval_s" in insert_sql, insert_sql)
check("l'intervalle stocke est celui mesure", params[-1] == 6, params)
check("aucune requete supplementaire quand le precedent est connu",
      len(db.calls) == 1, [c[0][:40] for c in db.calls])

db = insert(7, True, previous=None)
check("sans precedent en memoire, il est lu en base",
      any(c[0].startswith("SELECT MAX(timestamp)") for c in db.calls),
      [c[0][:40] for c in db.calls])
_, params = next(c for c in db.calls if c[0].startswith("INSERT"))
check("un appareil inconnu prend la cadence nominale",
      params[-1] == energy.DEFAULT_INTERVAL_S, params)

db = insert(7, False, previous=datetime.now() - timedelta(seconds=6))
insert_sql, params = next(c for c in db.calls if c[0].startswith("INSERT"))
check("sans la migration, l'insertion reste celle d'avant",
      "interval_s" not in insert_sql and len(params) == 3, (insert_sql, params))

check("le releve suivant part du precedent memorise",
      mqtt_client._last_reading_at.get(7) is not None)

# A database error must not escape into paho's network thread.
class BrokenDB(FakeDB):
    def execute(self, sql, params=()): raise RuntimeError("deadlock")

energy.probe(FakeConn(has_column=True))
with patch.object(mqtt_client, "get_db", return_value=BrokenDB()):
    try:
        mqtt_client.save_reading(7, 1200.0)
        survived = True
    except Exception:
        survived = False
check("une erreur de base ne remonte pas au thread MQTT", survived)

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
