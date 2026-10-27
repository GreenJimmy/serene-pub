<script lang="ts">
	/**
	 * `sp-read-aloud` — a play/stop toggle that reads `text` aloud in
	 * `speaker`'s voice, with the pub's OpenVox voices or the browser's own.
	 * Draws nothing where neither is available, or there is no text. Voices
	 * are chosen in Settings › User (docs/read-aloud.md).
	 */
	import * as Icons from "@lucide/svelte"
	import { onMount } from "svelte"
	import { t } from "$lib/client/i18n/state.svelte"
	import { readAloud } from "$lib/client/utils/speech.svelte"
	import type { SpElementProps } from "./spElement.svelte"

	let { attrs }: SpElementProps = $props()

	/** This element in `readAloud.playing` — a symbol, which state leaves unproxied. */
	const self = Symbol("sp-read-aloud")
	let mounted = $state(false)
	onMount(() => {
		mounted = true
		readAloud.init()
	})

	const supported = $derived(mounted && readAloud.available)
	const text = $derived(attrs.text ?? "")
	const playing = $derived(readAloud.playing === self)
	const loading = $derived(readAloud.loading === self)

	// Text that changes (an edit, a swipe, a regenerate) or an element that
	// leaves stops what it was reading.
	$effect(() => {
		void text
		return () => {
			if (readAloud.playing === self) readAloud.stop()
		}
	})

	function toggle() {
		if (playing) return readAloud.stop()
		readAloud.play(
			self,
			text,
			attrs.speaker || "unknown",
			attrs["speaker-name"] ?? undefined
		)
	}

	const label = $derived(
		playing ? t("Stop reading") : (attrs.label ?? t("Read aloud"))
	)
</script>

{#if supported && text.trim()}
	<button
		type="button"
		class="sp-read-aloud-button"
		aria-pressed={playing}
		aria-label={label}
		title={label}
		onclick={toggle}
	>
		{#if loading}
			<Icons.LoaderCircle
				size={14}
				class="animate-spin"
				aria-hidden="true"
			/>
		{:else if playing}
			<Icons.Square size={14} aria-hidden="true" />
		{:else}
			<Icons.Volume2 size={14} aria-hidden="true" />
		{/if}
	</button>
{/if}
