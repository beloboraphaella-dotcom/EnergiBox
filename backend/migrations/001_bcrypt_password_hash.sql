-- Widen users.password_hash for bcrypt.
--
-- The previous unsalted SHA-256 digests were exactly 64 hex characters, so
-- the column may well have been sized for that. A bcrypt hash is 60
-- characters, which fits in VARCHAR(64), but the margin is uncomfortable
-- and a CHAR(64) column would pad on write. Widen it before deploying.
--
-- Run once, against the energibox database:
--   mysql -u <user> -p energibox < backend/migrations/001_bcrypt_password_hash.sql

ALTER TABLE users MODIFY password_hash VARCHAR(255) NOT NULL;

-- No data migration is needed. Existing SHA-256 hashes keep working:
-- auth.verify_password detects them and login_user re-hashes each account
-- with bcrypt the next time its owner signs in successfully.
--
-- To check migration progress afterwards:
--   SELECT SUM(password_hash LIKE '$2%') AS bcrypt,
--          SUM(password_hash NOT LIKE '$2%') AS legacy
--   FROM users;
