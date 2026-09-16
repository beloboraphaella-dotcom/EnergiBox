"""A small fixed-window rate limiter for the unauthenticated auth endpoints.

Deliberately in-process and dependency-free. That means the limit is per
worker: running uvicorn with N workers multiplies the effective allowance
by N, and the counters reset when the process restarts. It raises the cost
of an online password-guessing run by orders of magnitude, which is the
point; it is not a substitute for a shared limiter (Redis, or a rate limit
at the reverse proxy) once this runs behind more than one process.
"""

import threading
import time
from collections import defaultdict, deque


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


# 10 failed logins per 5 minutes, counted per client address and, separately,
# per targeted email — so one address cannot spray many accounts, and one
# account cannot be attacked from many addresses.
login_limiter = RateLimiter(max_attempts=10, window_seconds=300)
# Registration is heavier (it writes a row and runs bcrypt), so it is tighter.
register_limiter = RateLimiter(max_attempts=5, window_seconds=900)
