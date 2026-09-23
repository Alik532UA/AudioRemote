<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import {
		gridOf,
		MAX_PANEL_COLS,
		MAX_PANEL_ROWS,
		type Grid,
		type Panel
	} from '$lib/net/panelTypes';
	import { IconCheck } from '$lib/config/icons';
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
		/** Вийти зі складання. Кнопка живе тут, бо закінчує саме ЦЕЙ режим. */
		ondone: () => void;
	}

	let {
		panel,
		empty,
		filling,
		name,
		onpick,
		onrotate,
		onmove,
		onfill,
		onload,
		onresize,
		ondone
	}: Props = $props();

	const grid = $derived(gridOf(panel));
</script>

<section class="card stack" data-testid="info-editor-section">
	<!--
		РОЗМІР ДОШКИ — НАГОРІ, над сіткою, яку він і міняє.

		Три на п'ять добрі для телефона в руці; планшет на стійці біля пульта
		тримає більше, а дошка на дві кнопки не мусить малювати тринадцять
		порожніх місць. Комірки, що опинилися за межею зменшеної сітки, НЕ
		стираються — їх просто не видно, доки сітку не повернуть.
	-->
	<div class="grid-frame">
		<div class="grid-frame__corner" aria-hidden="true"></div>
		<div class="grid-frame__cols">
			<span class="grid-frame__label" id="panel-cols-label">{t('panel.boardCols')}</span>
			<div
				class="grid-frame__strip grid-frame__strip--cols"
				role="radiogroup"
				aria-labelledby="panel-cols-label"
				id="panel-cols"
			>
				{#each Array.from({ length: MAX_PANEL_COLS }, (_, i) => i + 1) as col (col)}
					<button
						class="grid-frame__btn"
						class:grid-frame__btn--active={grid.cols === col}
						type="button"
						role="radio"
						aria-checked={grid.cols === col}
						onclick={() => onresize({ rows: grid.rows, cols: col })}
						data-testid="panel-cols-{col}-btn"
					>
						{col}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid-frame__side">
			<span class="grid-frame__label grid-frame__label--vertical" id="panel-rows-label">
				{t('panel.boardRows')}
			</span>
			<div
				class="grid-frame__strip grid-frame__strip--rows"
				role="radiogroup"
				aria-labelledby="panel-rows-label"
				id="panel-rows"
			>
				{#each Array.from({ length: MAX_PANEL_ROWS }, (_, i) => i + 1) as row (row)}
					<button
						class="grid-frame__btn"
						class:grid-frame__btn--active={grid.rows === row}
						type="button"
						role="radio"
						aria-checked={grid.rows === row}
						onclick={() => onresize({ rows: row, cols: grid.cols })}
						data-testid="panel-rows-{row}-btn"
					>
						{row}
					</button>
				{/each}
			</div>
		</div>

		<div class="grid-frame__content">
			<PanelEditorGrid {panel} {onpick} {onrotate} {onmove} />
		</div>
	</div>

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
		РЯДОК ДІЙ — УНИЗУ, І «ГОТОВО» В НЬОМУ ПРАВОРУЧ.

		«Готово» нічого не зберігає: кожна правка лягає в базу тієї ж миті, коли
		її зробили. Отже це не підтвердження, а КІНЕЦЬ РОБОТИ, — і читається він
		там, де робота закінчується: унизу, після сітки, а не вгорі серед
		налаштувань розміру, де він був сусідом двох лічильників і читався як
		третій із них.

		Праворуч, а не ліворуч: ліворуч у рядку стоїть те, що роблять МІЖ ділом
		(зберегти, завантажити), і дія, після якої з режиму виходять, не має
		стояти першою під рукою.

		ЛИПНЕ ДО НИЗУ ЕКРАНА. Сітка росте до шести на вісім, і тоді рядок дій
		іде за нижній край: щоб вийти, довелося б спершу прокрутити. Липкий
		рядок лишає вихід на місці завжди — і при цьому не забирає висоти, бо
		він частина картки, а не смуга над нею.
	-->
	<div class="acts">
		<PanelFile {panel} {name} {onload} />

		<button class="btn btn--primary" type="button" onclick={ondone} data-testid="info-edit-btn">
			<IconCheck size={18} aria-hidden="true" />
			{t('panel.editDone')}
		</button>
	</div>
</section>

<style>
	.grid-frame {
		display: grid;
		grid-template-columns: auto auto;
		gap: var(--gap-sm);
		margin-inline: auto;
		inline-size: fit-content;
		max-inline-size: 100%;
		align-items: start;
	}

	.grid-frame__corner {
		inline-size: 100%;
	}

	.grid-frame__cols {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap-xs);
		justify-self: center;
	}

	.grid-frame__side {
		display: flex;
		align-items: center;
		align-self: center;
		gap: var(--gap-xs);
	}

	.grid-frame__label {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.grid-frame__label--vertical {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		align-self: center;
		white-space: nowrap;
		letter-spacing: 0.02em;
	}

	.grid-frame__strip {
		display: flex;
		gap: var(--gap-xs);
	}

	.grid-frame__strip--cols {
		flex-wrap: wrap;
		justify-content: center;
	}

	.grid-frame__strip--rows {
		flex-direction: column;
	}

	.grid-frame__content {
		min-inline-size: 0;
	}

	.grid-frame__btn {
		display: grid;
		place-items: center;
		inline-size: 32px;
		block-size: 32px;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.grid-frame__btn:hover {
		border-color: var(--border-hover);
		background: var(--bg-header-btn-hover);
	}

	.grid-frame__btn--active {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--bg-surface);
	}

	@media (prefers-reduced-motion: reduce) {
		.grid-frame__btn {
			transition: none;
		}
	}

	/*
	 * Рядок дій: файл ліворуч, вихід праворуч. `sticky` разом із від'ємним
	 * відступом картки — щоб липла саме смуга, а не лишала по собі щілину
	 * кольору сторінки; тло власне, бо під нею проїжджає сітка.
	 */
	.acts {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		margin: 0 calc(-1 * var(--gap)) calc(-1 * var(--gap));
		padding: var(--gap-sm) var(--gap) var(--gap);
		border-radius: 0 0 var(--radius) var(--radius);
		background: var(--bg-surface);
	}
</style>
