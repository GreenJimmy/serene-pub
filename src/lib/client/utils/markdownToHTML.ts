import { marked } from "marked"
import DOMPurify from "dompurify"

// Fix italic formatting to handle trailing spaces before closing asterisk.
// Replaces "*text *" with "*text*". The opening "*" must not follow a word
// character and the closing "*" must not precede one, so the closing "*" of
// one span is never paired with the opening "*" of the next (which would
// strip the space between them, e.g. "*a*, and *b*" -> "*a*, and*b*").
export function fixItalicSpaces(text: string): string {
	return text.replace(
		/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\s+\*(?![\w*])/gm,
		"$1*$2*"
	)
}

export function markQuotedText(md: string): string {
	return md
		.replaceAll("“", '"')
		.replaceAll("”", '"')
		.replaceAll(/"([^"\n]+)"/g, '[[QT]]"$1"[[/QT]]')
}

export function replaceQuotedTextMarkers(html: string): string {
	return html
		.replaceAll("[[QT]]", '<span class="quoted-text">')
		.replaceAll("[[/QT]]", "</span>")
}

export function renderMarkdownWithQuotedText(md: string): string {
	// Fix italic formatting with trailing spaces before processing
	const fixedMd = fixItalicSpaces(md)
	const markedMd = markQuotedText(fixedMd)
	let html = marked.parse(markedMd) as string
	// Sanitize BEFORE injecting our own trusted quoted-text markup — html at
	// this point may contain LLM-generated or character-card-sourced content
	// (susceptible to prompt injection / malicious cards), and marked does
	// not escape/sanitize raw HTML by default.
	html = DOMPurify.sanitize(html)
	html = replaceQuotedTextMarkers(html)
	return html
}
