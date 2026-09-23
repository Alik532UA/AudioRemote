<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { MAX_BUTTONS, MAX_LABEL } from '$lib/net/panelTypes';
	import { IconEye, IconEyeOff, IconTrash } from '$lib/config/icons';
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
		rows: { label: string; color: string | null; hidden?: boolean }[];
		onadd: () => void;
		onremove?: (position: number) => void;
	}

	let { rows, onadd, onremove }: Props = $props();

	/** Рядок, під яким зараз розкрита палітра. `null` — жодного. */
	let open = $state<number | null>(null);

	function toggleHide(position: number) {
		rows[position].hidden = !rows[position].hidden;
	}

	function removeRow(position: number) {
		if (onremove) {
			onremove(position);
		} else {
			rows.splice(position, 1);
		}
		if (open === position) open = null;
		else if (open !== null && open > position) open -= 1;
	}
</script>

<div class="rows">
	{#each rows as row, position (position)}
		{@const hex = colorOf(row.color)}
		<div class="row" class:row--hidden={row.hidden}>
			<label class="visually-hidden" for="cell-label-{position}">
				{t('panel.buttonLabel', { n: position + 1 })}
			</label>
			<input
				id="cell-label-{position}"
				class="input"
				class:input--dimmed={row.hidden}
				type="text"
				maxlength={MAX_LABEL}
				placeholder={t('panel.buttonLabel', { n: position + 1 })}
				bind:value={rows[position].label}
				data-testid="cell-label-{position}-input"
			/>

			<!-- Зміна кольору -->
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

			<!-- Приховати / показати -->
			<button
				class="row-act"
				class:row-act--active={row.hidden}
				type="button"
				aria-label={row.hidden
					? t('panel.showButton', { n: position + 1 })
					: t('panel.hideButton', { n: position + 1 })}
				title={row.hidden
					? t('panel.showButton', { n: position + 1 })
					: t('panel.hideButton', { n: position + 1 })}
				onclick={() => toggleHide(position)}
				data-testid="cell-toggle-hide-{position}-btn"
			>
				{#if row.hidden}
					<IconEyeOff size={16} aria-hidden="true" />
				{:else}
					<IconEye size={16} aria-hidden="true" />
				{/if}
			</button>

			<!-- Видалити -->
			<button
				class="row-act row-act--danger"
				type="button"
				aria-label={t('panel.deleteButton', { n: position + 1 })}
				title={t('panel.deleteButton', { n: position + 1 })}
				onclick={() => removeRow(position)}
				data-testid="cell-remove-label-{position}-btn"
			>
				<IconTrash size={16} aria-hidden="true" />
			</button>
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

	/*
	 * ЦІЛЬ ПІД ПАЛЕЦЬ, А КВАДРАТИК — ПІД ОКО: те саме рішення, що й у палітри
	 * кольорів. Сам квадратик 32 (більший читався б як ще одна кнопка в рядку),
	 * а тиснуть у 44 навколо нього.
	 */
	.tint {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: var(--tap);
		block-size: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.tint::before {
		content: '';
		display: block;
		inline-size: 32px;
		block-size: 32px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--swatch);
	}

	/*
	 * «Без кольору» — перекреслений квадрат, а не порожній: порожній не
	 * відрізнити від білої заготовки, і саме на цьому люди зупиняються.
	 */
	.tint--none::before {
		background: linear-gradient(
				to top right,
				transparent calc(50% - 1px),
				var(--border-strong) calc(50% - 1px),
				var(--border-strong) calc(50% + 1px),
				transparent calc(50% + 1px)
			)
			var(--bg-surface);
	}

	.tint:hover::before,
	.tint:focus-visible::before {
		border-color: var(--accent);
	}

	.row-act {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 32px;
		block-size: 32px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.row-act:hover,
	.row-act:focus-visible {
		border-color: var(--border-hover);
		color: var(--text-primary);
		background: var(--bg-header-btn-hover);
	}

	.row-act--active {
		color: var(--accent);
		border-color: var(--accent);
	}

	.row-act--danger:hover,
	.row-act--danger:focus-visible {
		border-color: var(--danger);
		color: var(--danger);
		background: var(--danger-soft);
	}

	.input--dimmed {
		opacity: 0.5;
		text-decoration: line-through;
	}

	@media (prefers-reduced-motion: reduce) {
		.row-act {
			transition: none;
		}
	}
</style>
