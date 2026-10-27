import { json, type RequestEvent } from "@sveltejs/kit"
import { authenticateRequest } from "$lib/server/auth/authenticateRequest"
import { listOpenVoxVoices, openVoxConfig } from "$lib/server/readAloud/openvox"

/**
 * OpenVox's voices for read aloud. `{ voices: [] }` when OpenVox is not
 * configured or does not answer, so the browser keeps its own voices.
 */
export async function GET(event: RequestEvent) {
	const user = await authenticateRequest(event)
	if (!user) return json({ error: "Unauthorized" }, { status: 401 })
	if (!openVoxConfig()) return json({ voices: [] })
	try {
		const voices = await listOpenVoxVoices(AbortSignal.timeout(5000))
		return json({ voices }, { headers: { "Cache-Control": "no-store" } })
	} catch (error) {
		console.warn("Read aloud: OpenVox voices unavailable:", error)
		return json({ voices: [] })
	}
}
