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


def get_connection():
    """Open a new raw pymysql connection using the configured credentials."""
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
    )


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
