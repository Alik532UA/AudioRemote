<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { TRACK_VISIBILITIES, type TrackVisibility } from '$lib/audio/boardConfig';
	import Picker from '$lib/components/ui/Picker.svelte';

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
	<Picker
		row
		labelledby="visibility-label-{trackId}"
		{value}
		prefix="visibility-{trackId}"
		options={TRACK_VISIBILITIES.map((option) => ({
			value: option,
			label: t(`visibility.${option}`)
		}))}
		onpick={(next) => onchange(next as TrackVisibility)}
	/>
	<p class="muted">{t(`visibility.${value}Hint`)}</p>
</div>
