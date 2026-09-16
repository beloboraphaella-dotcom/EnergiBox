"""Checks that connections are reused, and that nothing breaks without it.

The backend opened a TCP connection and authenticated for every single
query — six per reading per device on the MQTT path alone. The pool is
meant to be invisible: the same get_connection(), the same conn.close(),
just without the handshake. These tests assert both halves of that — the
reuse, and the untouched fallback when DBUtils is not installed.
"""
import os, pathlib, sys
from unittest.mock import MagicMock, patch

os.environ.update(ENERGIBOX_DB_USER="t", ENERGIBOX_DB_PASSWORD="t",
                  ENERGIBOX_SECRET_KEY="test-secret")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import config

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(label)


class Counter:
    """Stands in for pymysql.connect and counts real connections."""
    def __init__(self): self.opened = 0
    def __call__(self, **kwargs):
        self.opened += 1
        self.kwargs = kwargs
        return MagicMock(name=f"conn{self.opened}")


def fresh_pool(size=8):
    """Rebuild the pool from scratch so each case starts clean."""
    config._pool = None
    config.POOL_SIZE = size


print("\n== le pool est actif ==")
check("DBUtils est declare comme dependance",
      "DBUtils" in pathlib.Path(config.__file__).parent.joinpath("requirements.txt").read_text())
check("PooledDB est importable", config.PooledDB is not None)

fresh_pool()
counter = Counter()
with patch("pymysql.connect", counter):
    check("le pool n'ouvre rien avant qu'on demande",
          config._get_pool() is not None and counter.opened == 0, counter.opened)
    conn = config.get_connection()
    check("la premiere demande ouvre une connexion", counter.opened == 1, counter.opened)
    conn.close()
    conn2 = config.get_connection()
    check("la seconde reutilise la meme", counter.opened == 1, counter.opened)
    conn2.close()
    for _ in range(20):
        config.get_connection().close()
    check("vingt requetes sequentielles n'ouvrent toujours qu'une connexion",
          counter.opened == 1, counter.opened)

fresh_pool()
counter = Counter()
with patch("pymysql.connect", counter):
    held = [config.get_connection() for _ in range(4)]
    check("quatre connexions simultanees sont bien quatre", counter.opened == 4, counter.opened)
    for c in held:
        c.close()
    config.get_connection().close()
    check("une fois rendues, elles sont reprises", counter.opened == 4, counter.opened)

print("\n== ce que le pool garantit ==")
fresh_pool()
with patch("pymysql.connect", Counter()):
    pool = config._get_pool()
check("une connexion rendue est verifiee avant d'etre repretee",
      getattr(pool, "_ping", None) == 1, getattr(pool, "_ping", None))
check("une transaction ouverte est annulee au retour",
      getattr(pool, "_reset", None) is True, getattr(pool, "_reset", None))
check("le pool ne refuse jamais une connexion sous charge",
      getattr(pool, "_maxconnections", None) == 0, getattr(pool, "_maxconnections", None))
check("la taille du cache suit la configuration",
      getattr(pool, "_maxcached", None) == config.POOL_SIZE)
check("les identifiants viennent d'un seul endroit",
      set(config._CONNECT_KWARGS) == {"host", "port", "user", "password", "database"},
      sorted(config._CONNECT_KWARGS))
check("pooling_enabled dit la verite", config.pooling_enabled() is True)

print("\n== repli sans pool ==")
fresh_pool(size=0)
counter = Counter()
with patch("pymysql.connect", counter):
    check("ENERGIBOX_DB_POOL_SIZE=0 desactive le pool", config.pooling_enabled() is False)
    config.get_connection().close()
    config.get_connection().close()
    check("chaque requete rouvre, comme avant", counter.opened == 2, counter.opened)

fresh_pool()
counter = Counter()
with patch.object(config, "PooledDB", None), patch("pymysql.connect", counter):
    check("DBUtils absent : le backend fonctionne quand meme",
          config.pooling_enabled() is False)
    conn = config.get_connection()
    check("et rend une vraie connexion pymysql", counter.opened == 1, counter.opened)
    conn.close()

# Leave the module in its default state for anything importing it after.
fresh_pool()

print("\n" + ("TOUS LES TESTS PASSENT" if not fails else f"{len(fails)} ECHEC(S): {fails}"))
sys.exit(1 if fails else 0)
