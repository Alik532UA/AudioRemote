<script lang="ts">
	import type { Snippet } from 'svelte';
	import { IconClose, IconSettings } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		head: Snippet;
		/** Відкрити налаштування — вікном, а не переходом (див. `SettingsDialog`). */
		onsettings: () => void;
		onclose: () => void;
	}

	let { head, onsettings, onclose }: Props = $props();

	/**
	 * МЕНЮ ДОШКИ НА ТЕЛЕФОНІ — дошка плюс перехід до налаштувань застосунку.
	 *
	 * Називалося це «Налаштування», і всередині була кнопка «Налаштування
	 * застосунку» — налаштування в налаштуваннях. Насправді це різні речі: тут
	 * шапка ЦІЄЇ дошки й дії над нею, а справжні налаштування застосунку —
	 * окремо, за одним переходом звідси. Звідси й гамбургер замість шестірні:
	 * шестірня обіцяє налаштування, а це меню.
	 *
	 * На телефоні шестірня не веде одразу на сторінку налаштувань: спершу тут
	 * шапка дошки, яку зняли з екрана заради списку, і вже під нею — перехід.
	 * Так одна кнопка відповідає на обидва «а де подивитися»: і про цю дошку, і
	 * про застосунок.
	 *
	 * На широкому екрані цього вікна немає зовсім: там шапка стоїть карткою в
	 * колонці, і шестірня веде прямо, як і вела.
	 */
	let node = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		node?.showModal();
	});
</script>

<dialog
	bind:this={node}
	class="sheet"
	data-testid="board-sheet"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="sheet__body">
		<header class="sheet__head">
			<h2 class="sheet__title">{t('settings.boardMenu')}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="board-sheet-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		{@render head()}

		<button class="btn" type="button" onclick={onsettings} data-testid="go-settings-full">
			<IconSettings size={18} aria-hidden="true" />
			{t('settings.app')}
		</button>
	</div>
</dialog>

<style>
	.sheet {
		width: min(480px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.sheet::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.sheet__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		padding: var(--gap-lg);
	}

	.sheet__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.sheet__title {
		font-size: 1.1rem;
	}
</style>
