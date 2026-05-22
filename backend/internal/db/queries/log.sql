-- name: CreateLog :one
INSERT INTO logs (media_id, offset_in, offset_out, tags, source)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetLog :one
SELECT * FROM logs WHERE id = $1;

-- name: ListLogs :many
SELECT logs.* FROM logs
WHERE logs.media_id = $1
  AND (sqlc.narg('tag_id')::text IS NULL OR logs.tags ? sqlc.narg('tag_id')::text)
  AND (sqlc.narg('source')::text IS NULL OR logs.source = sqlc.narg('source')::text)
  AND (
    sqlc.narg('session_id')::uuid IS NULL OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = sqlc.narg('session_id')::uuid
        AND s.media_id = logs.media_id
        AND logs.created_at >= s.started_at
        AND (s.ended_at IS NULL OR logs.created_at <= s.ended_at)
    )
  )
ORDER BY logs.offset_in ASC;

-- name: UpdateLog :one
UPDATE logs SET
  offset_in  = COALESCE(sqlc.narg('offset_in')::bigint,  offset_in),
  offset_out = COALESCE(sqlc.narg('offset_out')::bigint, offset_out),
  tags       = COALESCE(sqlc.narg('tags')::jsonb,        tags),
  updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteLog :exec
DELETE FROM logs WHERE id = $1;
