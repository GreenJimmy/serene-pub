import { describe, expect, test } from "vitest"
import { joinWavs, parseWav } from "./openvox"

/** A mono 16-bit PCM WAV at `rate`, its samples set to `samples`. */
function wav(samples: number[], rate = 1000): Uint8Array {
	const bytes = new Uint8Array(44 + samples.length * 2)
	const view = new DataView(bytes.buffer)
	const tag = (at: number, s: string) =>
		[...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)))
	tag(0, "RIFF")
	view.setUint32(4, bytes.length - 8, true)
	tag(8, "WAVE")
	tag(12, "fmt ")
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true)
	view.setUint16(22, 1, true)
	view.setUint32(24, rate, true)
	view.setUint32(28, rate * 2, true)
	view.setUint16(32, 2, true)
	view.setUint16(34, 16, true)
	tag(36, "data")
	view.setUint32(40, samples.length * 2, true)
	samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true))
	return bytes
}

const samplesOf = (bytes: Uint8Array) => {
	const { data } = parseWav(bytes)
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
	return Array.from({ length: data.length / 2 }, (_, i) =>
		view.getInt16(i * 2, true)
	)
}

describe("joinWavs", () => {
	test("plays each part in turn with a quarter second of silence between", () => {
		const joined = joinWavs([wav([1, 2]), wav([3])])
		const gap = Array(250).fill(0)
		expect(samplesOf(joined)).toEqual([1, 2, ...gap, 3])
		const view = new DataView(joined.buffer)
		expect(view.getUint32(4, true)).toBe(joined.length - 8)
	})

	test("reads a streamed WAV whose data size is a placeholder", () => {
		const streamed = wav([5, 6])
		new DataView(streamed.buffer).setUint32(40, 0xffffffff, true)
		expect(samplesOf(joinWavs([streamed]))).toEqual([5, 6])
	})

	test("refuses parts in different formats", () => {
		expect(() => joinWavs([wav([1], 1000), wav([1], 2000)])).toThrow(
			/different audio formats/
		)
	})
})
