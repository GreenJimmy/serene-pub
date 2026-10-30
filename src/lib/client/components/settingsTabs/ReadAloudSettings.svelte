<script lang="ts">
	import SettingCard from "./SettingCard.svelte"
	/**
	 * Read aloud's settings: which voices read (OpenVox's, when the pub has
	 * them, or the browser's), how actions are read, the narrator's voice, the
	 * speed, and each speaker's voice. Kept in this browser (`speech.svelte.ts`).
	 */
	import * as Icons from "@lucide/svelte"
	import { onMount } from "svelte"
	import { t } from "$lib/client/i18n/state.svelte"
	import { docsHref } from "$lib/shared/utils/docsHref"
	import {
		openVoxLabel,
		readAloud,
		voiceLabel,
		type ActionMode,
		type OpenVoxVoice,
		type SpeechEngine
	} from "$lib/client/utils/speech.svelte"
	import type { ActionStyle } from "$lib/client/utils/speechText"

	let mounted = $state(false)
	onMount(() => {
		mounted = true
		readAloud.init()
	})
	const supported = $derived(!mounted || readAloud.available)
	const openVox = $derived(readAloud.usingOpenVox)

	const engines: { value: SpeechEngine; label: string }[] = [
		{ value: "openvox", label: "OpenVox (higher quality, from the pub)" },
		{ value: "browser", label: "This browser's voices" }
	]
	const actionModes: { value: ActionMode; label: string }[] = [
		{ value: "narrator", label: "In the narrator's voice" },
		{ value: "same", label: "In the speaker's voice" },
		{ value: "skip", label: "Not at all" }
	]
	const actionStyles: { value: ActionStyle; label: string }[] = [
		{ value: "italics", label: "Text in *italics*" },
		{ value: "unquoted", label: "Anything outside quotes" }
	]

	const speakers = $derived(
		Object.entries(readAloud.prefs.names).sort(([, a], [, b]) =>
			a.localeCompare(b)
		)
	)

	/** A speaker's automatic voice, labelled, for the engine in use. */
	function autoLabel(speaker: string): string {
		if (openVox) {
			const v: OpenVoxVoice | undefined =
				readAloud.openVoxVoiceFor(speaker)
			return v ? openVoxLabel(v) : ""
		}
		const v = readAloud.voiceFor(speaker)
		return v ? voiceLabel(v) : ""
	}

	function hear(speaker: string) {
		if (openVox)
			readAloud.previewOpenVox(readAloud.openVoxVoiceFor(speaker))
		else readAloud.preview(readAloud.voiceFor(speaker))
	}
</script>

{#snippet readAloudHelp()}
	{t(
		"The speaker button on a message reads it aloud. These choices are saved in this browser only, because each device has its own voices."
	)}
	<a class="anchor" href={docsHref("read-aloud")}>
		{t("About read aloud")}
	</a>
{/snippet}

<SettingCard
	title={t("Read aloud")}
	titleId="user-read-aloud-heading"
	helpId="user-read-aloud-note"
	help={readAloudHelp}
	layout="stack"
>
	{#if !supported}
		<p class="text-surface-700-300 text-sm" role="status">
			{t(
				"This browser has no speech voices and the pub has no OpenVox voices, so read aloud is not shown."
			)}
		</p>
	{:else}
		<div class="flex flex-col gap-4">
			{#if readAloud.openVoxVoices.length}
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 text-sm font-medium">
						{t("Voices to read with")}
					</legend>
					{#each engines as engine (engine.value)}
						<label class="flex items-center gap-2 text-sm">
							<input
								class="radio"
								type="radio"
								name="read-aloud-engine"
								value={engine.value}
								checked={readAloud.prefs.engine ===
									engine.value}
								onchange={() =>
									readAloud.save({ engine: engine.value })}
							/>
							{t(engine.label)}
						</label>
					{/each}
				</fieldset>
			{/if}

			<fieldset class="flex flex-col gap-1">
				<legend class="mb-1 text-sm font-medium">
					{t("Read actions and narration")}
				</legend>
				{#each actionModes as mode (mode.value)}
					<label class="flex items-center gap-2 text-sm">
						<input
							class="radio"
							type="radio"
							name="read-aloud-action-mode"
							value={mode.value}
							checked={readAloud.prefs.actionMode === mode.value}
							onchange={() =>
								readAloud.save({ actionMode: mode.value })}
						/>
						{t(mode.label)}
					</label>
				{/each}
			</fieldset>

			{#if readAloud.prefs.actionMode !== "skip"}
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-1 text-sm font-medium">
						{t("What counts as an action")}
					</legend>
					{#each actionStyles as style (style.value)}
						<label class="flex items-center gap-2 text-sm">
							<input
								class="radio"
								type="radio"
								name="read-aloud-action-style"
								value={style.value}
								checked={readAloud.prefs.actionStyle ===
									style.value}
								onchange={() =>
									readAloud.save({
										actionStyle: style.value
									})}
							/>
							{t(style.label)}
						</label>
					{/each}
				</fieldset>
			{/if}

			{#if readAloud.prefs.actionMode === "narrator"}
				<div class="flex flex-col gap-1">
					<label
						for="read-aloud-narrator"
						class="text-sm font-medium"
					>
						{t("Narrator voice")}
					</label>
					{#if openVox}
						<select
							id="read-aloud-narrator"
							class="select"
							value={readAloud.prefs.openVoxNarrator}
							onchange={(e) =>
								readAloud.save({
									openVoxNarrator: e.currentTarget.value
								})}
						>
							<option value="">
								{t("The speaker's own voice")}
							</option>
							{#each readAloud.sortedOpenVoxVoices as voice (voice.id)}
								<option value={voice.id}>
									{openVoxLabel(voice)}
								</option>
							{/each}
						</select>
					{:else}
						<select
							id="read-aloud-narrator"
							class="select"
							value={readAloud.prefs.narratorVoice}
							onchange={(e) =>
								readAloud.save({
									narratorVoice: e.currentTarget.value
								})}
						>
							<option value="">
								{t("The speaker's own voice, pitched lower")}
							</option>
							{#each readAloud.sortedVoices as voice (voice.voiceURI)}
								<option value={voice.voiceURI}>
									{voiceLabel(voice)}
								</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<label
					for="read-aloud-rate"
					class="flex justify-between text-sm font-medium"
				>
					<span>{t("Speed")}</span>
					<span class="text-surface-700-300 tabular-nums">
						{readAloud.prefs.rate.toFixed(1)}×
					</span>
				</label>
				<input
					id="read-aloud-rate"
					type="range"
					min="0.5"
					max="2"
					step="0.1"
					value={readAloud.prefs.rate}
					onchange={(e) =>
						readAloud.save({ rate: Number(e.currentTarget.value) })}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<h4 class="text-sm font-medium">{t("Voices")}</h4>
				{#if !speakers.length}
					<p class="text-surface-700-300 text-sm">
						{t(
							"Each character gets a voice of their own the first time a message of theirs is read. They are listed here to change."
						)}
					</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each speakers as [speaker, name] (speaker)}
							{@const chosen = openVox
								? readAloud.prefs.openVoxVoices[speaker]
								: readAloud.prefs.voices[speaker]}
							{@const auto = chosen ? "" : autoLabel(speaker)}
							<li class="flex flex-wrap items-center gap-2">
								<label
									for="read-aloud-voice-{speaker}"
									class="min-w-24 flex-1 truncate text-sm"
								>
									{name}
								</label>
								<select
									id="read-aloud-voice-{speaker}"
									class="select min-w-0 flex-[2]"
									value={chosen ?? ""}
									onchange={(e) =>
										readAloud.setVoice(
											speaker,
											e.currentTarget.value
										)}
								>
									<option value="">
										{t("Automatic")}{auto
											? ` (${auto})`
											: ""}
									</option>
									{#if openVox}
										{#each readAloud.sortedOpenVoxVoices as voice (voice.id)}
											<option value={voice.id}>
												{openVoxLabel(voice)}
											</option>
										{/each}
									{:else}
										{#each readAloud.sortedVoices as voice (voice.voiceURI)}
											<option value={voice.voiceURI}>
												{voiceLabel(voice)}
											</option>
										{/each}
									{/if}
								</select>
								<button
									type="button"
									class="btn-icon preset-tonal-surface"
									aria-label={t("Hear this voice")}
									title={t("Hear this voice")}
									onclick={() => hear(speaker)}
								>
									<Icons.Volume2
										size={16}
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									class="btn-icon preset-tonal-surface"
									aria-label={t("Remove from this list")}
									title={t("Remove from this list")}
									onclick={() => readAloud.forget(speaker)}
								>
									<Icons.X size={16} aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</SettingCard>
