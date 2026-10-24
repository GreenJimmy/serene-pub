/**
 * Read-aloud with the browser's own voices (`speechSynthesis`), one message at
 * a time app-wide. `sp-read-aloud` is its only caller.
 *
 * Voice choices are kept in this browser, not the database: which voices exist
 * depends on the device, so a voice chosen on one may not exist on another.
 * See docs/read-aloud.md.
 */

import { t } from "$lib/client/i18n/state.svelte"
import {
	chunkForUtterance,
	segmentForSpeech,
	type ActionStyle
} from "$lib/client/utils/speechText"

/** How action and narration lines are read. */
export type ActionMode = "narrator" | "same" | "skip"

export interface SpeechPrefs {
	/** Speaker → `voiceURI`. A speaker with none gets `voiceFor`'s pick. */
	voices: Record<string, string>
	/** Speaker → the name they were last read under, for the settings list. */
	names: Record<string, string>
	/** The narrator's `voiceURI`; empty reads actions in the speaker's voice, pitched down. */
	narratorVoice: string
	actionMode: ActionMode
	actionStyle: ActionStyle
	rate: number
}

const STORAGE_KEY = "sp.readAloud"

const DEFAULTS: SpeechPrefs = {
	voices: {},
	names: {},
	narratorVoice: "",
	actionMode: "narrator",
	actionStyle: "italics",
	rate: 1
}

const NARRATOR_PITCH = 0.8

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

const novelty = (v: SpeechSynthesisVoice) =>
	NOVELTY.has(v.name.toLowerCase()) ? 1 : 0

export const speechSupported = (): boolean =>
	typeof window !== "undefined" && "speechSynthesis" in window

function load(): SpeechPrefs {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
		if (saved && typeof saved === "object")
			return {
				...DEFAULTS,
				...saved,
				voices: { ...saved.voices },
				names: { ...saved.names }
			}
	} catch {
		// Unreadable or blocked storage: the defaults.
	}
	return { ...DEFAULTS, voices: {}, names: {} }
}

function hash(s: string): number {
	let h = 0
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
	return Math.abs(h)
}

class ReadAloud {
	prefs = $state<SpeechPrefs>({ ...DEFAULTS, voices: {}, names: {} })
	voices = $state<SpeechSynthesisVoice[]>([])
	/** The token of the `sp-read-aloud` element now playing, if any. */
	playing = $state<symbol | null>(null)

	/** Bumped by every start and stop, so a cancelled run's callbacks are ignored. */
	#run = 0
	#ready = false

	/** Loads prefs and voices; a no-op after the first call or without speech. */
	init() {
		if (this.#ready || !speechSupported()) return
		this.#ready = true
		this.prefs = load()
		const refresh = () => (this.voices = speechSynthesis.getVoices())
		refresh()
		// Chrome lists its voices only after this fires.
		speechSynthesis.addEventListener("voiceschanged", refresh)
	}

	save(patch: Partial<SpeechPrefs>) {
		this.prefs = { ...this.prefs, ...patch }
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs))
		} catch {
			// The change still holds for this page.
		}
	}

	setVoice(speaker: string, voiceURI: string) {
		const voices = { ...this.prefs.voices }
		if (voiceURI) voices[speaker] = voiceURI
		else delete voices[speaker]
		this.save({ voices })
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

	#byURI = (uri: string | undefined) =>
		uri ? this.voices.find((v) => v.voiceURI === uri) : undefined

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

	stop() {
		this.#run++
		this.playing = null
		if (speechSupported()) speechSynthesis.cancel()
	}

	/** Forgets a speaker's chosen voice and name. */
	forget(speaker: string) {
		const { [speaker]: _v, ...voices } = this.prefs.voices
		const { [speaker]: _n, ...names } = this.prefs.names
		this.save({ voices, names })
	}

	/** Reads `text` as `speaker`, stopping whatever was playing. */
	play(owner: symbol, text: string, speaker: string, name?: string) {
		if (!speechSupported()) return
		this.init()
		this.stop()
		if (name && this.prefs.names[speaker] !== name)
			this.save({ names: { ...this.prefs.names, [speaker]: name } })
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

	/** A short sample, to audition a voice. */
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
