// Read-aloud for chat messages, using the browser's built-in speech voices
// (window.speechSynthesis). One message plays at a time app-wide.
//
// Voice choices live in localStorage rather than the database on purpose:
// the set of available voices differs per browser/OS, so a voice picked on
// the Mac may simply not exist on a phone. Per-device storage keeps each
// device's picks valid for that device.

import {
	chunkForUtterance,
	segmentForSpeech,
	type ActionStyle
} from "$lib/client/utils/speechText"

/** What to do with action/narration text (`*she smiles*`). */
export type ActionMode = "narrator" | "same" | "skip"

export interface SpeechPrefs {
	/** Speaker key (see speakerKey) → voiceURI. Missing = auto-pick. */
	voices: Record<string, string>
	/** Voice for actions/narration. Empty = the speaker's voice, pitched down. */
	narratorVoice: string
	actionMode: ActionMode
	actionStyle: ActionStyle
	rate: number
}

const STORAGE_KEY = "serene-pub.speech"

const DEFAULT_PREFS: SpeechPrefs = {
	voices: {},
	narratorVoice: "",
	actionMode: "narrator",
	actionStyle: "italics",
	rate: 1
}

// macOS ships a set of novelty voices (Bells, Zarvox, …). They're still
// selectable by hand, just never auto-assigned to a character.
const NOVELTY_VOICES = new Set(
	[
		"Albert",
		"Bad News",
		"Bahh",
		"Bells",
		"Boing",
		"Bubbles",
		"Cellos",
		"Deranged",
		"Good News",
		"Hysterical",
		"Jester",
		"Junior",
		"Organ",
		"Pipe Organ",
		"Superstar",
		"Trinoids",
		"Whisper",
		"Wobble",
		"Zarvox"
	].map((n) => n.toLowerCase())
)

export function isSpeechSupported(): boolean {
	return typeof window !== "undefined" && "speechSynthesis" in window
}

function loadPrefs(): SpeechPrefs {
	if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS }
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return { ...DEFAULT_PREFS, voices: {} }
		const parsed = JSON.parse(raw)
		return {
			...DEFAULT_PREFS,
			...parsed,
			voices: { ...(parsed?.voices ?? {}) }
		}
	} catch {
		return { ...DEFAULT_PREFS, voices: {} }
	}
}

/** Stable key for whoever "said" a message. */
export function speakerKey(msg: {
	characterId?: number | null
	personaId?: number | null
	isNarratorResponse?: boolean | null
}): string {
	if (msg.isNarratorResponse) return "narrator"
	if (msg.characterId) return `character:${msg.characterId}`
	if (msg.personaId) return `persona:${msg.personaId}`
	return "unknown"
}

function hashString(s: string): number {
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
	return Math.abs(h)
}

class SpeechController {
	prefs = $state<SpeechPrefs>(loadPrefs())
	voices = $state<SpeechSynthesisVoice[]>([])
	/** id of the message currently being read, if any */
	playingId = $state<number | null>(null)

	// Bumped on every play/stop so callbacks from a cancelled run are ignored.
	#runToken = 0
	#initialised = false

	init() {
		if (this.#initialised || !isSpeechSupported()) return
		this.#initialised = true
		const refresh = () => {
			this.voices = window.speechSynthesis.getVoices()
		}
		refresh()
		// Chrome loads voices asynchronously.
		window.speechSynthesis.addEventListener("voiceschanged", refresh)
	}

	savePrefs(patch: Partial<SpeechPrefs>) {
		this.prefs = { ...this.prefs, ...patch }
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
		} catch {
			// Storage full or blocked — prefs still apply for this session.
		}
	}

	setSpeakerVoice(key: string, voiceURI: string) {
		const voices = { ...this.prefs.voices }
		if (voiceURI) voices[key] = voiceURI
		else delete voices[key]
		this.savePrefs({ voices })
	}

	/** Voices in the user's own language, novelty voices excluded. */
	get autoPickPool(): SpeechSynthesisVoice[] {
		const lang = (
			typeof navigator !== "undefined" ? navigator.language : "en"
		)
			.slice(0, 2)
			.toLowerCase()
		const sameLang = this.voices.filter(
			(v) =>
				v.lang.toLowerCase().startsWith(lang) &&
				!NOVELTY_VOICES.has(v.name.toLowerCase())
		)
		return sameLang.length ? sameLang : this.voices
	}

	#byURI(uri: string | undefined): SpeechSynthesisVoice | undefined {
		if (!uri) return undefined
		return this.voices.find((v) => v.voiceURI === uri)
	}

	/**
	 * The voice a speaker will use: their saved pick if it exists on this
	 * device, otherwise a deterministic auto-pick so each character gets
	 * their own voice out of the box (and keeps it between sessions).
	 */
	voiceFor(key: string): SpeechSynthesisVoice | undefined {
		const saved = this.#byURI(this.prefs.voices[key])
		if (saved) return saved
		const pool = this.autoPickPool
		if (!pool.length) return undefined
		return pool[hashString(key) % pool.length]
	}

	narratorVoiceFor(
		speakerVoice: SpeechSynthesisVoice | undefined
	): SpeechSynthesisVoice | undefined {
		return this.#byURI(this.prefs.narratorVoice) ?? speakerVoice
	}

	stop() {
		this.#runToken++
		this.playingId = null
		if (isSpeechSupported()) window.speechSynthesis.cancel()
	}

	toggle(msgId: number, content: string, key: string) {
		if (this.playingId === msgId) {
			this.stop()
			return
		}
		this.play(msgId, content, key)
	}

	play(msgId: number, content: string, key: string) {
		if (!isSpeechSupported()) return
		this.init()
		this.stop()
		const token = this.#runToken

		const { actionMode, actionStyle, rate } = this.prefs
		const speakerVoice = this.voiceFor(key)
		const narratorVoice = this.narratorVoiceFor(speakerVoice)
		// With no separate narrator voice chosen, actions use the speaker's
		// voice pitched down so they still read as distinct.
		const narratorPitch = this.prefs.narratorVoice ? 1 : 0.8

		const segments = segmentForSpeech(content, actionStyle).filter(
			(s) => !(s.kind === "action" && actionMode === "skip")
		)
		const utterances: SpeechSynthesisUtterance[] = []
		for (const segment of segments) {
			const asNarrator =
				segment.kind === "action" && actionMode === "narrator"
			for (const chunk of chunkForUtterance(segment.text)) {
				const u = new SpeechSynthesisUtterance(chunk)
				const voice = asNarrator ? narratorVoice : speakerVoice
				if (voice) {
					u.voice = voice
					u.lang = voice.lang
				}
				u.rate = rate
				u.pitch = asNarrator ? narratorPitch : 1
				utterances.push(u)
			}
		}
		if (!utterances.length) return

		this.playingId = msgId
		const last = utterances[utterances.length - 1]
		const finish = () => {
			if (token === this.#runToken) this.playingId = null
		}
		last.onend = finish
		for (const u of utterances) u.onerror = finish
		for (const u of utterances) window.speechSynthesis.speak(u)
	}

	/** Short sample so a voice can be auditioned in settings. */
	preview(voiceURI: string, pitch = 1) {
		if (!isSpeechSupported()) return
		this.init()
		this.stop()
		const u = new SpeechSynthesisUtterance(
			"Hello there. This is how I sound."
		)
		const voice = this.#byURI(voiceURI)
		if (voice) {
			u.voice = voice
			u.lang = voice.lang
		}
		u.rate = this.prefs.rate
		u.pitch = pitch
		window.speechSynthesis.speak(u)
	}
}

export const speech = new SpeechController()
