-- name: GetMedia :one
SELECT * FROM media WHERE id = $1;

-- name: ListMedia :many
SELECT * FROM media ORDER BY created_at DESC;

-- name: CreateMedia :one
INSERT INTO media (id, hls_url, started_at_tc, frame_rate, label)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
