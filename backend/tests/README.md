# Backend tests

Plain scripts — no pytest, no fixtures, nothing to install beyond the
backend's own dependencies. MySQL and MQTT are stubbed, so they run
anywhere:

```bash
pip install -r backend/requirements.txt
python backend/tests/test_api.py       # routing, auth guards, request bodies
python backend/tests/test_auth.py      # password hashing and the bcrypt migration
python backend/tests/test_hardening.py # revocation, rate limiting, health, MQTT
python backend/tests/test_advisor.py   # tariff arithmetic and suggestion building
```

Each exits non-zero on the first failure, so they drop straight into CI.

`test_api.py` drives the real FastAPI app through `TestClient` and checks
that credentials only travel in request bodies, that validation errors come
back as a plain string, and that no endpoint is reachable without a token
except `/`, `/health`, `/auth/register` and `/auth/login`.

`test_auth.py` runs the real `auth.py` against a fake MySQL connection and
covers the SHA-256 -> bcrypt migration: a legacy hash still authenticates,
gets upgraded in place exactly once, and is never upgraded on a failed or
suspended login.

`test_advisor.py` covers `tariff.py`'s progressive-band arithmetic — a
saving is cost-before minus cost-after, never a reduction times a rate —
and checks that the advisor builds suggestions from measurable volume.
It also asserts the removed premise stays removed: no PEAK_RATE,
OFF_PEAK_RATE or peak-hour constants, and no suggestion telling a
household to shift usage to cheaper hours, because the published tariff
has none.
