import { json, type RequestEvent } from "@sveltejs/kit"
import { authenticateRequest } from "$lib/server/auth/authenticateRequest"
import {
	MAX_SPEECH_CHARS,
	MAX_SPEECH_PARTS,
	openVoxConfig,
	synthesizeOpenVox,
	type SpeechPart
} from "$lib/server/readAloud/openvox"

/**
 * A message read aloud by OpenVox, as one WAV.
 * Body: `{ parts: [{ text, voice }], speed }`.
 */
export async function POST(event: RequestEvent) {
	const user = await authenticateRequest(event)
	if (!user) return json({ error: "Unauthorized" }, { status: 401 })
	if (!openVoxConfig())
		return json({ error: "OpenVox is not configured" }, { status: 503 })

	const body = (await event.request.json().catch(() => null)) as {
		parts?: unknown
		speed?: unknown
	} | null
	const parts = Array.isArray(body?.parts)
		? body.parts.filter(
				(p): p is SpeechPart =>
					typeof p?.text === "string" &&
					p.text.trim() !== "" &&
					typeof p?.voice === "string" &&
					p.voice !== ""
			)
		: []
	const chars = parts.reduce((n, p) => n + p.text.length, 0)
	if (
		!parts.length ||
		parts.length > MAX_SPEECH_PARTS ||
		chars > MAX_SPEECH_CHARS
	)
		return json({ error: "Nothing to read, or too much" }, { status: 400 })
	const speed =
		typeof body?.speed === "number" && Number.isFinite(body.speed)
			? Math.min(2, Math.max(0.5, body.speed))
			: 1

	try {
		const wav = await synthesizeOpenVox(parts, speed, event.request.signal)
		return new Response(wav, {
			headers: {
				"Content-Type": "audio/wav",
				"Cache-Control": "no-store"
			}
		})
	} catch (error) {
		if (event.request.signal.aborted)
			return new Response(null, { status: 499 })
		console.error("Read aloud: OpenVox speech failed:", error)
		return json({ error: "OpenVox could not read this" }, { status: 502 })
	}
}
