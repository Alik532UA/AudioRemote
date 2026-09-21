<script lang="ts">
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import { CELL_KEYS } from '$lib/net/panel';
	import type { Panel, PanelCell } from '$lib/net/panelTypes';

	/**
	 * СІТКА В РЕЖИМІ СКЛАДАННЯ — ОКРЕМА, а не та сама з прапорцем.
	 *
	 * Спокуса додати `editing` у `PanelGrid` і намалювати поверх кнопок ще одну
	 * велику — сильна, і вона неправильна двічі. Технічно: кнопка всередині
	 * кнопки — недійсна розмітка, і браузер розбирає її не так, як написано.
	 * По суті: у цих двох сіток різні органи. Жива має стільки кнопок, скільки
	 * їх у комірці; ця — рівно п'ятнадцять, по одній на комірку, бо складають
	 * саме комірками.
	 *
	 * Тому тут не показано ні підписів кнопок, ні положення повзунків: у режимі
	 * складання питання інше — ЩО стоїть у цьому місці, а не що воно зараз
	 * каже. Як панель виглядає насправді, видно за один дотик до «Готово».
	 */
	interface Props {
		panel: Panel;
		onpick: (cell: string) => void;
	}

	let { panel, onpick }: Props = $props();

	/** Одним рядком: що саме стоїть у комірці. Порожня каже про себе теж. */
	const summary = (cell: PanelCell | undefined): string => {
		if (!cell) return t('panel.cellEmpty');
		if (cell.kind === 'slider') return t('panel.summarySlider', { step: cell.step ?? 10 });
		if (cell.kind === 'check') return t('panel.summaryCheck');
		return plural(
			{ one: 'panel.buttonsOne', few: 'panel.buttonsFew', other: 'panel.buttonsMany' },
			cell.buttons?.length ?? 0
		);
	};
</script>

<div class="grid" data-testid="panel-editor-list">
	{#each CELL_KEYS as key (key)}
		{@const cell = panel.cells[key]}
		<button
			class="slot"
			class:slot--empty={!cell}
			type="button"
			onclick={() => onpick(key)}
			data-testid="panel-slot-{key}-btn"
		>
			{#if cell?.caption}
				<span class="slot__caption">{cell.caption}</span>
			{/if}
			<span class="slot__what">{summary(cell)}</span>
		</button>
	{/each}
</div>

<style>
	/*
	 * Ті самі три на п'ять, але висота тут від вмісту: у режимі складання
	 * прокручуватися можна й треба — на телефоні п'ятнадцять комірок із двома
	 * рядками тексту в екран не влазять, а тиснуть у них не наосліп.
	 */
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--gap-xs);
		inline-size: 100%;
		max-inline-size: 30rem;
		margin-inline: auto;
	}

	.slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-block-size: calc(var(--tap) * 1.5);
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
