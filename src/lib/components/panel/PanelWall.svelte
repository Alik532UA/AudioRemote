<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Panel, PanelCommandType } from '$lib/net/panelTypes';
	import type { Seat } from '$lib/services/roster';
	import type { SpotlightView } from '$lib/panel/spotlight';
	import { readItem, writeItem } from '$lib/services/storage';
	import Switch from '$lib/components/ui/Switch.svelte';
	import PanelMirror from './PanelMirror.svelte';

	/**
	 * ПО ПАНЕЛІ НА КОЖНОГО, ХТО ПІДКЛЮЧИВСЯ.
	 *
	 * ## Пульт ОДИН — копій кілька
	 *
	 * Сітка та сама в усіх панелях: це не різні пульти, а різні ЕКРАНИ одного.
	 * Копія існує заради єдиного — видно, ЧИЄ натискання світиться. Двоє
	 * помічників тиснуть ту саму кнопку, і за звуковим пультом це дві різні
	 * події: «Оля просить гучніше» і «Ада просить гучніше». Доти обидві
	 * виглядали однаково, бо панель була одна.
	 *
	 * ## Чому не по пультах, як було
	 *
	 * Раніше панелі роздавалися за назвою пульта, приписаною віджету в
	 * складальнику. Задум був розумний і мав одну ваду, яка й вирішила справу:
	 * у типовому стані назви не призначено жодній комірці, тож панель була
	 * рівно одна, а сама можливість не показувалася ніде. Функція, яка мовчки
	 * нічого не робить у стані за замовчуванням, — це не «є», а «наче є».
	 *
	 * Пульт при цьому нікуди не подівся: він лишився ФІЛЬТРОМ. Помічник обирає
	 * собі пульт у залі, і його панель тут показує рівно те, що бачить він.
	 *
	 * ## Місце СТАЛЕ
	 *
	 * Нові панелі дописуються в кінець, зниклі тьмяніють і звільняють місце аж
	 * через витримку (`roster.ts`). Панель, що переїхала під новим
	 * сусідом або зникла від блимання Wi-Fi, — це кнопка, яка опинилася не там,
	 * де на неї щойно дивилися.
	 *
	 * ## Коли нікого немає — панель однаково є
	 *
	 * Порожня стіна означала б, що дошку не видно, доки хтось не підключиться, —
	 * а тиснути її може й сам звукорежисер. Тому без помічників лишається одна
	 * безіменна панель: та сама дошка, просто нема кому приписати натискання.
	 *
	 * ## Ряд із прокруткою, а не стиснуті панелі
	 *
	 * Чотири сітки 3×5 поруч дали б кнопку ~70×40. Прокрутка тут не коштує
	 * нічого: на табло ДИВЛЯТЬСЯ, а наосліп тиснуть у залі — і там панель одна.
	 */
	interface Props {
		panel: Panel;
		levels: Record<string, number>;
		flags: Record<string, boolean>;
		/** Хто за пультом. Порожньо — одна безіменна панель. */
		seats: readonly Seat[];
		/** Підсвітка по кожному місцю: чиє натискання світиться (`spotlight.ts`). */
		spot: SpotlightView;
		press: (cell: string, type: PanelCommandType, seat: string, value?: number) => void;
	}

	let { panel, levels, flags, seats, spot, press }: Props = $props();

	const MERGED_KEY = 'panel.merged';
	/** Ключ єдиної панелі, коли всіх звели в одну або коли нікого немає. */
	const ALL = 'all';

	/**
	 * Чи показувати все однією панеллю.
	 *
	 * Памʼять локальна: це вибір про ЦЕЙ екран, як і решта в картці керування.
	 * Читається прямо в оголошенні, без ефекту: `readItem` на сервері мовчки
	 * віддає порожнє, а ефект тут означав би друге джерело правди — сховище й
	 * поле, які розходяться на один такт після кожного перемикання.
	 */
	let merged = $state(readItem(MERGED_KEY) === 'yes');

	const one = $derived(merged || seats.length === 0);

	/** Локатор із ключа місця: у ньому `uid/вкладка`, а скісній у назві не місце. */
	const tid = (key: string) => `info-panel-${key.split('/').join('-')}-section`;
</script>

<div class="wall">
	{#if seats.length > 1}
		<div class="wall__head">
			<Switch
				checked={merged}
				label={t('panel.merge')}
				testid="info-merge-toggle"
				onchange={(next) => {
					merged = next;
					writeItem(MERGED_KEY, next ? 'yes' : 'no');
				}}
			/>
		</div>
	{/if}

	<div class="wall__row" data-testid="info-wall-list">
		{#if one}
			<!--
				Зведена панель показує ВСЮ дошку, а не чийсь пульт: вона одна на всіх,
				і фільтр по чужому вибору зробив би її неповною.
			-->
			<PanelMirror
				{panel}
				{levels}
				{flags}
				sheet={null}
				title=""
				testid={tid(ALL)}
				recent={spot.recent[ALL] ?? null}
				hot={spot.hot[ALL] ?? null}
				press={(cell, type, value) => press(cell, type, ALL, value)}
			/>
		{:else}
			{#each seats as seat (seat.key)}
				<PanelMirror
					{panel}
					{levels}
					{flags}
					sheet={seat.sheet || null}
					title={seat.name || t('panel.someone')}
					away={seat.gone}
					testid={tid(seat.key)}
					recent={spot.recent[seat.key] ?? null}
					hot={spot.hot[seat.key] ?? null}
					press={(cell, type, value) => press(cell, type, seat.key, value)}
				/>
			{/each}
		{/if}
	</div>
</div>

<style>
	.wall {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		min-inline-size: 0;
	}

	.wall__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap) var(--gap-lg);
	}

	/*
	 * Панелі стоять у РЯД і не стискаються: кнопка мусить лишатися кнопкою, у
	 * яку влучає палець, навіть коли їх чотири. Те, що не влізло, їде за край —
	 * на табло дивляться, а не тиснуть наосліп.
	 */
	.wall__row {
		display: flex;
		gap: var(--gap);
		min-inline-size: 0;
		overflow-x: auto;
		padding-bottom: var(--gap-xs);
	}
</style>
