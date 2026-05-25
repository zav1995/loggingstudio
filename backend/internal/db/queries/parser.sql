-- name: CreateParser :one
INSERT INTO ingest_parsers (name, source_format, sample_payload, mapping, filter)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetParser :one
SELECT * FROM ingest_parsers WHERE id = $1;

-- name: GetParserByName :one
SELECT * FROM ingest_parsers WHERE name = $1;

-- name: ListParsers :many
SELECT * FROM ingest_parsers
ORDER BY name ASC;

-- name: UpdateParser :one
UPDATE ingest_parsers SET
  name           = COALESCE(sqlc.narg('name')::text,            name),
  source_format  = COALESCE(sqlc.narg('source_format')::text,   source_format),
  sample_payload = COALESCE(sqlc.narg('sample_payload')::text,  sample_payload),
  mapping        = COALESCE(sqlc.narg('mapping')::jsonb,        mapping),
  filter         = COALESCE(sqlc.narg('filter')::jsonb,         filter),
  updated_at     = now()
WHERE id = $1
RETURNING *;

-- name: DeleteParser :exec
DELETE FROM ingest_parsers WHERE id = $1;
