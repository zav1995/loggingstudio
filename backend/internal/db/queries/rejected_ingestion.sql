-- name: CreateRejectedIngestion :one
INSERT INTO rejected_ingestions
  (filename, parser_id, parser_name, media_id, reason, raw_payload)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListRejectedIngestions :many
SELECT * FROM rejected_ingestions
ORDER BY created_at DESC
LIMIT $1;

-- name: GetRejectedIngestion :one
SELECT * FROM rejected_ingestions WHERE id = $1;

-- name: DeleteRejectedIngestion :exec
DELETE FROM rejected_ingestions WHERE id = $1;
