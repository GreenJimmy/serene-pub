/**
 * A message's markdown as an ordered list of spoken segments, each either the
 * speaker's own words or an action/narration line, so read-aloud can voice
 * them differently. Pure; playback is `speech.svelte.ts`.
 */

export type SpeechSegmentKind = "speech" | "action"

export interface SpeechSegment {
	kind: SpeechSegmentKind
	text: string
}

/**
 * What counts as an action.
 * - `italics`: `*She smiles.*` and `_She smiles._`; everything else is speech.
 * - `unquoted`: everything outside quotes. A message with no quotes reads as
 *   `italics`, so the speaker's own voice is still heard.
 */
export type ActionStyle = "italics" | "unquoted"

/** Drops what is not read aloud: out-of-character asides, code, images, markup. */
export function cleanForSpeech(md: string): string {
	return (
		md
			.replace(/\(\(.*?\)\)/gs, " ")
			.replace(/[([]\s*OOC\s*:.*?[)\]]/gis, " ")
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/`([^`]*)`/g, "$1")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/<[^>]+>/g, " ")
			.replace(/^\s{0,3}(#{1,6}|>|[-+]\s)\s*/gm, "")
			.replace(/^\s*([-*_]\s*){3,}$/gm, " ")
			// Bold before italics, so `**x**` is not read as an empty italic span.
			.replace(/\*\*(.+?)\*\*/gs, "$1")
			.replace(/__(.+?)__/gs, "$1")
			.replace(/[“”„]/g, '"')
	)
}

function tidy(text: string): string {
	return text
		.replace(/[*_~]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\s+([.,!?;:…])/g, "$1")
		.trim()
}

const speakable = (text: string) => /[\p{L}\p{N}]/u.test(text)

function push(out: SpeechSegment[], kind: SpeechSegmentKind, raw: string) {
	const text = tidy(raw)
	if (!speakable(text)) return
	const prev = out.at(-1)
	if (prev?.kind === kind) prev.text = `${prev.text} ${text}`
	else out.push({ kind, text })
}

// An underscore span must not touch a letter or digit, so `snake_case` is a word.
const ITALIC = /\*([^*\n]+?)\*|(?<![\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])/gu
const QUOTED = /"([^"\n]+)"/g

export function segmentForSpeech(
	md: string,
	actionStyle: ActionStyle = "italics"
): SpeechSegment[] {
	const text = cleanForSpeech(md)
	const quotes = actionStyle === "unquoted" && /"[^"\n]+"/.test(text)
	const pattern = quotes ? QUOTED : ITALIC
	const inside: SpeechSegmentKind = quotes ? "speech" : "action"
	const outside: SpeechSegmentKind = quotes ? "action" : "speech"

	const out: SpeechSegment[] = []
	let last = 0
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0
		push(out, outside, text.slice(last, start))
		push(out, inside, match[1] ?? match[2] ?? "")
		last = start + match[0].length
	}
	push(out, outside, text.slice(last))
	return out
}

/**
 * Long text as sentence-sized chunks. Chrome's speech engine stops partway
 * through a single long utterance, so a long segment is queued as several.
 */
export function chunkForUtterance(text: string, maxLength = 220): string[] {
	if (text.length <= maxLength) return [text]
	const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [
		text
	]
	const chunks: string[] = []
	let current = ""
	const add = (piece: string, sep: string) => {
		if (current && (current + sep + piece).length > maxLength) {
			chunks.push(current.trim())
			current = ""
		}
		current += (current ? sep : "") + piece
	}
	for (const sentence of sentences) {
		if (sentence.length <= maxLength) {
			add(sentence.trim(), " ")
			continue
		}
		// A run-on sentence: split at clause breaks, then at spaces.
		const pieces = sentence
			.trim()
			.split(/(?<=[,;:])\s+/)
			.flatMap((c) => (c.length > maxLength ? c.split(/\s+/) : [c]))
		for (const piece of pieces) add(piece, " ")
	}
	if (current.trim()) chunks.push(current.trim())
	return chunks
}
