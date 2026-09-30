-- A monthly budget per home, and the phones to notify of new alerts.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/005_budget_and_push.sql
--
-- Optional, like 002–004: main.py and push.py look for the column and the
-- table at startup. Without the column the apps show no budget and
-- setting one answers 409; without the table phones are not notified.

ALTER TABLE homes
    ADD COLUMN monthly_budget_fcfa INT NULL
        COMMENT 'Spending target for a calendar month; NULL = none set';

CREATE TABLE IF NOT EXISTS push_tokens (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    token      VARCHAR(255) NOT NULL,   -- ExponentPushToken[...]
    platform   VARCHAR(20)  NOT NULL,   -- 'ios' | 'android'
    language   VARCHAR(5)   NOT NULL DEFAULT 'en',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push_tokens_token (token),
    KEY idx_push_tokens_user (user_id),
    CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
