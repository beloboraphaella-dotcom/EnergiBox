# EnergiBox

Household electricity monitoring and control. A hardware box (ESP32) clamps
onto an appliance or socket, publishes a power sample every two seconds over
MQTT, and can switch a relay on command. A FastAPI backend stores the
samples, estimates the bill in FCFA, raises alerts on abnormal consumption,
runs scheduled on/off windows, and suggests shifting usage out of peak
tariff hours. A React dashboard and an Expo mobile app sit on top.

```
ESP32 / simulator ──MQTT──> Mosquitto ──> FastAPI ──> MySQL
                                             │
                                ┌────────────┴────────────┐
                           Web dashboard            Mobile app
                           (React + Vite)        (React Native/Expo)
```

| Path | What it is |
|---|---|
| `backend/` | FastAPI API, MQTT consumer, scheduler, alert engine, AI advisor |
| `frontend/dashboard/` | React 19 + Vite web dashboard |
| `mobile/` | Expo / React Native app |
| `simulator/` | Publishes fake device telemetry, so you can run without hardware |
| `deploy/mosquitto/` | Broker configuration and topic ACLs |

## Running it

### 1. Database

```bash
mysql -u root -p -e "CREATE DATABASE energibox CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p energibox < backend/schema.sql
```

Create a dedicated account rather than using `root`:

```sql
CREATE USER 'energibox'@'localhost' IDENTIFIED BY '<password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON energibox.* TO 'energibox'@'localhost';
```

> `backend/schema.sql` was reconstructed from the queries in the code, not
> dumped from a live database. Table and column names are exact; types and
> indexes are informed guesses. If you already have a working database,
> overwrite the file with `mysqldump --no-data`.

Upgrading an existing install? Run the migrations in `backend/migrations/`
in order.

### 2. Backend

```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env    # then fill it in
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`backend/.env` is required — there are no hardcoded fallbacks, so a missing
setting stops the process at startup with a message naming the variable.
Generate the JWT key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Interactive API docs: <http://localhost:8000/docs>.

### 3. MQTT broker

```bash
sudo cp deploy/mosquitto/mosquitto.conf /etc/mosquitto/conf.d/energibox.conf
sudo cp deploy/mosquitto/aclfile /etc/mosquitto/energibox.acl
sudo mosquitto_passwd -c /etc/mosquitto/energibox.passwd energibox-backend
sudo mosquitto_passwd    /etc/mosquitto/energibox.passwd energibox-device
sudo systemctl restart mosquitto
```

Put the backend's credentials in `backend/.env` as `ENERGIBOX_MQTT_USERNAME`
and `ENERGIBOX_MQTT_PASSWORD`. **Devices need the same treatment** — the
ESP32 firmware lives outside this repository, and it must be updated to
authenticate before you enable `allow_anonymous false`, or every box drops
off at once.

### 4. Frontend and mobile

```bash
cd frontend/dashboard && npm install && npm run dev     # → localhost:5173
cd mobile            && npm install && npx expo start
```

The web app expects the API on `http://localhost:8000` (hardcoded in each
page). The mobile app derives the host from the Expo dev server, falling
back to the IP in `mobile/src/config.js`.

### 5. No hardware? Use the simulator

```bash
python simulator/esp32_sim.py
```

It publishes two devices (a fridge and a water heater) every two seconds.
Pair the MACs it prints via the dashboard's device screen.

## Tests

```bash
for t in backend/tests/test_*.py; do python "$t" || break; done
```

Plain scripts, no pytest. MySQL and MQTT are stubbed, so they run anywhere
and exit non-zero on failure. See `backend/tests/README.md`.

## Configuration

Everything environment-specific is read in `backend/config.py` and nowhere
else. `backend/.env.example` documents every variable. Never commit a real
`.env`.

## Known limitations

These are open, understood, and deliberately not papered over:

- **The tariff is verified up to 216 kWh, not beyond.** Every cost now
  goes through `backend/tariff.py`, which is checked against five real
  ENEO LV-DOMESTIC bills (April 2024 to November 2025) and the fifteen
  months of consumption they print: 50 FCFA/kWh at or below 110 kWh and
  79 above it, applied *by threshold* — the month's total volume picks
  one rate charged on every kWh of it, which `backend/tests/test_tariff.py`
  reproduces to the franc. The 94 and 99 bands (above 400 and 800 kWh)
  are published figures that no bill in hand confirms, and that household
  never exceeded 216 kWh. A bill from a heavier consumer would settle
  them.
- **No tax and no fixed charge are applied**, because none appeared on
  any bill observed — including at 216 kWh, above the 110 kWh exemption
  the regulator documents. That is an observation, not a rule, and a bill
  showing VAT would change it.
- **Two optional migrations change how much the app knows.** Without
  `002_reading_interval.sql` energy is computed from an assumed 2-second
  cadence rather than the interval each reading actually stands for;
  without `003_auth_rate_limit.sql` the auth budget is per worker rather
  than shared. Both degrade to the previous behaviour and `GET /health`
  reports which mode is running, so neither is urgent — but until they are
  applied, a box that drops off the network quietly lowers the bill, and N
  uvicorn workers give N times the login allowance.
- **The runtime baseline is learned in memory.** `runtime.py` tracks
  appliance sessions from the live stream, so restarting the backend drops
  the sessions in progress; the next complete session resumes the
  learning. Nothing wrong is ever written, but a restart-heavy deployment
  learns more slowly.
- **Three screens are English-only, in both apps**: alerts, suggestions
  and the sign-in/onboarding flow. They predate the mockups and were never
  rebuilt; everything drawn from a mockup is translated, and
  `backend/tests/test_i18n.py` keeps the two apps' translation files
  identical.
- **There is no dark theme.** The web app used to carry a light/dark
  toggle that set an attribute nothing read — the mockups' dark variant
  remaps to tokens that are themselves light, so the design system has no
  dark values to switch to. The dead control was removed rather than left
  pretending; a real dark mode needs a dark palette from design.
