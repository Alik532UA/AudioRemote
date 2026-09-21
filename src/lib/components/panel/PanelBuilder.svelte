<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import {
		gridOf,
		MAX_PANEL_COLS,
		MAX_PANEL_ROWS,
		type Grid,
		type Panel
	} from '$lib/net/panelTypes';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';
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
		/** Змінити розмір самої дошки. */
		onresize: (grid: Grid) => void;
	}

	let { panel, empty, filling, name, onpick, onrotate, onmove, onfill, onload, onresize }: Props =
		$props();

	const grid = $derived(gridOf(panel));
</script>

<section class="card stack" data-testid="info-editor-section">
	<p class="muted">{t('panel.editHint')}</p>
	<p class="muted">{t('panel.dragHint')}</p>

	<!--
		РОЗМІР ДОШКИ — ТУТ, над сіткою місць, яку він і міняє.

		Три на п'ять добрі для телефона в руці; планшет на стійці біля пульта
		тримає більше, а дошка на дві кнопки не мусить малювати тринадцять
		порожніх місць. Комірки, що опинилися за межею зменшеної сітки, НЕ
		стираються — їх просто не видно, доки сітку не повернуть.
	-->
	<div class="pair">
		<div class="field">
			<label class="field__label" for="panel-cols">{t('panel.boardCols')}</label>
			<NumberStepper
				id="panel-cols"
				value={grid.cols}
				min={1}
				max={MAX_PANEL_COLS}
				label={t('panel.boardCols')}
				onchange={(next) => onresize({ rows: grid.rows, cols: next })}
			/>
		</div>
		<div class="field">
			<label class="field__label" for="panel-rows">{t('panel.boardRows')}</label>
			<NumberStepper
				id="panel-rows"
				value={grid.rows}
				min={1}
				max={MAX_PANEL_ROWS}
				label={t('panel.boardRows')}
				onchange={(next) => onresize({ rows: next, cols: grid.cols })}
			/>
		</div>
	</div>
	<p class="muted">{t('panel.boardSizeHint')}</p>

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

<style>
	/* Стовпці й ряди — поруч: це одна відповідь, розбита на два числа. */
	.pair {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.pair .field {
		flex: 1;
		min-inline-size: 0;
	}
</style>
