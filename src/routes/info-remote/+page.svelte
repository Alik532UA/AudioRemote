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
	import { emptyPanel, watchPanel, watchPanelState } from '$lib/net/panel';
	import type { Panel, PanelCommandType } from '$lib/net/panelTypes';
	import { mark } from '$lib/services/breadcrumbs';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import PanelGrid from '$lib/components/panel/PanelGrid.svelte';
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
	let info = $state<BoardInfo | null>(null);
	let boardOnline = $state(false);
	/** Доки перший знімок присутності не приїхав, «офлайн» означає «ще не знаємо». */
	let presenceKnown = $state(false);
	let fatal = $state<TranslationKey | null>(null);

	let panel = $state<Panel>(emptyPanel());
	let levels = $state<Record<string, number>>({});
	let flags = $state<Record<string, boolean>>({});
	let busy = $state(false);
	/** Що щойно натиснули — підсвічується, доки не натиснуть наступне. */
	let recent = $state<string | null>(null);
	/** Чому останнє прохання не доїхало. Порожньо — доїхало або ще не тиснули. */
	let trouble = $state<TranslationKey | null>(null);

	const empty = $derived(Object.keys(panel.cells).length === 0);

	onMount(() => {
		boardSession.restore();
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
	async function ask(cell: string, type: PanelCommandType, value?: number) {
		const board = boardSession.current;
		if (!board || busy) return;

		busy = true;
		trouble = null;
		recent = cell;

		try {
			const { id } = await sendCommand(boardPath(board.key), type, value, { cell });
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

		{#if trouble}
			<p class="error" role="alert" data-testid="info-trouble-text">{t(trouble)}</p>
		{/if}

		{#if empty}
			<p class="card muted" data-testid="info-remote-empty-text">
				{presenceKnown ? t('info.noPanelRemote') : t('common.loading')}
			</p>
		{:else}
			<div class="room">
				<PanelGrid {panel} {levels} {flags} {recent} {busy} live onpress={ask} />
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
