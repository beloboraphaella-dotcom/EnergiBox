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
python backend/tests/test_api.py
python backend/tests/test_auth.py
python backend/tests/test_hardening.py
```

Plain scripts, no pytest. MySQL and MQTT are stubbed, so they run anywhere
and exit non-zero on failure. See `backend/tests/README.md`.

## Configuration

Everything environment-specific is read in `backend/config.py` and nowhere
else. `backend/.env.example` documents every variable. Never commit a real
`.env`.

## Known limitations

These are open, understood, and deliberately not papered over:

- **Energy figures assume a perfect 2-second sample rate.** `SUM(watts)/1000/1800`
  under-counts whenever a device is offline. Integrating over real timestamp
  deltas would fix it.
- **Two tariff models disagree.** The bill uses a flat 79 FCFA/kWh; the
  advisor uses 100 peak / 60 off-peak. The savings shown to a user are not
  consistent with the bill on the same screen. Someone needs to confirm the
  real tariff.
- **A new database connection per query.** No pooling, and the MQTT path
  opens roughly six per reading per device. This will not scale.
- **Rate limiting is per process.** `backend/rate_limit.py` is in-memory, so
  running multiple uvicorn workers multiplies the allowance.
- **`baselines.avg_runtime_min` is never written**, so the extended-runtime
  alert stays inert.
- **The mobile app has no theme or translations**, unlike the web app, and
  `expo-notifications` is installed but unused.
