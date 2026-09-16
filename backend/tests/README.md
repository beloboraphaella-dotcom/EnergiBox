# Backend tests

Plain scripts — no pytest, no fixtures, nothing to install beyond the
backend's own dependencies. MySQL and MQTT are stubbed, so they run
anywhere:

```bash
pip install -r backend/requirements.txt
python backend/tests/test_api.py       # routing, auth guards, request bodies
python backend/tests/test_auth.py      # password hashing and the bcrypt migration
python backend/tests/test_hardening.py # revocation, rate limiting, health, MQTT
python backend/tests/test_advisor.py   # suggestion building
python backend/tests/test_tariff.py    # the tariff, against real ENEO bills
python backend/tests/test_energy.py    # kWh from measured intervals, both schema states
python backend/tests/test_pool.py      # connection reuse, and the fallback without it
python backend/tests/test_runtime.py   # appliance sessions and the runtime alert
python backend/tests/test_i18n.py      # the two apps' translation files, against each other
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

`test_tariff.py` replays fifteen month/amount pairs read off five real
ENEO bills and asserts `tariff.py` reproduces each to the franc. It is
what settles that ENEO bills by threshold rather than by block: no bill
above 110 kWh is explicable by block pricing. It also pins down that a
slice of a month — a week, a day, one appliance — is priced at the rate
the month's total volume attracts, never at its own.

`test_energy.py` drives energy.py through both schema states, because a
deployment can sit in either: with migration 002 it asserts each reading
is weighted by its own capped interval, and without it that the expression
is arithmetically identical to the `/1000/1800` it replaced, so an
un-migrated deployment's numbers do not move.

`test_pool.py` asserts what the pool is for — twenty sequential queries
open one connection, not twenty — and the settings that make it safe:
a connection is checked on its way out and rolled back on its way back
in. It also covers running without DBUtils at all.

`test_runtime.py` covers the session tracker that finally writes
`baselines.avg_runtime_min`: a clean run, an appliance that cycles, a
device that goes quiet mid-run, and the alert that compares the two. It
also pins the old heuristic out of the code.

`test_i18n.py` reads both apps' translation files as text and fails on
drift between them, on a key missing from either language, on a
placeholder one language dropped, and on a `t("...")` call whose key does
not exist.

`test_advisor.py` covers the advisor: a saving is cost-before minus
cost-after, never a reduction times a rate, and suggestions are built
from measurable volume.
It also asserts the removed premise stays removed: no PEAK_RATE,
OFF_PEAK_RATE or peak-hour constants, and no suggestion telling a
household to shift usage to cheaper hours, because the published tariff
has none.
