<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardPath } from '$lib/board/boardPath';
	import { kindOf } from '$lib/board/myBoards';
	import { watchInfo } from '$lib/net/board';
	import { hasPlayer, trackPresence, watchPresence } from '$lib/net/presence';
	import { sendCommand, waitForAck } from '$lib/net/commands';
	import { emptyPanel, watchPanel, watchPanelState, watchVerdict } from '$lib/net/panel';
	import {
		MAX_WHO,
		VERDICT_FRESH_MS,
		type Panel,
		type PanelCommandType,
		type PanelVerdict
	} from '$lib/net/panelTypes';
	import { settings } from '$lib/settings/settings.svelte';
	import { controlOf, sheetsOf } from '$lib/panel/layout';
	import { readItem, writeItem } from '$lib/services/storage';
	import { mark } from '$lib/services/breadcrumbs';
	import { attentionState } from '$lib/services/attention.svelte';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import PanelGrid from '$lib/components/panel/PanelGrid.svelte';
	import SheetPicker from '$lib/components/panel/SheetPicker.svelte';
	import VerdictToast from '$lib/components/panel/VerdictToast.svelte';
	import { IconWarning } from '$lib/config/icons';
	import type { BoardInfo } from '$lib/net/boardTypes';

	/**
	 * ПІДКАЗКА — екран помічника в залі.
	 *
	 * Він дивиться на сцену, а в телефон — краєм ока, і натискає наосліп. Тому
	 * на екрані сітка й нічого крім неї: ні списків, ні налаштувань, ні
	 * журналу. Єдине, що додано поруч, — відповідь на питання «а чи дивиться
	 * зараз хтось на табло», бо натискати в порожнечу гірше, ніж не натискати.
	 *
	 * ШАПКА ДОШКИ ТУТ ВУЗЬКА НАВМИСНО. Кожен її рядок — це рядок, якого
	 * бракуватиме сітці: сітка не прокручується, тож усе, що забрала шапка,
	 * забрано в розміру кнопок. Роль пристрою видно в смузі застосунку, назву
	 * дошки — тут, і більше нічого.
	 */
	/** Де лежить вибраний пульт. Один на застосунок: дошка в залі одна. */
	const SHEET_KEY = 'panel.sheet';

	/** Скільки живе підсвітка комірки. Далі панель знову каже «зараз нічого». */
	const RECENT_MS = 3000;
	/** Скільки висить відповідь звукорежисера. */
	const VERDICT_SHOWN_MS = 10000;

	let info = $state<BoardInfo | null>(null);
	let boardOnline = $state(false);
	/** Доки перший знімок присутності не приїхав, «офлайн» означає «ще не знаємо». */
	let presenceKnown = $state(false);
	let fatal = $state<TranslationKey | null>(null);

	let panel = $state<Panel>(emptyPanel());
	let levels = $state<Record<string, number>>({});
	let flags = $state<Record<string, boolean>>({});
	let busy = $state(false);
	/** Що щойно натиснули — підсвічується три секунди й гасне само. */
	let recent = $state<string | null>(null);
	/** Орган, якого торкнулися, плюс номер натискання. Спалахує на панелі. */
	let hot = $state<string | null>(null);
	/*
	 * Лічильники не реактивні навмисно: від них не залежить жодна розмітка.
	 * Перший робить кожне натискання відмітним — без нього та сама кнопка
	 * вдруге не перезапустила б спалах. Другий стежить, чия черга гасити
	 * підсвітку, щоб старий такт не гасив нову.
	 */
	let beat = 0;
	let watch = 0;
	/** Такт, який прибере відповідь з екрана. */
	let told: number | null = null;
	/**
	 * ЩО ВІДПОВІВ ЗВУКОРЕЖИСЕР. `null` — не відповідав або відповідь протухла.
	 *
	 * Свіжість рахується, бо вузол один і живе між виставами: планшет, відкритий
	 * наступного вечора, першим ділом показав би вчорашнє «зроблено» — і воно
	 * виглядало б як відповідь на те, чого ще не просили.
	 */
	let verdict = $state<PanelVerdict | null>(null);
	/** Чому останнє прохання не доїхало. Порожньо — доїхало або ще не тиснули. */
	let trouble = $state<TranslationKey | null>(null);

	const empty = $derived(Object.keys(panel.cells).length === 0);
	const sheets = $derived(sheetsOf(panel));

	/**
	 * ЧИЙ ПУЛЬТ Я ДИВЛЮСЯ. `null` — усі.
	 *
	 * Вибір локальний і переживає перезавантаження: помічник обирає свою
	 * бригаду раз на вечір, а планшет у залі перезапускають частіше, ніж
	 * хотілося б. У дошці цьому не місце — там воно стало б вибором за всіх.
	 */
	let sheet = $state<string | null>(null);

	onMount(() => {
		boardSession.restore();
		// Без цього підпис у журналі лишається порожнім НАЗАВЖДИ: сторінка зали
		// налаштувань не відкриває, а отже й не читає їх нізвідки.
		settings.load();
		sheet = readItem(SHEET_KEY) || null;
		const board = boardSession.current;

		if (!board || kindOf(board) !== 'info' || board.role !== 'remote') {
			void goto(resolve('/menu'));
			return;
		}

		mark('info-remote:start');
		const cleanups: (() => void)[] = [];
		let stopped = false;
		const track = (stop: () => void) => (stopped ? stop() : cleanups.push(stop));

		void (async () => {
			try {
				track(await trackPresence(board.key, 'remote'));
				track(await watchInfo(board.key, (next) => (info = next)));
				track(await watchPanel(board.key, (next) => (panel = next ?? emptyPanel())));
				track(
					await watchPanelState(board.key, (state) => {
						levels = state?.levels ?? {};
						flags = state?.flags ?? {};
					})
				);
				track(
					await watchVerdict(board.key, (next) => {
						// Протухлу відповідь НЕ показуємо: вузол один і живе між
						// виставами, тож планшет, відкритий наступного вечора, першим
						// ділом показав би вчорашнє «зроблено».
						verdict = next && Date.now() - next.at < VERDICT_FRESH_MS ? next : null;
						if (verdict) hold();
					})
				);
				track(
					await watchPresence(board.key, (present) => {
						boardOnline = hasPlayer(present);
						presenceKnown = true;
					})
				);
				mark('info-remote:ready');
			} catch (error) {
				fatal = describeError(error);
			}
		})();

		return () => {
			stopped = true;
			for (const stop of cleanups.splice(0)) stop();
		};
	});

	/**
	 * ПОПРОСИТИ — і дочекатися, що прохання доїхало.
	 *
	 * Чекати обов'язково. Без квитанції кнопка виглядала б однаково і тоді,
	 * коли на табло її побачили, і тоді, коли вкладку табло закрили годину
	 * тому, — а помічник у залі саме на цю різницю й спирається, вирішуючи,
	 * чи бігти через усю залу.
	 *
	 * Надсилається НАМІР, а не нове значення: рахує господар. Чому так —
	 * у `panelTypes.ts`.
	 */
	/**
	 * ВІДПОВІДЬ ЗНИКАЄ САМА, бо це новина, а не стан.
	 *
	 * Смуга, яку треба закрити рукою, коштувала б одного натискання в темряві
	 * щоразу — і висить вона рівно над кнопками. Десять секунд: досить, щоб
	 * підняти очі від сцени, і замало, щоб почати заважати.
	 */
	function hold(): void {
		if (told !== null) window.clearTimeout(told);
		told = window.setTimeout(() => {
			told = null;
			verdict = null;
		}, VERDICT_SHOWN_MS);
	}

	/**
	 * ВІДГУК НА НАТИСКАННЯ — одразу й на місці, ще до відповіді табла.
	 *
	 * Помічник тисне наосліп і не дивиться на екран довше за мить. Чекати з
	 * підсвіткою на квитанцію означало б показувати її тоді, коли він уже
	 * відвів очі; а спалах на самій кнопці — це відповідь на питання «я взагалі
	 * влучив?», і воно не про мережу. Чи доїхало прохання, каже окремий рядок
	 * помилки — там, де про це й питають.
	 */
	function mind(cell: string, type: PanelCommandType, value?: number): void {
		recent = cell;
		hot = `${controlOf(cell, type, value)}#${(beat += 1)}`;
		if (panel.cells[cell]?.important) attentionState.shout();

		const mine = (watch += 1);
		window.setTimeout(() => {
			if (watch === mine) recent = null;
		}, RECENT_MS);
	}

	async function ask(cell: string, type: PanelCommandType, value?: number) {
		const board = boardSession.current;
		if (!board || busy) return;

		busy = true;
		trouble = null;
		mind(cell, type, value);

		try {
			// Підпис їде разом із проханням; порожній не пишеться зовсім —
			// порожнє поле в базі означало б «назвався нічим».
			const who = settings.displayName.trim().slice(0, MAX_WHO);
			const { id } = await sendCommand(boardPath(board.key), type, value, {
				cell,
				...(who ? { name: who } : {})
			});
			const ack = await waitForAck(boardPath(board.key), id);
			if (ack === null) trouble = 'panel.noAck';
			else if (!ack.ok) trouble = (ack.error as TranslationKey) ?? 'error.unknown';
		} catch {
			trouble = 'error.network';
		} finally {
			busy = false;
		}
	}
</script>

<div class="stack hall">
	{#if fatal}
		<Failure reason={fatal} block testid="info-remote-fatal-error" />
	{:else if boardSession.current}
		{@const board = boardSession.current}
		<header class="bar" data-testid="board-head">
			<span class="bar__name">{info?.name || board.id}</span>
			<span class="link" class:link--on={boardOnline} data-testid="link-state">
				<span class="link__dot" aria-hidden="true"></span>
				{boardOnline ? t('info.boardOnline') : t('info.boardOffline')}
			</span>
		</header>

		{#if presenceKnown && !boardOnline}
			<p class="note card" data-testid="info-offline-hint-text">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('info.offlineHint')}</span>
			</p>
		{/if}

		<!--
			ВІДПОВІДЬ ЗВЕРХУ, НАД ПАНЕЛЛЮ: планшет тримають у руці, і внизу екрана
			лежать пальці, а посередині — кнопки, заради яких його й відкрили.
		-->
		<VerdictToast {verdict} />

		{#if trouble}
			<p class="error" role="alert" data-testid="info-trouble-text">{t(trouble)}</p>
		{/if}

		{#if empty}
			<p class="card muted" data-testid="info-remote-empty-text">
				{presenceKnown ? t('info.noPanelRemote') : t('common.loading')}
			</p>
		{:else}
			<SheetPicker
				{sheets}
				value={sheet}
				onpick={(next) => {
					sheet = next;
					writeItem(SHEET_KEY, next ?? '');
				}}
			/>

			<div class="room">
				<PanelGrid {panel} {levels} {flags} {recent} {hot} {busy} {sheet} press={ask} />
			</div>
		{/if}
	{/if}
</div>

<style>
	/*
	 * СІТЦІ ДІСТАЄТЬСЯ ВСЕ, ЩО ЛИШИЛОСЯ, — і рахує це flex, а не арифметика.
	 *
	 * Спокуса написати `calc(100dvh - 7.5rem)` велика, і вона ламається на
	 * першому ж рядку, що з'являється лише іноді: смуга «табло офлайн» або
	 * рядок неполадки зсувають сітку вниз, а віднімання про них не знає — і
	 * низ сітки виїжджає за екран рівно тоді, коли щось пішло не так.
	 *
	 * `min-block-size: 0` обов'язковий: типово flex-елемент не стискається
	 * менше за свій вміст, і сітка розсунула б сторінку замість того, щоб
	 * вписатися в неї.
	 */
	.hall {
		flex: 1;
		min-block-size: 0;
		margin-block: 0;
	}

	/* flex-колонка — умова, яку ставить сама сітка; див. її стилі. */
	.room {
		display: flex;
		flex: 1;
		min-block-size: 0;
	}

	/*
	 * Шапка тут — ОДИН РЯДОК, а не картка: усе, що забрала шапка, забрано в
	 * висоти кнопок, бо сітка не прокручується. Роль пристрою стоїть у смузі
	 * застосунку, тож повторювати її нема потреби.
	 */
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.bar__name {
		font-weight: 600;
	}

	/* Ті самі крапка й кольори, що й на пульті: питання «чи чують мене» одне. */
	.link {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--offline);
		font-size: 0.9rem;
	}

	.link--on {
		color: var(--online);
	}

	.link__dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: currentColor;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--warn);
		font-size: 0.85rem;
	}
</style>
