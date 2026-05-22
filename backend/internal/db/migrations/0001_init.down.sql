DROP TABLE IF EXISTS ingest_parsers;
DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS tag_groups;
DROP TABLE IF EXISTS media;
-- Extensions are intentionally left in place; safe to drop them by hand
-- if the database is being torn down for good.
