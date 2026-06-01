package debt

import (
	"regexp"
	"strings"
)

var legacyDescriptionSuffixRe = regexp.MustCompile(`(?i)\s*\[legacy_(?:promoted|merged|archived)[^\]]*\]`)

// SanitizeDocumentDescription quita marcas internas de migración legacy (no deben verse en UI).
func SanitizeDocumentDescription(s string) string {
	return strings.TrimSpace(legacyDescriptionSuffixRe.ReplaceAllString(s, ""))
}
