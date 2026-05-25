CREATE TABLE rejected_ingestions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    filename    text        NOT NULL,
    parser_id   uuid        REFERENCES ingest_parsers(id) ON DELETE SET NULL,
    parser_name text        NOT NULL,
    media_id    text        REFERENCES media(id) ON DELETE SET NULL,
    reason      text        NOT NULL,
    raw_payload text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rejected_ingestions_created_at
    ON rejected_ingestions (created_at DESC);
