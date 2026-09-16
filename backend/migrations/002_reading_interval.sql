-- Record how much time each reading stands for.
--
-- Energy was computed as SUM(watts)/1000/1800, which assumes every hour
-- contains exactly 1800 readings. A box that loses its connection for an
-- hour simply writes no rows for that hour, so the sum comes out short
-- and the household is under-billed by the app without anything looking
-- wrong. Storing the measured gap turns the estimate into an integral:
-- SUM(watts x interval_s) / 3600000 kWh. See backend/energy.py.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/002_reading_interval.sql
--
-- The backend does not require this migration. energy.probe() looks for
-- the column at startup and keeps emitting the old expression while it is
-- absent, so applying it is safe at any time and skipping it changes
-- nothing except the accuracy of every kWh figure.

ALTER TABLE readings
    ADD COLUMN interval_s SMALLINT UNSIGNED NULL
        COMMENT 'Seconds since this device''s previous reading, capped at energy.MAX_INTERVAL_S';

-- Existing rows keep interval_s NULL on purpose rather than being
-- backfilled with a guess. energy.py reads NULL as the nominal 2-second
-- cadence, which is exactly how those rows were already being counted, so
-- history does not shift under the migration — only readings written from
-- now on carry a measured interval.
--
-- To watch the new rows arrive:
--   SELECT COUNT(*) AS measured, MIN(interval_s), MAX(interval_s)
--   FROM readings WHERE interval_s IS NOT NULL;
