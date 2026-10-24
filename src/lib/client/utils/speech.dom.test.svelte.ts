/**
 * Read aloud's playback over a stand-in `speechSynthesis`: which voice reads
 * which segment, one element playing at a time, and choices kept in storage.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("$lib/client/i18n/state.svelte", () => ({ t: (s: string) => s }))

type Voice = Pick<SpeechSynthesisVoice, "name" | "lang" | "voiceURI">
const voice = (name: string, lang = "en-US", voiceURI = name): Voice => ({
	name,
	lang,
	voiceURI
})

class Utterance {
	voice: Voice | null = null
	lang = ""
	rate = 1
	pitch = 1
	onend: (() => void) | null = null
	onerror: (() => void) | null = null
	constructor(public text: string) {}
}

let spoken: Utterance[] = []
let voices: Voice[] = []

beforeEach(() => {
	spoken = []
	voices = [
		voice("Ava"),
		voice("Tom"),
		voice("Zarvox"),
		voice("Amélie", "fr-FR")
	]
	localStorage.clear()
	vi.stubGlobal("SpeechSynthesisUtterance", Utterance)
	vi.stubGlobal("speechSynthesis", {
		getVoices: () => voices,
		speak: (u: Utterance) => spoken.push(u),
		cancel: vi.fn(),
		addEventListener: vi.fn()
	})
	vi.resetModules()
})

afterEach(() => vi.unstubAllGlobals())

async function fresh() {
	const { readAloud } = await import("./speech.svelte")
	readAloud.init()
	return readAloud
}

describe("readAloud", () => {
	test("reads speech in the speaker's voice and actions in the narrator's", async () => {
		const r = await fresh()
		r.setVoice("character:1", "Ava")
		r.save({ narratorVoice: "Tom" })
		r.play(Symbol(), '*She smiles.* "Hello."', "character:1")
		expect(spoken.map((u) => [u.text, u.voice?.name, u.pitch])).toEqual([
			["She smiles.", "Tom", 1],
			['"Hello."', "Ava", 1]
		])
	})

	test("pitches the speaker's own voice down for actions when no narrator is chosen", async () => {
		const r = await fresh()
		r.setVoice("character:1", "Ava")
		r.play(Symbol(), "*waves* Hi", "character:1")
		expect(spoken.map((u) => [u.voice?.name, u.pitch])).toEqual([
			["Ava", 0.8],
			["Ava", 1]
		])
	})

	test("skips actions when asked to", async () => {
		const r = await fresh()
		r.save({ actionMode: "skip" })
		r.play(Symbol(), "*waves* Hi", "character:1")
		expect(spoken.map((u) => u.text)).toEqual(["Hi"])
	})

	test("picks the same automatic voice for a speaker every time, never a novelty one", async () => {
		const r = await fresh()
		const picks = new Set<string | undefined>()
		for (let i = 0; i < 40; i++)
			picks.add(r.voiceFor(`character:${i}`)?.name)
		expect(picks.has("Zarvox")).toBe(false)
		expect(r.voiceFor("character:7")?.name).toBe(
			r.voiceFor("character:7")?.name
		)
	})

	test("one element plays at a time, and finishing clears it", async () => {
		const r = await fresh()
		const a = Symbol("a")
		const b = Symbol("b")
		r.play(a, "One.", "character:1")
		expect(r.playing).toBe(a)
		const first = spoken.at(-1)!
		r.play(b, "Two.", "character:2")
		expect(r.playing).toBe(b)
		first.onend?.()
		expect(r.playing).toBe(b)
		spoken.at(-1)!.onend?.()
		expect(r.playing).toBe(null)
	})

	test("keeps choices and names in storage, and forgets a speaker", async () => {
		let r = await fresh()
		r.play(Symbol(), "Hi.", "character:1", "Jasmine")
		r.setVoice("character:1", "Tom")
		vi.resetModules()
		r = await fresh()
		expect(r.prefs.names).toEqual({ "character:1": "Jasmine" })
		expect(r.voiceFor("character:1")?.name).toBe("Tom")
		r.forget("character:1")
		expect(r.prefs.names).toEqual({})
		expect(r.prefs.voices).toEqual({})
	})

	test("labels a voice's tier, lists the best first and novelty voices last", async () => {
		voices = [
			voice("Ava", "en-US", "com.apple.voice.compact.en-US.Ava"),
			voice("Ava", "en-US", "com.apple.voice.premium.en-US.Ava"),
			voice("Zoe", "en-US", "com.apple.voice.enhanced.en-US.Zoe"),
			voice("Bubbles", "en-US")
		]
		const { voiceLabel } = await import("./speech.svelte")
		const r = await fresh()
		expect(
			r.sortedVoices.map((v) => voiceLabel(v as SpeechSynthesisVoice))
		).toEqual([
			"Ava (Premium) — en-US",
			"Zoe (Enhanced) — en-US",
			"Ava — en-US",
			"Bubbles — en-US"
		])
	})

	test("picks automatic voices from the best tier the device has a few of", async () => {
		const tiered = (name: string, tier: string) =>
			voice(name, "en-US", `com.apple.voice.${tier}.en-US.${name}`)
		voices = [
			tiered("Ava", "premium"),
			tiered("Zoe", "premium"),
			tiered("Evan", "enhanced"),
			tiered("Fred", "compact"),
			tiered("Kathy", "compact")
		]
		const r = await fresh()
		const picks = new Set<string | undefined>()
		for (let i = 0; i < 40; i++)
			picks.add(r.voiceFor(`character:${i}`)?.name)
		expect([...picks].sort()).toEqual(["Ava", "Evan", "Zoe"])
	})
})
