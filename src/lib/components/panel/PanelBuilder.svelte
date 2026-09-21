<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Panel } from '$lib/net/panelTypes';
	import PanelEditorGrid from './PanelEditorGrid.svelte';
	import PanelFile from './PanelFile.svelte';

	/**
	 * СКЛАДАЛЬНИК ПАНЕЛІ — усе, що людина робить у режимі складання.
	 *
	 * Сітка місць, дві підказки над нею, типова панель для порожньої дошки й
	 * файл. Зібрано разом, бо це один режим і один екран: доки він відкритий,
	 * ні журналу, ні живої панелі не видно взагалі.
	 *
	 * Своїм файлом — бо сторінка табла має відповідати на «що показувати», а не
	 * знати, з чого складається складальник. Сама вона й далі тримає ДІЇ
	 * (покласти комірку, пересунути, викласти панель): це запис у базу, і
	 * письменник там один.
	 */
	interface Props {
		panel: Panel;
		/** Порожня дошка: є що запропонувати, і нема чого зберігати у файл. */
		empty: boolean;
		/** Триває складання типової панелі. */
		filling: boolean;
		/** Назва дошки — вона стає назвою файлу. */
		name: string;
		onpick: (cell: string) => void;
		onrotate: (cell: string) => void;
		onmove: (from: string, to: string) => void;
		onfill: () => void;
		onload: (panel: Panel) => void;
	}

	let { panel, empty, filling, name, onpick, onrotate, onmove, onfill, onload }: Props = $props();
</script>

<section class="card stack" data-testid="info-editor-section">
	<p class="muted">{t('panel.editHint')}</p>
	<p class="muted">{t('panel.dragHint')}</p>

	<PanelEditorGrid {panel} {onpick} {onrotate} {onmove} />

	<!--
		ОДИН ВИХІД ДЛЯ ПОРОЖНЬОЇ ДОШКИ. Типова панель пропонується лише тоді,
		коли ставити її є куди: на складеній дошці ця кнопка стерла б роботу.
	-->
	{#if empty}
		<button
			class="btn"
			type="button"
			disabled={filling}
			onclick={onfill}
			data-testid="info-fill-btn"
		>
			{filling ? t('common.loading') : t('info.fillStarter')}
		</button>
		<p class="muted">{t('info.fillStarterHint')}</p>
	{/if}

	<!--
		ПАНЕЛЬ У ФАЙЛ — тут, поруч із сіткою, яку вона описує. Складену панель
		возять між залами й тримають кілька варіантів на різні вистави; у
		налаштуваннях застосунку цьому не місце — там нічого не знають про дошку,
		відкриту зараз.
	-->
	<PanelFile {panel} {name} {onload} />
</section>
