-- EnergiBox database schema
--
-- ⚠️ RECONSTRUCTED, NOT DUMPED. The repository never contained a schema
-- and this file was derived by reading every SQL statement in backend/.
-- Table and column NAMES are taken straight from those queries and are
-- reliable. The TYPES, LENGTHS, INDEXES and FOREIGN KEYS are informed
-- guesses — the code never reveals them.
--
-- If you have a working database, replace this file with the real thing:
--     mysqldump -u <user> -p --no-data --skip-comments --compact energibox \
--         > backend/schema.sql
--
-- Use this file to stand up a fresh environment:
--     CREATE DATABASE energibox CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--     mysql -u <user> -p energibox < backend/schema.sql
--
-- Note: backend/database.py calls Base.metadata.create_all(), but no
-- SQLAlchemy models are defined anywhere, so that call creates nothing.
-- This file is the only description of the schema that exists.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120)    NOT NULL,
    email         VARCHAR(254)    NOT NULL,
    -- 255 chars: bcrypt hashes are 60, the legacy SHA-256 ones were 64.
    -- See migrations/001_bcrypt_password_hash.sql.
    password_hash VARCHAR(255)    NOT NULL,
    role          VARCHAR(20)     NOT NULL DEFAULT 'owner',   -- 'owner' | 'admin'
    is_suspended  TINYINT(1)      NOT NULL DEFAULT 0,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS homes (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT          NOT NULL,
    name       VARCHAR(120) NOT NULL,
    address    VARCHAR(255) NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_homes_user (user_id),
    CONSTRAINT fk_homes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    home_id INT          NOT NULL,
    name    VARCHAR(120) NOT NULL,
    KEY idx_rooms_home (home_id),
    CONSTRAINT fk_rooms_home FOREIGN KEY (home_id) REFERENCES homes (id)
) ENGINE=InnoDB;

-- One physical EnergiBox device, identified by the MAC address used in its
-- MQTT topics (energibox/<mac>/consumption, energibox/<mac>/control).
CREATE TABLE IF NOT EXISTS energiboxes (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    mac_address          VARCHAR(17)            NOT NULL,   -- AA:BB:CC:DD:EE:FF
    protocol             VARCHAR(20)            NOT NULL DEFAULT 'wifi',
    status               ENUM('online','offline') NOT NULL DEFAULT 'offline',
    last_seen            DATETIME               NULL,
    -- Source of truth for is_on once a command has been sent; see
    -- _derive_is_on() in main.py.
    last_commanded_state ENUM('ON','OFF')       NULL DEFAULT NULL,
    UNIQUE KEY uq_energiboxes_mac (mac_address)
) ENGINE=InnoDB;

-- An appliance or socket in a room, paired 1:1 with an EnergiBox.
CREATE TABLE IF NOT EXISTS monitored_points (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    room_id      INT          NOT NULL,
    energibox_id INT          NOT NULL,
    name         VARCHAR(120) NOT NULL,
    type         ENUM('appliance','socket') NOT NULL DEFAULT 'appliance',
    UNIQUE KEY uq_points_energibox (energibox_id),
    KEY idx_points_room (room_id),
    CONSTRAINT fk_points_room FOREIGN KEY (room_id) REFERENCES rooms (id),
    CONSTRAINT fk_points_energibox FOREIGN KEY (energibox_id) REFERENCES energiboxes (id)
) ENGINE=InnoDB;

-- One power sample. The backend assumes one row every 2 seconds per device
-- (see the kWh note at the bottom of this file), so this table grows by
-- ~43k rows per device per day — plan retention accordingly.
CREATE TABLE IF NOT EXISTS readings (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    monitored_point_id  INT      NOT NULL,
    watts               FLOAT    NOT NULL,
    timestamp           DATETIME NOT NULL,
    -- Seconds since this device's previous reading, written at ingest and
    -- capped at energy.MAX_INTERVAL_S. Energy is SUM(watts * interval_s),
    -- so a box that drops off the network no longer silently lowers the
    -- bill. NULL on rows written before migration 002, which energy.py
    -- reads as the nominal 2-second cadence.
    interval_s          SMALLINT UNSIGNED NULL,
    KEY idx_readings_point_time (monitored_point_id, timestamp),
    CONSTRAINT fk_readings_point FOREIGN KEY (monitored_point_id) REFERENCES monitored_points (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS baselines (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    monitored_point_id INT      NOT NULL,
    avg_watts          FLOAT    NOT NULL,
    -- Read by check_extended_runtime() but never written by any code path,
    -- so that alert stays inert until something populates this column.
    avg_runtime_min    FLOAT    NULL,
    computed_at        DATETIME NOT NULL,
    UNIQUE KEY uq_baselines_point (monitored_point_id),
    CONSTRAINT fk_baselines_point FOREIGN KEY (monitored_point_id) REFERENCES monitored_points (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alerts (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    monitored_point_id INT         NOT NULL,
    -- 'spike' | 'extended_runtime' | 'idle_waste'
    type               VARCHAR(40) NOT NULL,
    message            TEXT        NOT NULL,
    read_status        TINYINT(1)  NOT NULL DEFAULT 0,
    created_at         DATETIME    NOT NULL,
    KEY idx_alerts_point_created (monitored_point_id, created_at),
    CONSTRAINT fk_alerts_point FOREIGN KEY (monitored_point_id) REFERENCES monitored_points (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    monitored_point_id INT         NOT NULL,
    on_time            TIME        NOT NULL,
    off_time           TIME        NOT NULL,
    active             TINYINT(1)  NOT NULL DEFAULT 1,
    source             VARCHAR(20) NOT NULL DEFAULT 'manual',  -- 'manual' | 'ai'
    KEY idx_schedules_point (monitored_point_id),
    CONSTRAINT fk_schedules_point FOREIGN KEY (monitored_point_id) REFERENCES monitored_points (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_suggestions (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    monitored_point_id    INT         NOT NULL,
    suggestion_text       TEXT        NOT NULL,
    estimated_saving_fcfa FLOAT       NOT NULL DEFAULT 0,
    -- 'pending' | 'accepted' | 'ignored'
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at            DATETIME    NOT NULL,
    KEY idx_suggestions_point_status (monitored_point_id, status),
    CONSTRAINT fk_suggestions_point FOREIGN KEY (monitored_point_id) REFERENCES monitored_points (id)
) ENGINE=InnoDB;

-- ── Two things worth knowing about this schema ─────────────────────────
--
-- 1. Energy is computed as SUM(watts) / 1000 / 1800 in eight queries. The
--    1800 is samples-per-hour, i.e. it assumes one reading every 2 seconds
--    with no gaps. A device that drops offline is silently under-counted,
--    and changing the sampling rate would invalidate every kWh and FCFA
--    figure in the app. Integrating over real timestamp deltas would be
--    robust; that is a deliberate open item, not an oversight.
--
-- 2. ai_suggestions carries no schedule columns, and no longer needs any.
--    Suggestions used to be time-shifts, and accepting one inserted a
--    schedule at a hardcoded 22:00-05:00 whatever it said. Cameroon's
--    low-voltage tariff has no time-of-day pricing, so the advisor now
--    suggests consuming less instead, and accepting simply records that
--    the advice was taken. See backend/tariff.py.
