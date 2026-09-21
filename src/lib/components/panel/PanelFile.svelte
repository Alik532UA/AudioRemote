<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Panel } from '$lib/net/panelTypes';
	import { panelFromText, panelToText } from '$lib/panel/keep';

	/**
	 * ПАНЕЛЬ У ФАЙЛ І З ФАЙЛУ.
	 *
	 * Складену панель возять між залами, показують колезі, тримають кілька
	 * варіантів на різні вистави — а жила вона досі лише у вузлі бази й у
	 * браузері того, хто її склав. Звичайний JSON знімає обидва обмеження
	 * одразу, і заглянути в нього очима теж можна.
	 *
	 * ## Чому окремим файлом
	 *
	 * Завантаження — це приховане поле файлу, обробник читання, перевірка
	 * прочитаного й повідомлення про невдачу. У сторінці табла це чотири речі,
	 * жодна з яких не про табло.
	 *
	 * ## `URL.revokeObjectURL` обов'язковий
	 *
	 * Посилання на Blob тримає його в пам'яті до перезавантаження сторінки.
	 * Табло стоїть відкритим цілий вечір, і кожне збереження лишало б по собі
	 * копію панелі, яку нема кому прибрати.
	 */
	interface Props {
		panel: Panel;
		/** Назва дошки — щоб файл не звався «panel.json» у всіх однаково. */
		name: string;
		onload: (panel: Panel) => void;
	}

	let { panel, name, onload }: Props = $props();

	let picker = $state<HTMLInputElement | null>(null);
	/** Чому файл не підійшов. Порожньо — питань немає. */
	let bad = $state(false);

	const stamp = () => new Date().toISOString().slice(0, 10);

	function save(): void {
		const blob = new Blob([panelToText(panel)], { type: 'application/json' });
		const href = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = href;
		link.download = `${(name || 'panel').replace(/[^\p{L}\p{N}_-]+/gu, '-')}-${stamp()}.json`;
		link.click();
		URL.revokeObjectURL(href);
	}

	async function take(file: File | undefined): Promise<void> {
		if (!file) return;

		const next = panelFromText(await file.text());
		bad = next === null;
		if (next) onload(next);

		// Поле очищається, інакше той самий файл удруге не дає події `change`.
		if (picker) picker.value = '';
	}
</script>

<div class="file">
	<button class="btn btn--sm" type="button" onclick={save} data-testid="panel-save-file-btn">
		{t('panel.saveFile')}
	</button>

	<button
		class="btn btn--sm"
		type="button"
		onclick={() => picker?.click()}
		data-testid="panel-load-file-btn"
	>
		{t('panel.loadFile')}
	</button>

	<!--
		Поле сховане, а не стилізоване: рідний вигляд `input[type=file]` у
		браузерах різний і жодному нашому органу не рівня. Натискає по ньому
		кнопка поруч.
	-->
	<input
		bind:this={picker}
		class="visually-hidden"
		type="file"
		accept="application/json,.json"
		aria-label={t('panel.loadFile')}
		onchange={(event) => void take(event.currentTarget.files?.[0])}
		data-testid="panel-file-input"
	/>
</div>

{#if bad}
	<p class="error" role="alert" data-testid="panel-file-error">{t('panel.fileBad')}</p>
{/if}

<style>
	.file {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}
</style>
