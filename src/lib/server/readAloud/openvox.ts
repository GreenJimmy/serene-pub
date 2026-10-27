/**
 * Read aloud through an OpenVox server (OpenAI-compatible `/audio/speech`),
 * for voices better than the browser's own. The pub calls it, not the browser,
 * so it works wherever the pub is reachable and OpenVox only has to be
 * reachable from the pub. See docs/read-aloud.md.
 *
 * `OPENVOX_URL` turns it on, e.g. `http://192.168.1.11:8003/v1`.
 * `OPENVOX_MODEL` picks the model, `pocket-tts` by default.
 */

export interface OpenVoxVoice {
	id: string
	name: string
	language?: string
	gender?: string
	age?: string
}

export interface SpeechPart {
	text: string
	voice: string
}

/** The longest message read in one request, in characters. */
export const MAX_SPEECH_CHARS = 20_000
/** The most voice changes read in one request. */
export const MAX_SPEECH_PARTS = 200
/** The pause between two parts, in seconds. */
const GAP_SECONDS = 0.25

export function openVoxConfig(): { url: string; model: string } | null {
	const url = process.env.OPENVOX_URL?.trim().replace(/\/+$/, "")
	if (!url) return null
	return { url, model: process.env.OPENVOX_MODEL?.trim() || "pocket-tts" }
}

export async function listOpenVoxVoices(
	signal?: AbortSignal
): Promise<OpenVoxVoice[]> {
	const config = openVoxConfig()
	if (!config) return []
	const res = await fetch(
		`${config.url}/models/${encodeURIComponent(config.model)}/voices`,
		{ signal }
	)
	if (!res.ok) throw new Error(`OpenVox voices: HTTP ${res.status}`)
	const body = (await res.json()) as { data?: unknown[] }
	return (body.data ?? []).flatMap((v) => {
		const e = v as Record<string, unknown>
		if (typeof e.id !== "string" || !e.id) return []
		const str = (k: string) =>
			typeof e[k] === "string" && e[k] ? (e[k] as string) : undefined
		return [
			{
				id: e.id,
				name: str("name") ?? e.id,
				language: str("language"),
				gender: str("gender"),
				age: str("age")
			}
		]
	})
}

interface Wav {
	/** The `fmt ` chunk's body, which must match across parts to join them. */
	fmt: Uint8Array
	data: Uint8Array
}

/** Splits a RIFF/WAVE file into its format and its samples. */
export function parseWav(bytes: Uint8Array): Wav {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const tag = (at: number) =>
		String.fromCharCode(...bytes.subarray(at, at + 4))
	if (tag(0) !== "RIFF" || tag(8) !== "WAVE")
		throw new Error("Not a WAV file")
	let fmt: Uint8Array | undefined
	let data: Uint8Array | undefined
	for (let at = 12; at + 8 <= bytes.length; ) {
		const id = tag(at)
		// Streamed WAVs can declare a placeholder size; clamp it to the file.
		const size = Math.min(
			view.getUint32(at + 4, true),
			bytes.length - at - 8
		)
		const body = bytes.subarray(at + 8, at + 8 + size)
		if (id === "fmt ") fmt = body
		else if (id === "data") data = body
		at += 8 + size + (size % 2)
	}
	if (!fmt || !data) throw new Error("WAV file has no fmt or data chunk")
	return { fmt, data }
}

/** One WAV of every part in turn, with a short silence between them. */
export function joinWavs(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const wavs = parts.map(parseWav)
	const fmt = wavs[0].fmt
	const same = (a: Uint8Array) =>
		a.length === fmt.length && a.every((b, i) => b === fmt[i])
	if (!wavs.every((w) => same(w.fmt)))
		throw new Error("OpenVox returned parts in different audio formats")
	const fmtView = new DataView(fmt.buffer, fmt.byteOffset, fmt.byteLength)
	const byteRate = fmtView.getUint32(8, true)
	const blockAlign = fmtView.getUint16(12, true)
	const gap = Math.round((byteRate * GAP_SECONDS) / blockAlign) * blockAlign

	const dataLength =
		wavs.reduce((n, w) => n + w.data.length, 0) + gap * (wavs.length - 1)
	const out = new Uint8Array(12 + 8 + fmt.length + 8 + dataLength)
	const view = new DataView(out.buffer)
	const writeTag = (at: number, s: string) =>
		[...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)))
	writeTag(0, "RIFF")
	view.setUint32(4, out.length - 8, true)
	writeTag(8, "WAVE")
	writeTag(12, "fmt ")
	view.setUint32(16, fmt.length, true)
	out.set(fmt, 20)
	let at = 20 + fmt.length
	writeTag(at, "data")
	view.setUint32(at + 4, dataLength, true)
	at += 8
	wavs.forEach((w, i) => {
		if (i) at += gap // Already zeroed: silence for PCM.
		out.set(w.data, at)
		at += w.data.length
	})
	return out
}

/** Reads every part in its voice, in order, as one WAV. */
export async function synthesizeOpenVox(
	parts: SpeechPart[],
	speed: number,
	signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
	const config = openVoxConfig()
	if (!config) throw new Error("OpenVox is not configured")
	const audio: Uint8Array[] = []
	// One at a time: OpenVox generates on one GPU, so parallel calls only queue.
	for (const part of parts) {
		const res = await fetch(`${config.url}/audio/speech`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: config.model,
				input: part.text,
				voice: part.voice,
				speed,
				response_format: "wav"
			}),
			signal
		})
		if (!res.ok) {
			const detail = await res.text().catch(() => "")
			throw new Error(
				`OpenVox speech: HTTP ${res.status} ${detail}`.trim()
			)
		}
		audio.push(new Uint8Array(await res.arrayBuffer()))
	}
	return joinWavs(audio)
}
