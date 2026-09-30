-- French text for suggestions and alerts, and a cache for monthly reports.
--
-- Suggestions and alerts used to be stored as one English sentence, so
-- the French app showed them in English. They are now written in both
-- languages when they are created, and the API returns the one the app
-- asks for (Accept-Language). Monthly reports are written by the language
-- model (llm.py) once per month and home — free quotas are small — and
-- kept here.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/006_ai_bilingual_reports.sql
--
-- Optional, like 002–005: without it suggestions and alerts stay in
-- English only, and reports are rebuilt from the template on each request
-- without calling the language model.

ALTER TABLE ai_suggestions
    ADD COLUMN suggestion_text_fr TEXT NULL,
    ADD COLUMN ai_written TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 when a language model phrased it, 0 for the template';

ALTER TABLE alerts
    ADD COLUMN message_fr TEXT NULL;

CREATE TABLE IF NOT EXISTS monthly_reports (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    home_id      INT         NOT NULL,
    year         SMALLINT    NOT NULL,
    month        TINYINT     NOT NULL,
    -- {"en": {"summary": ..., "actions": [...]}, "fr": {...}}
    content      TEXT        NOT NULL,
    source       VARCHAR(20) NOT NULL,   -- 'ai' | 'template'
    generated_at DATETIME    NOT NULL,
    UNIQUE KEY uq_monthly_reports (home_id, year, month),
    CONSTRAINT fk_monthly_reports_home FOREIGN KEY (home_id) REFERENCES homes (id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
