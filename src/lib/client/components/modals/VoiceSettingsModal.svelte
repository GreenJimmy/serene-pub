<script lang="ts">
	import * as Icons from "@lucide/svelte"
	import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte"
	import {
		speech,
		type ActionMode
	} from "$lib/client/utils/speech.svelte"
	import type { ActionStyle } from "$lib/client/utils/speechText"

	interface Props {
		open: boolean
		onOpenChange: (e: OpenChangeDetails) => void
		/** see speakerKey() in speech.svelte.ts */
		speaker: string
		speakerName: string
	}

	let { open, onOpenChange, speaker, speakerName }: Props = $props()

	$effect(() => {
		if (open) speech.init()
	})

	// The user's own language first, then everything else, each A–Z.
	const sortedVoices = $derived.by(() => {
		const lang = navigator.language.slice(0, 2).toLowerCase()
		const local = (v: SpeechSynthesisVoice) =>
			v.lang.toLowerCase().startsWith(lang) ? 0 : 1
		return [...speech.voices].sort(
			(a, b) => local(a) - local(b) || a.name.localeCompare(b.name)
		)
	})

	const savedVoice = $derived(speech.prefs.voices[speaker] ?? "")
	const autoVoice = $derived(speech.voiceFor(speaker))
	const effectiveVoiceURI = $derived(savedVoice || autoVoice?.voiceURI || "")

	const actionModes: { value: ActionMode; label: string }[] = [
		{ value: "narrator", label: "Narrator voice" },
		{ value: "same", label: "Same voice" },
		{ value: "skip", label: "Skip" }
	]
	const actionStyles: { value: ActionStyle; label: string }[] = [
		{ value: "italics", label: "*Italic text*" },
		{ value: "unquoted", label: "Anything outside quotes" }
	]

	function close() {
		speech.stop()
		onOpenChange({ open: false } as OpenChangeDetails)
	}
</script>

<Dialog {open} onOpenChange={(e) => (e.open ? onOpenChange(e) : close())}>
	<Portal>
		<Dialog.Backdrop
			class="bg-surface-50-950/50 fixed inset-0 z-50 backdrop-blur-sm"
		/>
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-center justify-center p-4"
		>
			<Dialog.Content
				class="card bg-surface-100-900 max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto p-6 shadow-xl"
				aria-labelledby="voice-settings-title"
			>
				<header class="flex items-center gap-2">
					<Icons.AudioLines size={20} aria-hidden="true" />
					<h2 id="voice-settings-title" class="h3">Voice settings</h2>
				</header>

				{#if !speech.voices.length}
					<p class="text-sm opacity-70">
						No voices found in this browser yet. They can take a
						moment to load — try reopening this in a second.
					</p>
				{/if}

				<!-- Per-speaker voice -->
				<div class="space-y-2">
					<label for="speaker-voice" class="text-sm font-semibold">
						{speakerName}'s voice
					</label>
					<div class="flex gap-2">
						<select
							id="speaker-voice"
							class="select min-w-0 flex-1"
							value={savedVoice}
							onchange={(e) =>
								speech.setSpeakerVoice(
									speaker,
									e.currentTarget.value
								)}
						>
							<option value="">
								Auto{autoVoice ? ` (${autoVoice.name})` : ""}
							</option>
							{#each sortedVoices as voice (voice.voiceURI)}
								<option value={voice.voiceURI}>
									{voice.name} — {voice.lang}
								</option>
							{/each}
						</select>
						<button
							type="button"
							class="btn preset-tonal-surface msg-ctrl-btn h-auto self-stretch"
							title="Preview this voice"
							aria-label="Preview {speakerName}'s voice"
							onclick={() => speech.preview(effectiveVoiceURI)}
						>
							<Icons.Volume2 aria-hidden="true" />
						</button>
					</div>
				</div>

				<!-- Actions handling (global) -->
				<fieldset class="space-y-2">
					<legend class="text-sm font-semibold">
						Read actions with
					</legend>
					<div class="flex flex-wrap gap-2">
						{#each actionModes as mode (mode.value)}
							<button
								type="button"
								class="btn btn-sm {speech.prefs.actionMode ===
								mode.value
									? 'preset-filled-primary-500'
									: 'preset-tonal-surface'}"
								aria-pressed={speech.prefs.actionMode ===
									mode.value}
								onclick={() =>
									speech.savePrefs({ actionMode: mode.value })}
							>
								{mode.label}
							</button>
						{/each}
					</div>
				</fieldset>

				{#if speech.prefs.actionMode !== "skip"}
					<fieldset class="space-y-2">
						<legend class="text-sm font-semibold">
							What counts as an action
						</legend>
						<div class="flex flex-wrap gap-2">
							{#each actionStyles as style (style.value)}
								<button
									type="button"
									class="btn btn-sm {speech.prefs
										.actionStyle === style.value
										? 'preset-filled-primary-500'
										: 'preset-tonal-surface'}"
									aria-pressed={speech.prefs.actionStyle ===
										style.value}
									onclick={() =>
										speech.savePrefs({
											actionStyle: style.value
										})}
								>
									{style.label}
								</button>
							{/each}
						</div>
					</fieldset>
				{/if}

				{#if speech.prefs.actionMode === "narrator"}
					<div class="space-y-2">
						<label
							for="narrator-voice"
							class="text-sm font-semibold"
						>
							Narrator voice
						</label>
						<div class="flex gap-2">
							<select
								id="narrator-voice"
								class="select min-w-0 flex-1"
								value={speech.prefs.narratorVoice}
								onchange={(e) =>
									speech.savePrefs({
										narratorVoice: e.currentTarget.value
									})}
							>
								<option value="">
									Character's voice, lower pitch
								</option>
								{#each sortedVoices as voice (voice.voiceURI)}
									<option value={voice.voiceURI}>
										{voice.name} — {voice.lang}
									</option>
								{/each}
							</select>
							<button
								type="button"
								class="btn preset-tonal-surface msg-ctrl-btn h-auto self-stretch"
								title="Preview narrator voice"
								aria-label="Preview narrator voice"
								onclick={() =>
									speech.prefs.narratorVoice
										? speech.preview(
												speech.prefs.narratorVoice
											)
										: speech.preview(
												effectiveVoiceURI,
												0.8
											)}
							>
								<Icons.Volume2 aria-hidden="true" />
							</button>
						</div>
					</div>
				{/if}

				<div class="space-y-2">
					<label
						for="speech-rate"
						class="flex justify-between text-sm font-semibold"
					>
						<span>Speed</span>
						<span class="tabular-nums opacity-70">
							{speech.prefs.rate.toFixed(1)}×
						</span>
					</label>
					<input
						id="speech-rate"
						type="range"
						class="w-full"
						min="0.5"
						max="2"
						step="0.1"
						value={speech.prefs.rate}
						oninput={(e) =>
							speech.savePrefs({
								rate: Number(e.currentTarget.value)
							})}
					/>
				</div>

				<p class="text-xs opacity-60">
					Voices come from this device's browser, so picks are saved
					on this device. Action and speed settings apply to every
					character.
				</p>

				<footer class="flex justify-end">
					<button
						type="button"
						class="btn preset-filled-primary-500"
						onclick={close}
					>
						Done
					</button>
				</footer>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
