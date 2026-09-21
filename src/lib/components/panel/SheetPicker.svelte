<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';

	/**
	 * ЧИЙ ПУЛЬТ Я ДИВЛЮСЯ — вибір помічника, і тільки його.
	 *
	 * У залі кілька людей із різною роботою: світло, завіса, підказка тексту.
	 * Одна панель на всіх означала, що кожен шукає свої три кнопки серед чужих
	 * п'ятнадцяти, — тобто саме те, чого фіксована сітка мала б не допускати.
	 *
	 * ## Вибору немає, доки немає з чого вибирати
	 *
	 * Панель, у якій жоден віджет не названий, виглядає в усіх однаково — і
	 * перемикач на ній був би питанням про те, чого не існує. Тому він
	 * з'являється рівно тоді, коли господар назвав хоч один пульт.
	 *
	 * ## «Усі» лишається й ніколи не зникає
	 *
	 * Це і є «об'єднати в спільний пульт»: помічник, якому треба бачити все
	 * (або який у залі сам), обирає його й отримує панель такою, якою вона була
	 * до появи пультів.
	 */
	interface Props {
		/** Назви, які трапляються в панелі. Порожньо — вибору не показуємо. */
		sheets: readonly string[];
		/** Обране. `null` — «усі». */
		value: string | null;
		onpick: (sheet: string | null) => void;
	}

	let { sheets, value, onpick }: Props = $props();

	/** Порожній рядок як значення «усі»: `Picker` працює з рядками. */
	const ALL = '';
</script>

{#if sheets.length > 0}
	<div class="field">
		<span class="field__label" id="sheet-label">{t('panel.sheetPick')}</span>
		<Picker
			row
			labelledby="sheet-label"
			value={value ?? ALL}
			prefix="info-sheet"
			options={[
				{ value: ALL, label: t('panel.sheetEvery') },
				...sheets.map((name) => ({ value: name, label: name }))
			]}
			onpick={(next) => onpick(next === ALL ? null : next)}
		/>
	</div>
{/if}
