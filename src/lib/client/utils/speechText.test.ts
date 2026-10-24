import { describe, expect, it } from "vitest"
import { chunkForUtterance, segmentForSpeech } from "./speechText"

describe("segmentForSpeech (italics mode)", () => {
	it("splits *actions* from speech in order", () => {
		expect(
			segmentForSpeech('*She smiles warmly.* "Hello there!" *waves*')
		).toEqual([
			{ kind: "action", text: "She smiles warmly." },
			{ kind: "speech", text: '"Hello there!"' },
			{ kind: "action", text: "waves" }
		])
	})

	it("treats _underscores_ as actions, and reads snake_case as words", () => {
		expect(segmentForSpeech("_nods_ my_var stays")).toEqual([
			{ kind: "action", text: "nods" },
			{ kind: "speech", text: "my var stays" }
		])
	})

	it("keeps **bold** as speech", () => {
		expect(segmentForSpeech("That is **very** important.")).toEqual([
			{ kind: "speech", text: "That is very important." }
		])
	})

	it("drops OOC asides, images and code", () => {
		expect(
			segmentForSpeech(
				"Hi. (OOC: brb) ((also this)) ![pic](x.png) `code` [link](http://a)"
			)
		).toEqual([{ kind: "speech", text: "Hi. code link" }])
	})

	it("merges adjacent segments of the same kind", () => {
		expect(segmentForSpeech("*a* *b* hi")).toEqual([
			{ kind: "action", text: "a b" },
			{ kind: "speech", text: "hi" }
		])
	})

	it("ignores punctuation-only leftovers", () => {
		expect(segmentForSpeech("*sighs* ... *shrugs*")).toEqual([
			{ kind: "action", text: "sighs shrugs" }
		])
	})
})

describe("segmentForSpeech (unquoted mode)", () => {
	it("treats everything outside quotes as narration", () => {
		expect(
			segmentForSpeech(
				"He leans in. “Tell me.” She *hesitates*.",
				"unquoted"
			)
		).toEqual([
			{ kind: "action", text: "He leans in." },
			{ kind: "speech", text: "Tell me." },
			{ kind: "action", text: "She hesitates." }
		])
	})

	it("falls back to italics when there are no quotes", () => {
		expect(segmentForSpeech("*smiles* Hi there", "unquoted")).toEqual([
			{ kind: "action", text: "smiles" },
			{ kind: "speech", text: "Hi there" }
		])
	})
})

describe("chunkForUtterance", () => {
	it("leaves short text alone", () => {
		expect(chunkForUtterance("Short.")).toEqual(["Short."])
	})

	it("splits long text on sentence boundaries under the limit", () => {
		const text = "One sentence here. ".repeat(30).trim()
		const chunks = chunkForUtterance(text, 100)
		expect(chunks.length).toBeGreaterThan(1)
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100)
		expect(chunks.join(" ")).toBe(text)
	})

	it("splits a single run-on sentence", () => {
		const text = "word ".repeat(100).trim()
		const chunks = chunkForUtterance(text, 50)
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50)
		expect(chunks.join(" ")).toBe(text)
	})
})
