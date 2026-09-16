"""Rate limiting for the unauthenticated auth endpoints.

The budget is shared between processes. It used to live in a Python
dict, which meant one budget per uvicorn worker: four workers handed an
attacker four times the allowance, and a restart wiped the counters. The
counters now sit in the `auth_attempts` table that every worker already
has a connection to, so the limit is one limit however the backend is
scaled, and it survives a restart.

The in-process limiter is still here, and still used. It is the fallback
for a deployment that has not applied migration 003, and the safety net
if the database refuses a counter write: an attempt is never let through
unbudgeted because the shared store had a bad moment.

Both are fixed windows. A key gets N attempts per window; the window
starts at the first attempt and the key is cleared outright on a
successful login, so a legitimate user who mistypes a password a few
times never accumulates towards a lockout.
"""

import threading
import time
from collections import defaultdict, deque

from config import get_connection as get_db


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> int:
        """Record an attempt for `key`. Returns 0 when the caller is within
        budget, otherwise the number of seconds to wait before retrying."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= cutoff:
                hits.popleft()

            if len(hits) >= self.max_attempts:
                return max(1, int(hits[0] + self.window_seconds - now))

            hits.append(now)
            return 0

    def reset(self, key: str = None):
        """Clear one key (after a successful login) or all of them (tests)."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)

    def purge_expired(self):
        """Drop keys with no recent activity so the dict cannot grow without
        bound on a long-running process being probed with random addresses."""
        cutoff = time.monotonic() - self.window_seconds
        with self._lock:
            for key in [k for k, hits in self._hits.items()
                        if not hits or hits[-1] <= cutoff]:
                del self._hits[key]


# Set by probe(). None means "never probed", treated as absent: the
# in-process fallback is always the safe assumption.
_table_present = None


def probe(conn):
    """Look for the `auth_attempts` table once, at startup."""
    global _table_present
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES LIKE 'auth_attempts'")
        _table_present = cursor.fetchone() is not None
    except Exception as exc:
        print(f"rate_limit: could not probe auth_attempts ({exc!r}) — "
              f"limiting per process")
        _table_present = False

    if not _table_present:
        print("rate_limit: auth_attempts is absent — apply "
              "backend/migrations/003_auth_rate_limit.sql to share the "
              "auth budget across workers")
    return _table_present


def is_shared():
    """Whether the budget spans processes. Reported by /health."""
    return bool(_table_present)


class SharedRateLimiter:
    """A fixed window counted in the database, falling back to memory.

    The interface is the in-process limiter's, so call sites cannot tell
    which one they are talking to.
    """

    def __init__(self, max_attempts: int, window_seconds: int, name: str):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.name = name
        # Used when the table is absent, and whenever a query fails.
        self.local = RateLimiter(max_attempts, window_seconds)

    def _key(self, key: str) -> str:
        return f"{self.name}:{key}"[:190]

    def check(self, key: str) -> int:
        if not _table_present:
            return self.local.check(key)
        try:
            return self._check_shared(self._key(key))
        except Exception as exc:
            # Never fail open on an infrastructure problem: fall back to
            # the per-process budget rather than letting the attempt past.
            print(f"rate_limit: shared counter unavailable ({exc!r}) — "
                  f"falling back to the in-process limit")
            return self.local.check(key)

    def _check_shared(self, bucket_key: str) -> int:
        conn = get_db()
        try:
            cursor = conn.cursor()
            # One statement does the whole fixed window: start a fresh
            # count when the previous one has expired, otherwise add to
            # it. The assignments run left to right, so `attempts` still
            # sees the old window_start when it decides.
            cursor.execute("""
                INSERT INTO auth_attempts (bucket_key, window_start, attempts)
                VALUES (%s, NOW(), 1)
                ON DUPLICATE KEY UPDATE
                    attempts = IF(window_start <= NOW() - INTERVAL %s SECOND,
                                  1, attempts + 1),
                    window_start = IF(window_start <= NOW() - INTERVAL %s SECOND,
                                      NOW(), window_start)
            """, (bucket_key, self.window_seconds, self.window_seconds))
            cursor.execute("""
                SELECT attempts,
                       TIMESTAMPDIFF(SECOND, NOW(), window_start) + %s
                FROM auth_attempts WHERE bucket_key = %s
            """, (self.window_seconds, bucket_key))
            row = cursor.fetchone()
            conn.commit()
        finally:
            conn.close()

        if not row:
            return 0
        attempts, seconds_left = row[0], row[1]
        if attempts > self.max_attempts:
            return max(1, int(seconds_left or self.window_seconds))
        return 0

    def reset(self, key: str = None):
        """Clear a key after a successful login, or everything in tests."""
        self.local.reset(key)
        if not _table_present:
            return
        try:
            conn = get_db()
            try:
                cursor = conn.cursor()
                if key is None:
                    cursor.execute("DELETE FROM auth_attempts WHERE bucket_key LIKE %s",
                                   (f"{self.name}:%",))
                else:
                    cursor.execute("DELETE FROM auth_attempts WHERE bucket_key = %s",
                                   (self._key(key),))
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            print(f"rate_limit: could not clear {self.name} counter: {exc!r}")

    def purge_expired(self):
        """Drop windows that have expired, so the table cannot grow."""
        self.local.purge_expired()
        if not _table_present:
            return
        try:
            conn = get_db()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    DELETE FROM auth_attempts
                    WHERE bucket_key LIKE %s
                    AND window_start <= NOW() - INTERVAL %s SECOND
                """, (f"{self.name}:%", self.window_seconds))
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            print(f"rate_limit: could not purge {self.name} counters: {exc!r}")


# 10 failed logins per 5 minutes, counted per client address and, separately,
# per targeted email — so one address cannot spray many accounts, and one
# account cannot be attacked from many addresses.
login_limiter = SharedRateLimiter(max_attempts=10, window_seconds=300,
                                  name="login")
# Registration is heavier (it writes a row and runs bcrypt), so it is tighter.
register_limiter = SharedRateLimiter(max_attempts=5, window_seconds=900,
                                     name="register")


def purge_all_expired():
    """Sweep both limiters. Called from the scheduler tick."""
    login_limiter.purge_expired()
    register_limiter.purge_expired()
