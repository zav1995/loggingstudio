-- name: CreateTag :one
INSERT INTO tags (group_id, name, hotkey, display_order)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetTag :one
SELECT * FROM tags WHERE id = $1;

-- name: ListTags :many
SELECT * FROM tags
ORDER BY display_order ASC, name ASC;

-- name: ListTagsByGroup :many
SELECT * FROM tags
WHERE group_id = $1
ORDER BY display_order ASC, name ASC;

-- name: GetTagByName :one
SELECT * FROM tags
WHERE name = $1
ORDER BY display_order ASC
LIMIT 1;

-- name: UpdateTag :one
UPDATE tags SET
  group_id      = COALESCE(sqlc.narg('group_id')::uuid,    group_id),
  name          = COALESCE(sqlc.narg('name')::text,        name),
  hotkey        = CASE WHEN sqlc.narg('hotkey_set')::boolean
                       THEN sqlc.narg('hotkey')::text
                       ELSE hotkey END,
  display_order = COALESCE(sqlc.narg('display_order')::int, display_order)
WHERE id = $1
RETURNING *;

-- name: DeleteTag :exec
DELETE FROM tags WHERE id = $1;
