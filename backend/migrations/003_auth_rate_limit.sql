-- Share the auth rate limit between processes.
--
-- rate_limit.py counted attempts in a Python dict, so the budget was per
-- uvicorn worker: running four workers gave an attacker four times the
-- allowance, and a restart wiped the counters. Moving the counters into
-- the database the workers already share makes one budget for the whole
-- deployment, and one that survives a restart.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/003_auth_rate_limit.sql
--
-- Optional, like 002: rate_limit.probe() looks for this table at startup
-- and falls back to the in-process counters while it is absent, so
-- skipping this changes nothing except whether the limit is shared.

CREATE TABLE IF NOT EXISTS auth_attempts (
    -- "login:ip:1.2.3.4" or "login:email:a@b.co". 190 characters keeps the
    -- primary key inside the 767-byte index limit on utf8mb4.
    bucket_key    VARCHAR(190) NOT NULL,
    -- Start of the fixed window this count belongs to. A row whose window
    -- has expired is reused rather than deleted.
    window_start  DATETIME     NOT NULL,
    attempts      INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key),
    KEY idx_auth_attempts_window (window_start)
) ENGINE=InnoDB;

-- Rows are cleared on a successful login and swept by the scheduler, so
-- this table stays small. To see who is currently being throttled:
--   SELECT bucket_key, attempts, window_start FROM auth_attempts
--   ORDER BY attempts DESC LIMIT 20;
