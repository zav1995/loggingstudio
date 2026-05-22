package handlers

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// parseUUID converts a stringy UUID into pgtype.UUID. Empty input is treated
// as an explicit error so callers don't accidentally accept empty path params.
func parseUUID(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, err
	}
	return u, nil
}

// isUniqueViolation reports whether err is a Postgres unique-constraint
// violation (SQLSTATE 23505), used to translate DB-level conflicts into
// HTTP 409s.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// isForeignKeyViolation reports whether err is a Postgres FK violation
// (SQLSTATE 23503), used to translate DB-level FK failures into 422s.
func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// jsonError writes a JSON error response with a normalized shape.
func jsonError(c *gin.Context, status int, message, detail string) {
	body := gin.H{"error": message}
	if detail != "" {
		body["detail"] = detail
	}
	c.JSON(status, body)
}
