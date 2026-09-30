"""Suggestions, alerts and reports in the reader's language.

The apps send `Accept-Language: fr` or `en`; `language_of` turns that into
one of the two, and the endpoints return the matching column. Migration
006 adds the French columns and the report cache; `probe()` looks for
them once at startup, and without them everything stays English-only, as
before.
"""

_has_columns = False
_has_reports = False


def probe(conn):
    global _has_columns, _has_reports
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW COLUMNS FROM ai_suggestions LIKE 'suggestion_text_fr'")
        suggestions = cursor.fetchone() is not None
        cursor.execute("SHOW COLUMNS FROM alerts LIKE 'message_fr'")
        alerts = cursor.fetchone() is not None
        _has_columns = suggestions and alerts
        cursor.execute("SHOW TABLES LIKE 'monthly_reports'")
        _has_reports = cursor.fetchone() is not None
    except Exception as exc:
        print(f"bilingual: could not probe ({exc!r}) — English only")
        _has_columns = _has_reports = False
    if not _has_columns:
        print("bilingual: French columns absent — apply "
              "backend/migrations/006_ai_bilingual_reports.sql so suggestions "
              "and alerts are stored in French too")
    return _has_columns


def enabled():
    return _has_columns


def reports_cached():
    return _has_reports


def language_of(accept_language):
    """'fr' or 'en' from an Accept-Language header; English by default."""
    first = (accept_language or "").split(",")[0].strip().lower()
    return "fr" if first.startswith("fr") else "en"


def pick(language, english, french):
    """The French text when asked for and present, else the English."""
    return french if language == "fr" and french else english
