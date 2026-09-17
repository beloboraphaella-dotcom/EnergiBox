"""Central configuration for the EnergiBox backend.

Every secret and every environment-specific setting (database credentials,
JWT signing key, MQTT broker, allowed CORS origins) is read from the
environment here and nowhere else. No module should ever hardcode a
credential again.

Values come from the process environment, or from a `.env` file placed
either in `backend/` or at the repository root. Real `.env` files are
git-ignored — `backend/.env.example` documents every variable and is the
file that gets committed.
"""

import os
import threading
from pathlib import Path
from urllib.parse import quote_plus

import pymysql


class ConfigError(RuntimeError):
    """Raised at import time when a required setting is missing, so the
    process fails loudly at startup rather than halfway through a request."""


def _load_dotenv():
    """Minimal .env reader — deliberately dependency-free so the backend
    keeps running without python-dotenv installed. Existing environment
    variables always win, which is what a container or systemd unit
    supplying its own values expects."""
    backend_dir = Path(__file__).resolve().parent
    for candidate in (backend_dir / ".env", backend_dir.parent / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv()


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(
            f"Missing required environment variable {name}. "
            f"Copy backend/.env.example to backend/.env and fill it in."
        )
    return value


def _optional(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value or default


# ── Database ────────────────────────────────────────────────────────────
DB_HOST = _optional("ENERGIBOX_DB_HOST", "localhost")
DB_PORT = int(_optional("ENERGIBOX_DB_PORT", "3306"))
DB_USER = _required("ENERGIBOX_DB_USER")
DB_PASSWORD = _required("ENERGIBOX_DB_PASSWORD")
DB_NAME = _optional("ENERGIBOX_DB_NAME", "energibox")

# SQLAlchemy URL — the password is percent-encoded because it routinely
# contains characters (@, :, /) that would otherwise break URL parsing.
DATABASE_URL = (
    f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


# ── Connection pool ─────────────────────────────────────────────────────
# Every query in this backend used to open its own TCP connection and
# authenticate, then throw it away: a dashboard load cost a dozen
# handshakes, and the MQTT ingest path paid six per reading per device.
# A pool keeps a handful of authenticated connections warm and hands them
# out instead.
#
# Nothing at the call sites changes. A pooled connection is returned to
# the pool by the same `conn.close()` the code already calls, so the
# hundred-odd existing call sites keep working unmodified — and a call
# site that forgets to close still behaves exactly as it did before,
# because the connection is returned when it is garbage collected.
#
# `maxconnections=0` is deliberate: the pool caches up to POOL_SIZE idle
# connections but never refuses a new one under load. Exhaustion would
# turn a busy moment into a deadlock, which is worse than the cost it
# would save.
POOL_SIZE = int(_optional("ENERGIBOX_DB_POOL_SIZE", "8"))

_CONNECT_KWARGS = {
    "host": DB_HOST,
    "port": DB_PORT,
    "user": DB_USER,
    "password": DB_PASSWORD,
    "database": DB_NAME,
}

try:
    from dbutils.pooled_db import PooledDB
except ImportError:  # not installed yet — keep working, unpooled
    PooledDB = None

_pool = None
_pool_lock = threading.Lock()


def _get_pool():
    """Build the pool on first use, never at import.

    Building it lazily keeps an unreachable server out of this module's
    import, so the failure surfaces where it can be reported rather than
    as an import error. (main.py's create_all does connect at startup, so
    the process still needs MySQL up to boot today.)
    """
    global _pool
    if _pool is not None or PooledDB is None or POOL_SIZE <= 0:
        return _pool
    with _pool_lock:
        if _pool is None:
            _pool = PooledDB(
                creator=pymysql,
                # Nothing is opened until something asks, so an unreachable
                # server does not turn into an import-time exception.
                mincached=0,
                maxcached=POOL_SIZE,
                maxconnections=0,
                # Check the connection when it leaves the pool: MySQL closes
                # idle connections after wait_timeout, and a borrower must
                # never be handed a dead one.
                ping=1,
                # Roll back on return. Without this a SELECT-only borrower
                # hands back an open InnoDB transaction, and the next
                # borrower reads that stale snapshot.
                reset=True,
                **_CONNECT_KWARGS,
            )
    return _pool


def pooling_enabled():
    """Whether connections are being reused. Reported by /health."""
    return _get_pool() is not None


def get_connection():
    """A database connection, from the pool when one is available.

    Returns a pooled connection whose close() hands it back, or a plain
    pymysql connection when DBUtils is not installed or pooling is turned
    off with ENERGIBOX_DB_POOL_SIZE=0. Both satisfy the same contract, so
    no caller needs to know which it got.
    """
    pool = _get_pool()
    if pool is None:
        return pymysql.connect(**_CONNECT_KWARGS)
    return pool.connection()


# ── Authentication ──────────────────────────────────────────────────────
SECRET_KEY = _required("ENERGIBOX_SECRET_KEY")
ALGORITHM = _optional("ENERGIBOX_JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    _optional("ENERGIBOX_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24))
)

# ── MQTT ────────────────────────────────────────────────────────────────
MQTT_BROKER = _optional("ENERGIBOX_MQTT_BROKER", "localhost")
MQTT_PORT = int(_optional("ENERGIBOX_MQTT_PORT", "1883"))
# Empty when the broker still runs anonymously. Set both to start
# authenticating against Mosquitto without touching any code.
MQTT_USERNAME = os.environ.get("ENERGIBOX_MQTT_USERNAME", "").strip()
MQTT_PASSWORD = os.environ.get("ENERGIBOX_MQTT_PASSWORD", "").strip()

# ── HTTP ────────────────────────────────────────────────────────────────
CORS_ORIGINS = [
    origin.strip()
    for origin in _optional("ENERGIBOX_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
