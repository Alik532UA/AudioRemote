<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Panel, PanelCommandType } from '$lib/net/panelTypes';
	import type { PresenceMap } from '$lib/net/presence';
	import { readItem, writeItem } from '$lib/services/storage';
	import Switch from '$lib/components/ui/Switch.svelte';
	import PanelMirror from './PanelMirror.svelte';

	/**
	 * ПО ПАНЕЛІ НА КОЖЕН ПУЛЬТ — усі одразу, а не по черзі.
	 *
	 * Доти табло показувало ОДНУ панель із перемикачем: щоб побачити, що може
	 * попросити другий помічник, доводилося перемкнутися й забути перше. Це
	 * рівно те саме, від чого пішли в залі, тільки з іншого боку: звукорежисер
	 * тримав у голові чужу розкладку замість того, щоб її бачити.
	 *
	 * ## Ключ — ПУЛЬТ, а не людина
	 *
	 * Спокуса малювати по панелі на кожну підключену вкладку сильна й
	 * неправильна. Присутність тримається на `onDisconnect`, тобто зникає від
	 * блимання Wi-Fi; панель, що зникає, коли помічник вийшов у коридор, — це
	 * панель, у яку не може натиснути й сам звукорежисер, а він тисне (див.
	 * `PanelGrid`). Двоє на одній роботі дали б дві однакові панелі, а той, хто
	 * не обрав пульта, — повну копію дошки поруч із її ж частинами.
	 *
	 * Тому пульти задають РОЗКЛАДКУ, а присутність — лише підпис під назвою:
	 * «світло — Оля», «завіса — нікого». Перше стабільне, друге живе.
	 *
	 * ## Спільні віджети повторюються в кожній панелі
	 *
	 * «Стоп» і «готові» бачить кожен у залі, тож і тут вони стоять у кожній
	 * панелі. Окрема панель «спільні» економила б місце ціною головного: екран
	 * табла перестав би збігатися з екраном помічника, у якого ці кнопки стоять
	 * у його ж сітці.
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
		/** Назви пультів, які трапляються в панелі. Порожньо — панель одна. */
		sheets: readonly string[];
		present: PresenceMap;
		recent: string | null;
		hot: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let { panel, levels, flags, sheets, present, recent, hot, press }: Props = $props();

	const MERGED_KEY = 'panel.merged';

	/**
	 * Чи показувати все однією панеллю.
	 *
	 * Памʼять локальна: це вибір про ЦЕЙ екран, як і решта в картці керування.
	 * Типово вимкнено — дошка без названих пультів однаково дає одну панель, тож
	 * для старих дощок нічого не змінилося.
	 *
	 * Читається прямо в оголошенні, без ефекту: `readItem` на сервері мовчки
	 * віддає порожнє, а ефект тут означав би друге джерело правди — сховище й
	 * поле, які розходяться на один такт після кожного перемикання.
	 */
	let merged = $state(readItem(MERGED_KEY) === 'yes');

	/** Хто зараз за цим пультом. Порожньо — нікого, і це теж відповідь. */
	function whoOn(sheet: string): string[] {
		const names: string[] = [];
		for (const tabs of Object.values(present)) {
			for (const entry of Object.values(tabs ?? {})) {
				if (entry.role !== 'remote') continue;
				if ((entry.sheet ?? '') !== sheet) continue;
				names.push(entry.name?.trim() || t('panel.someone'));
			}
		}
		return names;
	}

	/** Скільки помічників дивиться всю дошку, не обравши пульта. */
	const roaming = $derived(whoOn('').length);
</script>

<div class="wall">
	{#if sheets.length > 0}
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

			<!--
				Хто НЕ обрав пульта, бачить усю дошку — тобто його екран не збігається
				з жодною панеллю тут. Сказати про це треба: інакше звукорежисер
				вирішить, що всі троє сидять по своїх пультах.
			-->
			{#if roaming > 0}
				<p class="muted" data-testid="info-roaming-text">
					{t('panel.roaming', { count: `${roaming}` })}
				</p>
			{/if}
		</div>
	{/if}

	<div class="wall__row" data-testid="info-wall-list">
		{#if merged || sheets.length === 0}
			<PanelMirror {panel} {levels} {flags} {recent} {hot} {press} sheet={null} title="" who={[]} />
		{:else}
			{#each sheets as name (name)}
				<PanelMirror
					{panel}
					{levels}
					{flags}
					{recent}
					{hot}
					{press}
					sheet={name}
					title={name}
					who={whoOn(name)}
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
	 * яку влучає палець, навіть коли пультів чотири. Те, що не влізло, їде за
	 * край — на табло дивляться, а не тиснуть наосліп.
	 */
	.wall__row {
		display: flex;
		gap: var(--gap);
		min-inline-size: 0;
		overflow-x: auto;
		padding-bottom: var(--gap-xs);
	}
</style>
