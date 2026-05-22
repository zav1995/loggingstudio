-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Media: id is the externally-supplied ScorePlay asset id (string).
CREATE TABLE media (
    id            text PRIMARY KEY,
    hls_url       text        NOT NULL,
    started_at_tc text        NOT NULL,
    frame_rate    integer     NOT NULL DEFAULT 25
                              CHECK (frame_rate BETWEEN 1 AND 120),
    label         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tag_groups (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text        NOT NULL,
    color         text        NOT NULL,
    display_order integer     NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      uuid        NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    hotkey        text        UNIQUE,
    display_order integer     NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tags_group_id ON tags(group_id);

CREATE TABLE sessions (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id   text        NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    name       text        NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at   timestamptz,
    notes      text
);
CREATE INDEX idx_sessions_media_id ON sessions(media_id);

-- Log: offset_in / offset_out are milliseconds from media start.
CREATE TABLE logs (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id   text        NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    offset_in  bigint      NOT NULL CHECK (offset_in >= 0),
    offset_out bigint      CHECK (offset_out IS NULL OR offset_out >= offset_in),
    tags       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    source     text        NOT NULL DEFAULT 'manual',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_media_id ON logs(media_id);
CREATE INDEX idx_logs_media_offset ON logs(media_id, offset_in);

CREATE TABLE ingest_parsers (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text        NOT NULL UNIQUE,
    source_format  text        NOT NULL CHECK (source_format IN ('xml', 'json')),
    sample_payload text        NOT NULL,
    mapping        jsonb       NOT NULL,
    filter         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
