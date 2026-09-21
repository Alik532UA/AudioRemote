<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { PANEL_COLS, PANEL_ROWS } from '$lib/net/panelTypes';
	import type { Shape } from '$lib/panel/layout';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';

	/**
	 * ФОРМА ВІДЖЕТА — окремим органом, бо вона вже не одне поле.
	 *
	 * Доти тут стояв вибір із двох слів: стовпчиком чи рядком. Відколи розмір
	 * можна назвати самому, до нього додалися два лічильники, їхня підказка й
	 * умова, за якої вони взагалі є, — а вікно віджета й без того мало вісім
	 * полів і стелю розміру, у яку воно вперлося.
	 *
	 * ПОВОРОТ ЛИШИВСЯ ПЕРШИМИ ДВОМА КНОПКАМИ, а не став двома числами. Інакше
	 * звичайна дія («постав стовпчиком») перетворилася б на арифметику: скільки
	 * рядів треба трьом кнопкам, людина знати не мусить.
	 */
	interface Props {
		shape: Shape;
		rows: number;
		cols: number;
		/** Скільки клітинок вийде. Рахує вікно: воно знає рід і кількість кнопок. */
		span: number;
		onshape: (next: Shape) => void;
		onsize: (rows: number, cols: number) => void;
	}

	let { shape, rows, cols, span, onshape, onsize }: Props = $props();
</script>

<div class="field">
	<!--
		ПОВОРОТ — ТУТ, А НЕ ЛИШЕ КОЛЕСОМ МИШІ. Колесом швидше, але його немає ні
		на телефоні, ні з клавіатури, а без повороту панель не скласти.
	-->
	<span class="field__label" id="cell-turn-label">{t('panel.turn')}</span>
	<Picker
		row
		labelledby="cell-turn-label"
		value={shape}
		prefix="cell-turn"
		options={[
			{ value: 'down', label: t('panel.turnDown') },
			{ value: 'across', label: t('panel.turnAcross') },
			{ value: 'custom', label: t('panel.turnCustom') }
		]}
		onpick={(next) => onshape(next as Shape)}
	/>

	{#if shape === 'custom'}
		<div class="pair">
			<div class="field">
				<label class="field__label" for="cell-rows">{t('panel.sizeRows')}</label>
				<NumberStepper
					id="cell-rows"
					value={rows}
					min={1}
					max={PANEL_ROWS}
					label={t('panel.sizeRows')}
					onchange={(next) => onsize(next, cols)}
				/>
			</div>
			<div class="field">
				<label class="field__label" for="cell-cols">{t('panel.sizeCols')}</label>
				<NumberStepper
					id="cell-cols"
					value={cols}
					min={1}
					max={PANEL_COLS}
					label={t('panel.sizeCols')}
					onchange={(next) => onsize(rows, next)}
				/>
			</div>
		</div>
		<p class="muted">{t('panel.sizeHint')}</p>
	{/if}

	<p class="muted">{t('panel.spanHint', { count: span })}</p>
</div>

<style>
	/* Рядів і стовпців — поруч: це одна відповідь, розбита на два числа. */
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
