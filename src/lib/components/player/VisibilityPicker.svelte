<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { TRACK_VISIBILITIES, type TrackVisibility } from '$lib/audio/boardConfig';

	interface Props {
		value: TrackVisibility;
		trackId: string;
		onchange: (next: TrackVisibility) => void;
	}

	let { value, trackId, onchange }: Props = $props();

	/**
	 * КОМУ ПОКАЗУВАТИ ТРЕК — три стани, і перемикач замість прапорця.
	 *
	 * Прапорець «приховано» відповідав лише на «видно чи ні». Станів три, і
	 * середній — не половина крайніх: «лише приймач» це не про видимість, а про
	 * те, хто має право запустити. Гімн, службовий сигнал, сирена мусять
	 * лишатися під клавішею в того, хто стоїть за комп'ютером, і не мусять
	 * бути досяжними з телефона в чужих руках.
	 *
	 * Список, а не перемикач із двох станів і не список, що випадає: усі три
	 * варіанти видно одразу, і кожен підписаний тим, що станеться, — інакше
	 * різницю між двома видами «приховано» довелося б вгадувати.
	 */
</script>

<div class="field">
	<span class="field__label" id="visibility-label-{trackId}">{t('visibility.label')}</span>
	<div class="picker" role="radiogroup" aria-labelledby="visibility-label-{trackId}">
		{#each TRACK_VISIBILITIES as option (option)}
			<button
				class="picker__item"
				type="button"
				role="radio"
				aria-checked={value === option}
				onclick={() => onchange(option)}
				data-testid="visibility-{option}-{trackId}"
			>
				{t(`visibility.${option}`)}
			</button>
		{/each}
	</div>
	<p class="muted">{t(`visibility.${value}Hint`)}</p>
</div>

<style>
	/* Той самий перемикач списком, що й в умові тригера: один вибір — одна рамка. */
	.picker {
		display: grid;
		/*
		 * Рівно три колонки, а не `auto-fit`: варіантів теж три, і автопідбір у
		 * вузькій колонці ставив два — тобто лишав четверту комірку порожньою.
		 * Підписи тут короткі, вони вміщаються й на телефоні.
		 */
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--border);
	}

	.picker__item {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		border: 0;
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker__item:hover,
	.picker__item:focus-visible {
		background: var(--bg-sunken);
	}

	.picker__item[aria-checked='true'] {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}
</style>
