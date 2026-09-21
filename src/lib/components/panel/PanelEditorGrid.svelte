<script lang="ts">
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import { PANEL_COLS, type Panel, type PanelCell } from '$lib/net/panelTypes';
	import { layoutPanel, type Placed } from '$lib/panel/layout';
	import { colorOf } from '$lib/config/trackColors';

	/**
	 * СІТКА В РЕЖИМІ СКЛАДАННЯ — ОКРЕМА, а не та сама з прапорцем.
	 *
	 * Спокуса додати `editing` у `PanelGrid` і намалювати поверх кнопок ще одну
	 * велику — сильна, і вона неправильна двічі. Технічно: кнопка всередині
	 * кнопки — недійсна розмітка, і браузер розбирає її не так, як написано.
	 * По суті: у цих двох сіток різні органи. Жива має стільки кнопок, скільки
	 * їх у віджеті; ця — по одній на віджет, бо складають саме віджетами.
	 *
	 * МІСЦЕ ВІДЖЕТА ПОКАЗУЄТЬСЯ СПРАВЖНЄ. Доти тут було п'ятнадцять однакових
	 * квадратиків, і з них не було видно, що віджет на три кнопки займе третину
	 * колонки. Тепер складальник показує ту саму розкладку, що й зал.
	 */
	interface Props {
		panel: Panel;
		onpick: (cell: string) => void;
		/** Повернути віджет на місці — колесом миші або кнопкою у вікні. */
		onrotate: (cell: string) => void;
	}

	let { panel, onpick, onrotate }: Props = $props();

	const board = $derived(layoutPanel(panel));

	const spot = (at: Placed) => `${at.row + 1} / ${at.col + 1} / span ${at.rows} / span ${at.cols}`;

	const hole = (key: string) => {
		const index = Number(key);
		return `${Math.floor(index / PANEL_COLS) + 1} / ${(index % PANEL_COLS) + 1} / span 1 / span 1`;
	};

	/** Одним рядком: що саме стоїть у віджеті. */
	const summary = (cell: PanelCell): string => {
		if (cell.kind === 'slider') return t('panel.summarySlider', { step: cell.step ?? 10 });
		if (cell.kind === 'check') return t('panel.summaryCheck');
		return plural(
			{ one: 'panel.buttonsOne', few: 'panel.buttonsFew', other: 'panel.buttonsMany' },
			cell.buttons?.length ?? 0
		);
	};
</script>

<div class="grid" data-testid="panel-editor-list">
	{#each board.free as key (key)}
		<button
			class="slot slot--empty"
			type="button"
			style="grid-area: {hole(key)}"
			onclick={() => onpick(key)}
			data-testid="panel-slot-{key}-btn"
		>
			<span class="slot__what">{t('panel.cellEmpty')}</span>
		</button>
	{/each}

	{#each board.placed as at (at.cell)}
		{@const cell = panel.cells[at.cell]}
		{#if cell}
			<!--
				КОЛЕСО ПОВЕРТАЄ ВІДЖЕТ — але це СКОРОЧЕННЯ, а не єдиний шлях.

				На телефоні колеса немає, з клавіатури його не буває взагалі, а
				поворот — дія, без якої панель не скласти. Тому те саме є кнопкою у
				вікні віджета; тут воно живе лише тому, що мишею це один рух.

				`preventDefault` обовʼязковий: інакше сторінка під складальником
				поїде разом із поворотом.
			-->
			{@const hex = colorOf(cell.color)}
			<button
				class="slot"
				class:slot--tinted={hex !== null}
				type="button"
				style="grid-area: {spot(at)}{hex ? `; --widget-color: ${hex}` : ''}"
				onclick={() => onpick(at.cell)}
				onwheel={(event) => {
					event.preventDefault();
					onrotate(at.cell);
				}}
				data-testid="panel-slot-{at.cell}-btn"
			>
				{#if cell.caption || cell.icon}
					<span class="slot__caption">
						{#if cell.icon}<span aria-hidden="true">{cell.icon}</span>{/if}
						{cell.caption}
					</span>
				{/if}
				<span class="slot__what">{summary(cell)}</span>
			</button>
		{/if}
	{/each}
</div>

<style>
	/*
	 * Ті самі три на п'ять, і тієї самої форми, що й жива сітка: складальник
	 * мусить показувати те, що побачить зал, а не власну схему.
	 */
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-rows: repeat(5, minmax(0, 1fr));
		gap: var(--gap-xs);
		block-size: min(60dvh, 30rem);
		inline-size: 100%;
		max-inline-size: 26rem;
		margin-inline: auto;
	}

	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-inline-size: 0;
		min-block-size: 0;
		padding: var(--gap-xs);
		overflow: hidden;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: center;
	}

	/* Колір — так само, як у живій сітці: складальник показує те, що побачить зал. */
	.slot--tinted {
		border-inline-start: 4px solid var(--widget-color);
		background: color-mix(in oklab, var(--widget-color) 12%, var(--bg-surface-raised));
	}

	/* Пунктир — те саме, що й у живій сітці: місце, куди щось стане. */
	.slot--empty {
		border-style: dashed;
		background: none;
		color: var(--text-secondary);
	}

	.slot:hover,
	.slot:focus-visible {
		border-color: var(--accent);
	}

	.slot__caption {
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.1;
	}

	.slot__what {
		color: var(--text-secondary);
		font-size: 0.7rem;
		line-height: 1.1;
	}
</style>
