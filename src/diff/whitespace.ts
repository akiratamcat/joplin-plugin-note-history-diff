// F9: differences in trailing whitespace and line endings are not shown.
// Both texts are normalised before they are compared: CRLF and CR become LF,
// and spaces and tabs at the end of each line are removed. Such differences
// are invisible in the diff anyway, so the normalised text is also what is
// displayed.

export function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
}
