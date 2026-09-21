<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { MAX_BUTTONS, MAX_LABEL } from '$lib/net/panelTypes';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';

	/**
	 * ПІДПИСИ Й КОЛЬОРИ КНОПОК — окремим файлом, а не ще одним полем у вікні.
	 *
	 * Відколи кожна кнопка дістала власний колір, цей орган перестав бути
	 * списком полів: у кожного рядка тепер свій стан («чи відкрита палітра»),
	 * своя палітра й своя кнопка-зразок. У вікні віджета це була б третина його
	 * розміру — при тому, що до решти родів (повзунок, перемикач) воно не має
	 * жодного стосунку.
	 *
	 * ## Палітра відкривається, а не стоїть розгорнутою
	 *
	 * Заготовок одинадцять, кнопок до п'яти — розгорнуті палітри дали б
	 * п'ятдесят п'ять кружків у стовпці завширшки 230 точок, тобто рівно те
	 * вікно на вісімсот точок униз, від якого щойно пішли. Тому в рядку стоїть
	 * ОДИН зразок обраного кольору, і палітра розкривається під тим рядком, з
	 * яким зараз працюють.
	 */
	interface Props {
		/**
		 * Чернетка кнопок. Правиться НА МІСЦІ: масив приїхав із вікна віджета й
		 * лишається його власністю — тут у нього немає другої копії, якій було б
		 * куди розійтися з першою.
		 */
		rows: { label: string; color: string | null }[];
		onadd: () => void;
	}

	let { rows, onadd }: Props = $props();

	/** Рядок, під яким зараз розкрита палітра. `null` — жодного. */
	let open = $state<number | null>(null);
</script>

<div class="rows">
	{#each rows as row, position (position)}
		{@const hex = colorOf(row.color)}
		<div class="row">
			<label class="visually-hidden" for="cell-label-{position}">
				{t('panel.buttonLabel', { n: position + 1 })}
			</label>
			<input
				id="cell-label-{position}"
				class="input"
				type="text"
				maxlength={MAX_LABEL}
				placeholder={t('panel.buttonLabel', { n: position + 1 })}
				bind:value={rows[position].label}
				data-testid="cell-label-{position}-input"
			/>

			<button
				class="tint"
				class:tint--none={hex === null}
				type="button"
				style={hex ? `--swatch: ${hex}` : undefined}
				aria-expanded={open === position}
				aria-label={t('panel.buttonColor', { n: position + 1 })}
				title={t('panel.buttonColor', { n: position + 1 })}
				onclick={() => (open = open === position ? null : position)}
				data-testid="cell-tint-{position}-btn"
			></button>
		</div>

		{#if open === position}
			<ColorPalette
				value={row.color}
				testid="cell-color-{position}"
				onpick={(slug) => {
					rows[position].color = slug;
					open = null;
				}}
			/>
		{/if}
	{/each}

	{#if rows.length < MAX_BUTTONS}
		<button class="btn btn--sm" type="button" onclick={onadd} data-testid="cell-add-label-btn">
			{t('panel.addButton')}
		</button>
	{/if}
	<p class="muted">{t('panel.buttonsHint')}</p>
</div>

<style>
	.rows {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
	}

	/* Поле розтягується, зразок — ні: колір займає рівно свої 32 точки. */
	.row .input {
		flex: 1;
		min-inline-size: 0;
	}

	.tint {
		flex: none;
		inline-size: 32px;
		block-size: 32px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--swatch);
		cursor: pointer;
	}

	/*
	 * «Без кольору» — перекреслений квадрат, а не порожній: порожній не
	 * відрізнити від білої заготовки, і саме на цьому люди зупиняються.
	 */
	.tint--none {
		background: linear-gradient(
				to top right,
				transparent calc(50% - 1px),
				var(--border-strong) calc(50% - 1px),
				var(--border-strong) calc(50% + 1px),
				transparent calc(50% + 1px)
			)
			var(--bg-surface);
	}

	.tint:hover,
	.tint:focus-visible {
		border-color: var(--accent);
	}
</style>
