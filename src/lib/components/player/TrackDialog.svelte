<script lang="ts">
	import { IconEye, IconEyeOff, IconKeyboard } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { colorNumber, TRACK_COLORS } from '$lib/config/trackColors';
	import { isAssignable, labelForCode } from '$lib/hotkeys/hotkeys';
	import type { BoardTrack } from '$lib/player/controller.svelte';
	import type { PlayerController } from '$lib/player/controller.svelte';

	interface Props {
		track: BoardTrack;
		controller: PlayerController;
		onclose: () => void;
	}

	let { track, controller, onclose }: Props = $props();

	/**
	 * Цифра, яка діє за порядком, доки клавіші нікому не призначені.
	 *
	 * Без цього вікно казало б «Не призначено» про трек, біля якого в списку
	 * стоїть `3` і який справді запускається трійкою.
	 */
	const byOrder = $derived(track.hotkey ? null : (controller.keyLabels[track.id] ?? null));

	/**
	 * НАЛАШТУВАННЯ ТРЕКУ — ОКРЕМЕ ВІКНО, а не панель під рядком.
	 *
	 * Панель під рядком розсовувала список: усе нижче зʼїжджало, а на довгому
	 * списку відкритий трек ще й виїжджав за межу видимого. Вікно посеред екрана
	 * не рухає нічого й не залежить від того, де саме стоїть рядок.
	 *
	 * `<dialog>` із `showModal()`, а не свій `div`: браузер сам дає затемнення,
	 * закриття по Escape, повернення фокуса туди, звідки прийшли, і пастку
	 * фокуса всередині. Усе це довелося б писати руками — і, як завжди буває,
	 * зробити гірше.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	/** Чекаємо натискання клавіші, щоб призначити її треку. */
	let capturing = $state(false);
	let rejected = $state<string | null>(null);

	$effect(() => {
		node?.showModal();
	});

	/**
	 * Захоплення клавіші.
	 *
	 * Слухач ставиться на ВІКНО й ловить подію на стадії перехоплення: інакше її
	 * першим побачив би `<dialog>` і закрився б на Escape саме тоді, коли Escape
	 * означає «скасувати захоплення».
	 */
	$effect(() => {
		if (!capturing) return;

		const onKey = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			capturing = false;

			if (event.code === 'Escape') return;
			if (!isAssignable(event.code)) {
				rejected = event.code;
				return;
			}
			rejected = null;
			controller.setHotkey(track.id, event.code);
		};

		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="track-dialog"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t('track.settings')}</h2>
			<button class="btn" type="button" onclick={() => node?.close()} data-testid="dialog-close">
				{t('common.close')}
			</button>
		</header>

		<div class="field">
			<label class="field__label" for="track-title">{t('track.displayName')}</label>
			<input
				id="track-title"
				class="input"
				type="text"
				maxlength="200"
				value={track.title}
				placeholder={track.fileName}
				data-testid="track-title"
				oninput={(event) => controller.setTitle(track.id, event.currentTarget.value)}
			/>
			<!-- Ім'я файлу лишається тим самим: застосунок нічого не перейменовує. -->
			<p class="muted mono dialog__file">{track.path}</p>
		</div>

		<div class="field">
			<span class="field__label">{t('hotkeys.assign')}</span>
			<div class="row">
				<button
					class="btn"
					class:btn--primary={capturing}
					type="button"
					onclick={() => {
						capturing = true;
						rejected = null;
					}}
					data-testid="capture-key"
				>
					<IconKeyboard size={18} aria-hidden="true" />
					{#if capturing}
						{t('hotkeys.pressAny')}
					{:else if track.hotkey}
						{labelForCode(track.hotkey)}
					{:else if byOrder}
						{t('hotkeys.byOrder', { key: byOrder })}
					{:else}
						{t('hotkeys.none')}
					{/if}
				</button>

				{#if track.hotkey}
					<button
						class="btn"
						type="button"
						onclick={() => controller.setHotkey(track.id, null)}
						data-testid="clear-key"
					>
						{t('hotkeys.clear')}
					</button>
				{/if}
			</div>

			{#if rejected}
				<p class="error" data-testid="key-rejected">
					{t('hotkeys.reserved', { key: labelForCode(rejected) })}
				</p>
			{/if}
		</div>

		<div class="field">
			<span class="field__label">{t('color.pick')}</span>
			<div class="palette">
				<button
					class="palette__cell palette__cell--none"
					type="button"
					title={t('color.none')}
					aria-label={t('color.none')}
					aria-pressed={track.color === null}
					onclick={() => controller.setColor(track.id, null)}
				></button>
				{#each TRACK_COLORS as swatch (swatch.slug)}
					<button
						class="palette__cell"
						type="button"
						style="--swatch: {swatch.hex}"
						title={t('color.label', { n: colorNumber(swatch.slug) })}
						aria-label={t('color.label', { n: colorNumber(swatch.slug) })}
						aria-pressed={track.color === swatch.slug}
						onclick={() => controller.setColor(track.id, swatch.slug)}
						data-testid="swatch-{swatch.slug}"
					></button>
				{/each}
			</div>
		</div>

		<button
			class="btn"
			type="button"
			onclick={() => controller.toggleHidden(track.id)}
			data-testid="toggle-hidden"
		>
			{#if track.hidden}
				<IconEyeOff size={18} aria-hidden="true" />
				{t('player.show')}
			{:else}
				<IconEye size={18} aria-hidden="true" />
				{t('player.hide')}
			{/if}
		</button>
	</div>
</dialog>

<style>
	.dialog {
		width: min(480px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		padding: var(--gap-lg);
	}

	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		font-size: 1.1rem;
	}

	.dialog__file {
		word-break: break-all;
	}

	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	.palette__cell {
		width: 32px;
		height: 32px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
	}

	.palette__cell--none {
		border-color: var(--border-strong);
		background: var(--bg-sunken);
	}

	.palette__cell:hover,
	.palette__cell:focus-visible {
		border-color: var(--accent);
	}

	.palette__cell[aria-pressed='true'] {
		border-color: var(--text-primary);
	}
</style>
