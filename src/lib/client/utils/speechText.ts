// Turns a chat message's raw markdown into an ordered list of spoken
// segments, each tagged as either character speech or an action/narration
// line, so the reader can voice them differently. Pure and DOM-free so it
// can be unit tested — the playback side lives in speech.svelte.ts.

export type SpeechSegmentKind = "speech" | "action"

export interface SpeechSegment {
	kind: SpeechSegmentKind
	text: string
}

/**
 * How actions are recognised in a message.
 * - "italics":  `*She smiles.*` / `_She smiles._` are actions, the rest is speech
 *               (the common roleplay convention).
 * - "unquoted": only text inside quotes is speech; everything else is
 *               narration. Suits models that write prose-style narration.
 *               A message with no quotes at all falls back to "italics",
 *               otherwise the character's own voice would never be heard.
 */
export type ActionStyle = "italics" | "unquoted"

/** Removes out-of-character asides and markdown that shouldn't be read aloud. */
export function cleanForSpeech(md: string): string {
	return (
		md
			// Out-of-character asides: (OOC: ...), [OOC: ...], ((...))
			.replace(/\(\(.*?\)\)/gs, " ")
			.replace(/[([]\s*OOC\s*:.*?[)\]]/gis, " ")
			// Code blocks and inline code
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]*)`/g, "$1")
			// Images go entirely, links keep their text
			.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			// Any raw HTML tags
			.replace(/<[^>]+>/g, " ")
			// Headings, blockquote markers, list bullets at line start
			.replace(/^\s{0,3}(#{1,6}|>|[-+]\s)\s*/gm, "")
			// Horizontal rules
			.replace(/^\s*([-*_]\s*){3,}$/gm, " ")
			// Bold markers (keep the words) — done before italics so `**x**`
			// isn't mistaken for an empty italic span.
			.replace(/\*\*(.+?)\*\*/gs, "$1")
			.replace(/__(.+?)__/gs, "$1")
			// Curly quotes → straight, for the quote-based splitter
			.replace(/[“”„]/g, '"')
	)
}

function tidy(text: string): string {
	return (
		text
			// Stray, unpaired emphasis markers
			.replace(/[*_~]+/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	)
}

const hasSpeakableContent = (text: string) => /[\p{L}\p{N}]/u.test(text)

function pushSegment(
	out: SpeechSegment[],
	kind: SpeechSegmentKind,
	raw: string
) {
	const text = tidy(raw)
	if (!hasSpeakableContent(text)) return
	const prev = out[out.length - 1]
	if (prev && prev.kind === kind) {
		prev.text = `${prev.text} ${text}`
	} else {
		out.push({ kind, text })
	}
}

function splitByPattern(
	text: string,
	pattern: RegExp,
	inside: SpeechSegmentKind,
	outside: SpeechSegmentKind
): SpeechSegment[] {
	const out: SpeechSegment[] = []
	let last = 0
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0
		pushSegment(out, outside, text.slice(last, start))
		pushSegment(out, inside, match[1])
		last = start + match[0].length
	}
	pushSegment(out, outside, text.slice(last))
	return out
}

// `*action*` (single asterisk) or `_action_` not glued to a word, so
// snake_case words aren't read as actions.
const ITALIC_PATTERN = /\*([^*\n]+?)\*|(?<![\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])/gu
const QUOTE_PATTERN = /"([^"\n]+)"/g

export function segmentForSpeech(
	md: string,
	actionStyle: ActionStyle = "italics"
): SpeechSegment[] {
	const cleaned = cleanForSpeech(md)

	if (actionStyle === "unquoted" && QUOTE_PATTERN.test(cleaned)) {
		QUOTE_PATTERN.lastIndex = 0
		// Strip italic markers but keep their words — in this mode
		// everything outside quotes is narration anyway.
		return splitByPattern(cleaned, QUOTE_PATTERN, "speech", "action")
	}
	QUOTE_PATTERN.lastIndex = 0

	const out: SpeechSegment[] = []
	let last = 0
	for (const match of cleaned.matchAll(ITALIC_PATTERN)) {
		const start = match.index ?? 0
		pushSegment(out, "speech", cleaned.slice(last, start))
		pushSegment(out, "action", match[1] ?? match[2] ?? "")
		last = start + match[0].length
	}
	pushSegment(out, "speech", cleaned.slice(last))
	return out
}

/**
 * Splits long text into sentence-sized chunks. Chrome's speechSynthesis
 * silently stops partway through a single long utterance (~15s), so long
 * segments are queued as several short ones instead.
 */
export function chunkForUtterance(text: string, maxLength = 220): string[] {
	if (text.length <= maxLength) return [text]
	const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [
		text
	]
	const chunks: string[] = []
	let current = ""
	for (const sentence of sentences) {
		if ((current + sentence).length > maxLength && current) {
			chunks.push(current.trim())
			current = ""
		}
		if (sentence.length > maxLength) {
			// A single run-on sentence: fall back to splitting on commas/spaces.
			const pieces = sentence
				.split(/(?<=[,;:])\s+/)
				.flatMap((p) => (p.length > maxLength ? p.split(/\s+/) : [p]))
			for (const piece of pieces) {
				if ((current + " " + piece).length > maxLength && current) {
					chunks.push(current.trim())
					current = ""
				}
				current += (current ? " " : "") + piece
			}
		} else {
			current += sentence
		}
	}
	if (current.trim()) chunks.push(current.trim())
	return chunks
}
