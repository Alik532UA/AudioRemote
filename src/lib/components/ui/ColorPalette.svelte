<script lang="ts">
	import { colorNumber, TRACK_COLORS } from '$lib/config/trackColors';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * ДЕСЯТЬ ЗАГОТОВОК І «БЕЗ КОЛЬОРУ» — один орган на весь застосунок.
	 *
	 * Чому заготовки, а не піпетка, сказано в `config/trackColors.ts`: палітра з
	 * вибором дасть рожевий на рожевому й сірий, якого не видно.
	 *
	 * Окремим компонентом — бо той самий орган стоїть тепер у двох вікнах: у
	 * треку й у віджеті інфодошки. Друга копія розійшлася б із першою на першій
	 * же правці розміру кружка, і виглядало б це як дві різні палітри.
	 */
	interface Props {
		/** Слуг обраної заготовки або `null` — «без кольору». */
		value: string | null;
		/** Основа локаторів: `{testid}-none-btn`, `{testid}-ruby-btn`. */
		testid: string;
		onpick: (slug: string | null) => void;
	}

	let { value, testid, onpick }: Props = $props();
</script>

<div class="palette">
	<button
		class="palette__cell palette__cell--none"
		type="button"
		title={t('color.none')}
		aria-label={t('color.none')}
		aria-pressed={value === null}
		onclick={() => onpick(null)}
		data-testid="{testid}-none-btn"
	></button>

	{#each TRACK_COLORS as swatch (swatch.slug)}
		<button
			class="palette__cell"
			type="button"
			style="--swatch: {swatch.hex}"
			title={t('color.label', { n: colorNumber(swatch.slug) })}
			aria-label={t('color.label', { n: colorNumber(swatch.slug) })}
			aria-pressed={value === swatch.slug}
			onclick={() => onpick(swatch.slug)}
			data-testid="{testid}-{swatch.slug}-btn"
		></button>
	{/each}
</div>

<style>
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	.palette__cell {
		width: 32px;
		height: 32px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
		transition: transform var(--transition-fast);
	}

	.palette__cell--none {
		border-color: var(--border-strong);
		background: var(--bg-sunken);
	}

	.palette__cell:hover,
	.palette__cell:focus-visible {
		border-color: var(--accent);
		transform: scale(1.1);
	}

	.palette__cell[aria-pressed='true'] {
		border-color: var(--text-primary);
		/* Обраний колір видно й тоді, коли він майже збігається з тлом вікна. */
		box-shadow: 0 0 0 2px var(--bg-surface-raised) inset;
	}

	@media (prefers-reduced-motion: reduce) {
		.palette__cell {
			transition: none;
		}

		.palette__cell:hover,
		.palette__cell:focus-visible {
			transform: none;
		}
	}
</style>
