/**
 * Read-aloud, one message at a time app-wide. `sp-read-aloud` is its only
 * caller. Two engines: OpenVox through the pub (`/api/read-aloud/*`) when the
 * pub has it configured and the viewer chose it, else the browser's own voices
 * (`speechSynthesis`).
 *
 * Voice choices are kept in this browser, not the database: which voices exist
 * depends on the device (and on the pub, for OpenVox), so a voice chosen on one
 * may not exist on another. See docs/read-aloud.md.
 */

import { t } from "$lib/client/i18n/state.svelte"
import {
	chunkForUtterance,
	segmentForSpeech,
	type ActionStyle
} from "$lib/client/utils/speechText"

/** How action and narration lines are read. */
export type ActionMode = "narrator" | "same" | "skip"

export type SpeechEngine = "browser" | "openvox"

/** A voice of the pub's OpenVox server, as `/api/read-aloud/voices` lists it. */
export interface OpenVoxVoice {
	id: string
	name: string
	language?: string
	gender?: string
	age?: string
}

export interface SpeechPrefs {
	/** OpenVox when the pub offers it; the browser's voices otherwise. */
	engine: SpeechEngine
	/** Speaker → `voiceURI`. A speaker with none gets `voiceFor`'s pick. */
	voices: Record<string, string>
	/** Speaker → OpenVox voice id. A speaker with none gets `openVoxVoiceFor`'s pick. */
	openVoxVoices: Record<string, string>
	/** Speaker → the name they were last read under, for the settings list. */
	names: Record<string, string>
	/** The narrator's `voiceURI`; empty reads actions in the speaker's voice, pitched down. */
	narratorVoice: string
	/** The narrator's OpenVox voice id; empty reads actions in the speaker's voice. */
	openVoxNarrator: string
	actionMode: ActionMode
	actionStyle: ActionStyle
	rate: number
}

const STORAGE_KEY = "sp.readAloud"

const DEFAULTS: SpeechPrefs = {
	engine: "openvox",
	voices: {},
	openVoxVoices: {},
	names: {},
	narratorVoice: "",
	openVoxNarrator: "",
	actionMode: "narrator",
	actionStyle: "italics",
	rate: 1
}

const NARRATOR_PITCH = 0.8

/** OpenVox reads whole segments well; this only bounds a runaway one. */
const OPENVOX_CHUNK = 1000

/** macOS's novelty voices: still choosable, never assigned automatically. */
const NOVELTY = new Set(
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

/**
 * A voice's quality tier, read off its `voiceURI` — the one place macOS and
 * iOS say it (`com.apple.voice.premium.en-US.Ava`); its `name` is the same
 * for every tier. 2 premium, 1 enhanced, 0 anything else.
 */
export function voiceQuality(
	v: Pick<SpeechSynthesisVoice, "voiceURI">
): 0 | 1 | 2 {
	return /\.premium\./i.test(v.voiceURI)
		? 2
		: /\.enhanced\./i.test(v.voiceURI)
			? 1
			: 0
}

/** A voice as a person chooses it: name, tier where it has one, language. */
export function voiceLabel(v: SpeechSynthesisVoice): string {
	const tier = ["", " (Enhanced)", " (Premium)"][voiceQuality(v)]
	return `${v.name}${tier} — ${v.lang}`
}

/** An OpenVox voice as a person chooses it: name, then what OpenVox says of it. */
export function openVoxLabel(v: OpenVoxVoice): string {
	const about = [v.gender, v.age, v.language].filter(Boolean).join(", ")
	return about ? `${v.name} — ${about}` : v.name
}

const novelty = (v: SpeechSynthesisVoice) =>
	NOVELTY.has(v.name.toLowerCase()) ? 1 : 0

export const speechSupported = (): boolean =>
	typeof window !== "undefined" && "speechSynthesis" in window

/** The viewer's language as OpenVox names it ("English"), for picking voices. */
function viewerLanguageName(): string {
	try {
		const code = navigator.language.slice(0, 2).toLowerCase()
		return (
			new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? ""
		)
	} catch {
		return ""
	}
}

function load(): SpeechPrefs {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
		if (saved && typeof saved === "object")
			return {
				...DEFAULTS,
				...saved,
				voices: { ...saved.voices },
				openVoxVoices: { ...saved.openVoxVoices },
				names: { ...saved.names }
			}
	} catch {
		// Unreadable or blocked storage: the defaults.
	}
	return { ...DEFAULTS, voices: {}, openVoxVoices: {}, names: {} }
}

function hash(s: string): number {
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
	return Math.abs(h)
}

/** A tenth of a second of silence, played during the tap to unlock audio on iOS. */
function silentWav(): Blob {
	const rate = 8000
	const samples = rate / 10
	const bytes = new Uint8Array(44 + samples * 2)
	const view = new DataView(bytes.buffer)
	const tag = (at: number, s: string) =>
		[...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)))
	tag(0, "RIFF")
	view.setUint32(4, bytes.length - 8, true)
	tag(8, "WAVE")
	tag(12, "fmt ")
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true) // PCM
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, rate, true)
	view.setUint32(28, rate * 2, true)
	view.setUint16(32, 2, true)
	view.setUint16(34, 16, true)
	tag(36, "data")
	view.setUint32(40, samples * 2, true)
	return new Blob([bytes], { type: "audio/wav" })
}

class ReadAloud {
	prefs = $state<SpeechPrefs>({
		...DEFAULTS,
		voices: {},
		openVoxVoices: {},
		names: {}
	})
	voices = $state<SpeechSynthesisVoice[]>([])
	/** The pub's OpenVox voices; empty when it has none or did not answer. */
	openVoxVoices = $state<OpenVoxVoice[]>([])
	/** The token of the `sp-read-aloud` element now playing, if any. */
	playing = $state<symbol | null>(null)
	/** The token of the element whose OpenVox audio is still being made. */
	loading = $state<symbol | null>(null)

	/** Bumped by every start and stop, so a cancelled run's callbacks are ignored. */
	#run = 0
	#ready = false
	#audio?: HTMLAudioElement
	#audioUrl = ""
	#silentUrl = ""
	#request?: AbortController
	#preview = Symbol("preview")

	/** Loads prefs and both engines' voices; a no-op after the first call. */
	init() {
		if (this.#ready || typeof window === "undefined") return
		this.#ready = true
		this.prefs = load()
		if (speechSupported()) {
			const refresh = () => (this.voices = speechSynthesis.getVoices())
			refresh()
			// Chrome lists its voices only after this fires.
			speechSynthesis.addEventListener("voiceschanged", refresh)
		}
		void this.#loadOpenVoxVoices()
	}

	async #loadOpenVoxVoices() {
		try {
			const res = await fetch("/api/read-aloud/voices")
			if (!res.ok) return
			const body = (await res.json()) as { voices?: OpenVoxVoice[] }
			if (Array.isArray(body.voices)) this.openVoxVoices = body.voices
		} catch {
			// No OpenVox: the browser's voices.
		}
	}

	/** Whether there is any engine to read with. */
	get available(): boolean {
		return this.openVoxVoices.length > 0 || speechSupported()
	}

	/** Whether reads go to OpenVox: chosen, and the pub has voices for it. */
	get usingOpenVox(): boolean {
		return this.prefs.engine === "openvox" && this.openVoxVoices.length > 0
	}

	save(patch: Partial<SpeechPrefs>) {
		this.prefs = { ...this.prefs, ...patch }
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
		} catch {
			// The change still holds for this page.
		}
	}

	/** Sets a speaker's voice for the engine in use; empty means automatic. */
	setVoice(speaker: string, id: string) {
		const key = this.usingOpenVox ? "openVoxVoices" : "voices"
		const voices = { ...this.prefs[key] }
		if (id) voices[speaker] = id
		else delete voices[speaker]
		this.save({ [key]: voices })
	}

	/** Every voice: the viewer's language first, novelty voices last, the best tier first, then A–Z. */
	get sortedVoices(): SpeechSynthesisVoice[] {
		const lang = navigator.language.slice(0, 2).toLowerCase()
		const local = (v: SpeechSynthesisVoice) =>
			v.lang.toLowerCase().startsWith(lang) ? 0 : 1
		return [...this.voices].sort(
			(a, b) =>
				local(a) - local(b) ||
				novelty(a) - novelty(b) ||
				voiceQuality(b) - voiceQuality(a) ||
				a.name.localeCompare(b.name)
		)
	}

	/** Every OpenVox voice: the viewer's language first, then A–Z. */
	get sortedOpenVoxVoices(): OpenVoxVoice[] {
		const lang = viewerLanguageName()
		const local = (v: OpenVoxVoice) => (v.language === lang ? 0 : 1)
		return [...this.openVoxVoices].sort(
			(a, b) => local(a) - local(b) || a.name.localeCompare(b.name)
		)
	}

	#byURI = (uri: string | undefined) =>
		uri ? this.voices.find((v) => v.voiceURI === uri) : undefined

	#openVoxById = (id: string | undefined) =>
		id ? this.openVoxVoices.find((v) => v.id === id) : undefined

	/**
	 * A speaker's voice: their chosen one while this device has it, else one
	 * picked from their name, so each character sounds different by default
	 * and the same from one visit to the next.
	 */
	voiceFor(speaker: string): SpeechSynthesisVoice | undefined {
		const chosen = this.#byURI(this.prefs.voices[speaker])
		if (chosen) return chosen
		const lang = navigator.language.slice(0, 2).toLowerCase()
		const usable = this.voices.filter(
			(v) => !NOVELTY.has(v.name.toLowerCase())
		)
		const local = usable.filter((v) =>
			v.lang.toLowerCase().startsWith(lang)
		)
		// The best tier this device has, while it has a few to share out.
		const best = (list: SpeechSynthesisVoice[]) => {
			for (const tier of [2, 1] as const) {
				const of = list.filter((v) => voiceQuality(v) >= tier)
				if (of.length >= 3) return of
			}
			return list
		}
		const pool = best(local)
		const from = pool.length ? pool : usable.length ? usable : this.voices
		return from.length ? from[hash(speaker) % from.length] : undefined
	}

	/** `voiceFor`, among the pub's OpenVox voices. */
	openVoxVoiceFor(speaker: string): OpenVoxVoice | undefined {
		const chosen = this.#openVoxById(this.prefs.openVoxVoices[speaker])
		if (chosen) return chosen
		const lang = viewerLanguageName()
		const local = this.openVoxVoices.filter((v) => v.language === lang)
		const from = local.length ? local : this.openVoxVoices
		return from.length ? from[hash(speaker) % from.length] : undefined
	}

	stop() {
		this.#run++
		this.playing = null
		this.loading = null
		this.#request?.abort()
		this.#request = undefined
		if (this.#audio) {
			this.#audio.onended = this.#audio.onerror = null
			this.#audio.pause()
		}
		if (speechSupported()) speechSynthesis.cancel()
	}

	/** Forgets a speaker's chosen voices and name. */
	forget(speaker: string) {
		const { [speaker]: _v, ...voices } = this.prefs.voices
		const { [speaker]: _o, ...openVoxVoices } = this.prefs.openVoxVoices
		const { [speaker]: _n, ...names } = this.prefs.names
		this.save({ voices, openVoxVoices, names })
	}

	/** Reads `text` as `speaker`, stopping whatever was playing. */
	play(owner: symbol, text: string, speaker: string, name?: string) {
		this.init()
		if (!this.available) return
		this.stop()
		if (name && this.prefs.names[speaker] !== name)
			this.save({ names: { ...this.prefs.names, [speaker]: name } })
		if (this.usingOpenVox)
			return this.#playOpenVox(owner, text, speaker, name)
		if (!speechSupported()) return
		const run = this.#run
		const { actionMode, actionStyle, rate, narratorVoice } = this.prefs
		const own = this.voiceFor(speaker)
		const narrator = this.#byURI(narratorVoice) ?? own

		const utterances = segmentForSpeech(text, actionStyle)
			.filter((s) => s.kind === "speech" || actionMode !== "skip")
			.flatMap((s) => {
				const asNarrator =
					s.kind === "action" && actionMode === "narrator"
				const voice = asNarrator ? narrator : own
				const pitch = asNarrator && !narratorVoice ? NARRATOR_PITCH : 1
				return chunkForUtterance(s.text).map((chunk) =>
					this.#utterance(chunk, voice, rate, pitch)
				)
			})
		if (!utterances.length) return

		const done = () => {
			if (run === this.#run) this.playing = null
		}
		utterances.at(-1)!.onend = done
		for (const u of utterances) u.onerror = done
		this.playing = owner
		for (const u of utterances) speechSynthesis.speak(u)
	}

	#playOpenVox(owner: symbol, text: string, speaker: string, name?: string) {
		const { actionMode, actionStyle, openVoxNarrator } = this.prefs
		const own = this.openVoxVoiceFor(speaker)
		if (!own) return
		const narrator = this.#openVoxById(openVoxNarrator) ?? own
		const parts = segmentForSpeech(text, actionStyle)
			.filter((s) => s.kind === "speech" || actionMode !== "skip")
			.flatMap((s) => {
				const voice =
					s.kind === "action" && actionMode === "narrator"
						? narrator
						: own
				return chunkForUtterance(s.text, OPENVOX_CHUNK).map(
					(chunk) => ({
						text: chunk,
						voice: voice.id
					})
				)
			})
		this.#speakOpenVox(owner, parts, name)
	}

	/**
	 * Plays `parts` as OpenVox reads them. Must start during the tap: iOS only
	 * lets an audio element play after a fetch if it already played in the
	 * gesture, so the element is unlocked with silence first.
	 */
	#speakOpenVox(
		owner: symbol,
		parts: { text: string; voice: string }[],
		title?: string
	) {
		if (!parts.length) return
		const run = this.#run
		const audio = (this.#audio ??= new Audio())
		this.#silentUrl ||= URL.createObjectURL(silentWav())
		this.#setSource(audio, this.#silentUrl)
		audio.play().catch(() => {})
		this.playing = owner
		this.loading = owner
		this.#mediaSession(title)

		const request = new AbortController()
		this.#request = request
		const done = () => {
			if (run !== this.#run) return
			this.playing = null
			this.loading = null
		}
		void (async () => {
			try {
				const res = await fetch("/api/read-aloud/speech", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ parts, speed: this.prefs.rate }),
					signal: request.signal
				})
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const blob = await res.blob()
				if (run !== this.#run) return
				this.#setSource(audio, URL.createObjectURL(blob))
				this.loading = null
				audio.onended = done
				audio.onerror = done
				await audio.play()
			} catch (error) {
				if (run !== this.#run) return
				console.warn("Read aloud: OpenVox failed", error)
				done()
			}
		})()
	}

	/** Points the shared element at `url`, freeing the last message's audio. */
	#setSource(audio: HTMLAudioElement, url: string) {
		if (this.#audioUrl && this.#audioUrl !== this.#silentUrl)
			URL.revokeObjectURL(this.#audioUrl)
		this.#audioUrl = url
		audio.src = url
	}

	/** Lock-screen and car controls: the speaker's name, and pause stops. */
	#mediaSession(title?: string) {
		try {
			if (!("mediaSession" in navigator)) return
			navigator.mediaSession.metadata = new MediaMetadata({
				title: title ?? t("Read aloud"),
				artist: "Serene Pub"
			})
			for (const action of ["pause", "stop"] as const)
				navigator.mediaSession.setActionHandler(action, () =>
					this.stop()
				)
		} catch {
			// No media session here; playback is unaffected.
		}
	}

	/** A short sample, to audition a browser voice. */
	preview(voice: SpeechSynthesisVoice | undefined, pitch = 1) {
		if (!speechSupported()) return
		this.stop()
		speechSynthesis.speak(
			this.#utterance(
				t("Hello there. This is how I sound."),
				voice,
				this.prefs.rate,
				pitch
			)
		)
	}

	/** A short sample, to audition an OpenVox voice. */
	previewOpenVox(voice: OpenVoxVoice | undefined) {
		if (!voice) return
		this.stop()
		this.#speakOpenVox(this.#preview, [
			{ text: t("Hello there. This is how I sound."), voice: voice.id }
		])
	}

	#utterance(
		text: string,
		voice: SpeechSynthesisVoice | undefined,
		rate: number,
		pitch: number
	) {
		const u = new SpeechSynthesisUtterance(text)
		if (voice) {
			u.voice = voice
			u.lang = voice.lang
		}
		u.rate = rate
		u.pitch = pitch
		return u
	}
}

export const readAloud = new ReadAloud()
