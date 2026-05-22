-- name: CreateTagGroup :one
INSERT INTO tag_groups (name, color, display_order)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetTagGroup :one
SELECT * FROM tag_groups WHERE id = $1;

-- name: ListTagGroups :many
SELECT * FROM tag_groups
ORDER BY display_order ASC, name ASC;

-- name: UpdateTagGroup :one
UPDATE tag_groups SET
  name          = COALESCE(sqlc.narg('name')::text,     name),
  color         = COALESCE(sqlc.narg('color')::text,    color),
  display_order = COALESCE(sqlc.narg('display_order')::int, display_order)
WHERE id = $1
RETURNING *;

-- name: DeleteTagGroup :exec
DELETE FROM tag_groups WHERE id = $1;
