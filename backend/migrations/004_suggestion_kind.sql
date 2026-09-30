-- Tell the advisor's suggestions apart by what they are about.
--
-- The advisor raises three kinds of suggestion: standby waste on one
-- device, one device dominating the month, and which tariff band the
-- month will land in. The last two are pinned to the home's biggest
-- consumer, and a device could only hold one pending suggestion, so
-- whichever was saved last replaced the other — usually the band
-- suggestion replacing the dominant-device one, or both replacing that
-- device's own standby tip. Keying pending suggestions by (device, kind)
-- keeps all three.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/004_suggestion_kind.sql
--
-- Optional, like 002 and 003: ai_advisor.probe() looks for the column at
-- startup. Without it the advisor keeps one pending suggestion per device,
-- choosing the one worth the most rather than whichever came last.

ALTER TABLE ai_suggestions
    ADD COLUMN kind VARCHAR(20) NULL
        COMMENT '''standby'' | ''dominant'' | ''band'' | ''band_warning''; NULL before migration 004',
    ADD KEY idx_suggestions_point_kind_status (monitored_point_id, kind, status);

-- Existing rows keep kind NULL. A pending untyped row is claimed by the
-- next suggestion saved for that device whose kind it does not hold yet
-- (see ai_advisor.save_suggestion), so it is replaced, not duplicated.
