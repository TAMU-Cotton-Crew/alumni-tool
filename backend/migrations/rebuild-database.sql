-- =============================================================================
-- BAEN Community: full database rebuild
--
-- Rebuilt from the backend code (backend/index.js) and the ArcGIS sync notebook.
-- Run once in psql, connected to the "alumni" database as dbadmin:
--   \i C:/Users/inthe/untitled/backend/migrations/rebuild-database.sql
--
-- Safe to re-run: tables/indexes use IF NOT EXISTS, functions/triggers are replaced.
-- The gis_reader role and ZIP centroid load are separate steps at the bottom.
-- =============================================================================

BEGIN;

-- ---------- Members ----------
CREATE TABLE IF NOT EXISTS alumni (
    id                  SERIAL PRIMARY KEY,
    classification      TEXT        NOT NULL,              -- 'Student' | 'Alumni' | 'Friend of BAEN'
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    email               TEXT        NOT NULL,              -- stored lower-case by the backend
    password            TEXT        NOT NULL,              -- bcrypt hash
    backup_email        TEXT,                              -- second login email
    email_verified      BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Employment
    company             TEXT,
    job_title           TEXT,
    job_description     TEXT,
    industry_category   TEXT,
    work_city           TEXT,
    work_state          TEXT,
    work_country        TEXT,
    work_zipcode        TEXT,
    linkedin_url        TEXT,
    bio                 TEXT,

    -- Student opportunities
    seeking_internship  BOOLEAN     NOT NULL DEFAULT FALSE,
    seeking_fulltime    BOOLEAN     NOT NULL DEFAULT FALSE,
    seeking_grad_school BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Alumni involvement
    hiring_employees    BOOLEAN     NOT NULL DEFAULT FALSE,
    reconnect_baen      BOOLEAN     NOT NULL DEFAULT FALSE, -- receives portal proposals
    capstone_client     BOOLEAN     NOT NULL DEFAULT FALSE,
    baen_activities     BOOLEAN     NOT NULL DEFAULT FALSE,
    baen_updates        BOOLEAN     NOT NULL DEFAULT FALSE,
    baen_fundraising    BOOLEAN     NOT NULL DEFAULT FALSE,
    visit_department    BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Portal / profile
    interests           TEXT[]      NOT NULL DEFAULT '{}',  -- Areas of Interest
    networking_goals    TEXT[]      NOT NULL DEFAULT '{}',  -- "What are you looking to gain?"
    major               TEXT,                               -- students
    hometown            TEXT,                               -- students, JSON text (see lib/hometown.ts)
    grad_year           TEXT,                               -- students, 4 digits

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS alumni_email_unique
    ON alumni (email);
CREATE UNIQUE INDEX IF NOT EXISTS alumni_backup_email_unique
    ON alumni (backup_email) WHERE backup_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS alumni_interests_idx
    ON alumni USING GIN (interests);
CREATE INDEX IF NOT EXISTS alumni_name_idx
    ON alumni (last_name, first_name);

-- ---------- Degrees ----------
CREATE TABLE IF NOT EXISTS alumni_degrees (
    id              SERIAL PRIMARY KEY,
    alumni_id       INTEGER NOT NULL REFERENCES alumni (id) ON DELETE CASCADE,
    degree_level    TEXT    NOT NULL,
    degree_name     TEXT    NOT NULL,
    year_conferred  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alumni_degrees_alumni_idx ON alumni_degrees (alumni_id);

-- ---------- Email verification / MFA / password reset tokens ----------
CREATE TABLE IF NOT EXISTS auth_tokens (
    id          SERIAL PRIMARY KEY,
    alumni_id   INTEGER     NOT NULL REFERENCES alumni (id) ON DELETE CASCADE,
    token       TEXT        NOT NULL,
    type        TEXT        NOT NULL CHECK (type IN ('email_verify', 'mfa', 'password_reset')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN     NOT NULL DEFAULT FALSE,
    attempts    INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_tokens_token_idx ON auth_tokens (token);
CREATE INDEX IF NOT EXISTS auth_tokens_alumni_type_idx ON auth_tokens (alumni_id, type);

-- ---------- Portal connection requests ----------
CREATE TABLE IF NOT EXISTS connections (
    id               SERIAL PRIMARY KEY,
    alumni_id        INTEGER     NOT NULL REFERENCES alumni (id) ON DELETE CASCADE,  -- sender
    interests        TEXT[]      NOT NULL DEFAULT '{}',
    state            TEXT,
    body             TEXT        NOT NULL,
    recipient_count  INTEGER     NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS connections_sender_idx ON connections (alumni_id, created_at);

CREATE TABLE IF NOT EXISTS connection_recipients (
    id             SERIAL PRIMARY KEY,
    connection_id  INTEGER     NOT NULL REFERENCES connections (id) ON DELETE CASCADE,
    alumni_id      INTEGER     NOT NULL REFERENCES alumni (id) ON DELETE CASCADE,
    status         TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'declined')),
    responded_at   TIMESTAMPTZ,
    UNIQUE (connection_id, alumni_id)
);
CREATE INDEX IF NOT EXISTS connection_recipients_alumni_idx ON connection_recipients (alumni_id);

-- ---------- ArcGIS support ----------
CREATE TABLE IF NOT EXISTS zip_centroids (
    zip  TEXT PRIMARY KEY,           -- 5-digit ZCTA
    lat  DOUBLE PRECISION NOT NULL,
    lon  DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS gis_sync_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at   TIMESTAMPTZ
);
INSERT INTO gis_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Marks the data as changed so the notebook knows to re-sync
CREATE OR REPLACE FUNCTION mark_gis_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE gis_sync_state SET changed_at = NOW() WHERE id = 1;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS alumni_gis_changed ON alumni;
CREATE TRIGGER alumni_gis_changed
    AFTER INSERT OR DELETE OR UPDATE OF
        classification, industry_category, work_zipcode, work_state, work_country,
        interests, networking_goals, major, grad_year, hometown,
        reconnect_baen, email_verified
    ON alumni
    FOR EACH STATEMENT EXECUTE FUNCTION mark_gis_changed();

DROP TRIGGER IF EXISTS alumni_gis_truncated ON alumni;
CREATE TRIGGER alumni_gis_truncated
    AFTER TRUNCATE ON alumni
    FOR EACH STATEMENT EXECUTE FUNCTION mark_gis_changed();

DROP TRIGGER IF EXISTS alumni_degrees_gis_changed ON alumni_degrees;
CREATE TRIGGER alumni_degrees_gis_changed
    AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON alumni_degrees
    FOR EACH STATEMENT EXECUTE FUNCTION mark_gis_changed();

COMMIT;


-- =============================================================================
-- STEP 2: read-only role for the ArcGIS notebook
-- Replace the password, then run this block.
-- =============================================================================
-- CREATE ROLE gis_reader LOGIN PASSWORD 'choose-a-new-password';
-- GRANT CONNECT ON DATABASE alumni TO gis_reader;
-- GRANT USAGE ON SCHEMA public TO gis_reader;
-- GRANT SELECT (id, classification, industry_category, work_zipcode, work_state, work_country,
--               interests, networking_goals, major, grad_year, hometown, reconnect_baen, email_verified)
--   ON alumni TO gis_reader;
-- GRANT SELECT (alumni_id, degree_level, degree_name, year_conferred) ON alumni_degrees TO gis_reader;
-- GRANT SELECT ON zip_centroids TO gis_reader;
-- GRANT SELECT, UPDATE ON gis_sync_state TO gis_reader;


-- =============================================================================
-- STEP 3: load ZIP centroids (Census ZCTA Gazetteer file)
-- Download the national ZCTA Gazetteer file from census.gov (Gazetteer Files ->
-- ZIP Code Tabulation Areas), unzip it, fix the path below, then run in psql:
-- =============================================================================
-- CREATE TEMP TABLE zcta_raw (geoid text, aland text, awater text, aland_sqmi text,
--                             awater_sqmi text, intptlat text, intptlong text);
-- \copy zcta_raw FROM 'C:/Users/inthe/Downloads/2024_Gaz_zcta_national.txt' WITH (FORMAT csv, DELIMITER E'\t', HEADER true)
-- INSERT INTO zip_centroids (zip, lat, lon)
--   SELECT trim(geoid), trim(intptlat)::float8, trim(intptlong)::float8 FROM zcta_raw
--   ON CONFLICT (zip) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon;
-- SELECT COUNT(*) FROM zip_centroids;   -- expect about 33,000
