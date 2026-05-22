-- name: CreateSession :one
INSERT INTO sessions (media_id, name, notes)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions WHERE id = $1;

-- name: ListSessionsByMedia :many
SELECT * FROM sessions
WHERE media_id = $1
ORDER BY started_at DESC;

-- name: UpdateSession :one
UPDATE sessions SET
  name     = COALESCE(sqlc.narg('name')::text,             name),
  notes    = COALESCE(sqlc.narg('notes')::text,            notes),
  ended_at = COALESCE(sqlc.narg('ended_at')::timestamptz, ended_at)
WHERE id = $1
RETURNING *;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = $1;
