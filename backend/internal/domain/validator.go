// Package domain holds the entities defined in PRD §2 and their validators.
//
// All time offsets are int64 milliseconds from media start; SMPTE timecode is
// a display format that lives at the system boundaries (interpreter input, UI
// display) and never inside the domain.
package domain

import (
	"regexp"

	"github.com/go-playground/validator/v10"
)

// timecodeRE matches SMPTE HH:MM:SS:FF in 24-hour broadcast format.
// The FF (frame) component is not bounded here because the upper bound
// depends on the media's frame rate — that check happens in the
// interpreter where frame_rate is available.
var timecodeRE = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d:[0-5]\d:\d{2}$`)

// V is the shared validator instance, pre-loaded with the project's custom
// validations. It is safe for concurrent use.
var V = newValidator()

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	_ = v.RegisterValidation("timecode", func(fl validator.FieldLevel) bool {
		return timecodeRE.MatchString(fl.Field().String())
	})
	return v
}
