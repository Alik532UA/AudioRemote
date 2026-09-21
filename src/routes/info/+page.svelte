<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardPath } from '$lib/board/boardPath';
	import { kindOf } from '$lib/board/myBoards';
	import { ensureBoard } from '$lib/net/board';
	import { countRemotes, trackPresence, watchPresence } from '$lib/net/presence';
	import { pruneAcks, watchCommands } from '$lib/net/commands';
	import {
		emptyPanel,
		publishPanel,
		publishPanelState,
		watchPanel,
		watchPanelState
	} from '$lib/net/panel';
	import type { Panel, PanelCommand, PanelCommandType } from '$lib/net/panelTypes';
	import { applyPanelCommand, refused, type PanelNotice } from '$lib/panel/apply';
	import { starterPanel } from '$lib/panel/starter';
	import { mark } from '$lib/services/breadcrumbs';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import PanelGrid from '$lib/components/panel/PanelGrid.svelte';
	import PanelLog from '$lib/components/panel/PanelLog.svelte';
	import type { TranslationKey } from '$lib/i18n/i18n.svelte';

	/**
	 * ТАБЛО — екран того, хто сидить за звуковим пультом.
	 *
	 * Він працює руками й у телефон не дивиться. Тому тут дві половини, і
	 * головна з них — не сітка, а ЖУРНАЛ: сітка відповідає на «що взагалі
	 * можуть попросити», журнал — на «чого просять зараз». Що з них видно,
	 * вирішує сам звукорежисер: за широким пультом місця вистачає на обидві, за
	 * вузьким — ні.
	 *
	 * ЧОМУ ЦЕ НЕ СТОРІНКА ПЛЕЄРА. Спільного в них лише дошка: тут немає ні
	 * папки, ні звуку, ні політики автозапуску, ні черги повторів. Гілка `kind`
	 * усередині плеєра означала б, що кожна наступна правка звуку мусить
	 * питати, чи вона не про табло.
	 */
	type View = 'both' | 'panel' | 'log';
	const VIEWS: readonly View[] = ['both', 'panel', 'log'];

	/** Скільки прохань тримати на екрані. Далі найстаріші випадають. */
	const KEPT = 40;

	let ready = $state(false);
	let helpers = $state(0);
	let fatal = $state<TranslationKey | null>(null);
	let view = $state<View>('both');

	let panel = $state<Panel>(emptyPanel());
	let levels = $state<Record<string, number>>({});
	let flags = $state<Record<string, boolean>>({});
	/** Комірка, яку щойно попросили. Підсвічується, доки не прийде наступна. */
	let recent = $state<string | null>(null);
	let notices = $state<(PanelNotice & { id: string; at: number })[]>([]);
	let filling = $state(false);

	const empty = $derived(Object.keys(panel.cells).length === 0);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;

		/*
		 * У МЕНЮ, а не в корінь: корінь — стрілочник, і за налаштуванням він
		 * відправив би сюди знову, по колу. Чужий вид дошки — те саме: аудіодошка
		 * на цьому екрані не має ні панелі, ні сенсу.
		 */
		if (!board || kindOf(board) !== 'info' || board.role !== 'player') {
			void goto(resolve('/menu'));
			return;
		}

		mark('info:start');
		const cleanups: (() => void)[] = [];
		let stopped = false;
		const track = (stop: () => void) => (stopped ? stop() : cleanups.push(stop));

		void (async () => {
			try {
				await ensureBoard(board.key, board.name);
				await pruneAcks(boardPath(board.key));
				track(await trackPresence(board.key, 'player'));
				track(await watchPanel(board.key, (next) => (panel = next ?? emptyPanel())));
				track(
					await watchPanelState(board.key, (state) => {
						levels = state?.levels ?? {};
						flags = state?.flags ?? {};
					})
				);
				track(
					await watchPresence(board.key, (present) => {
						helpers = countRemotes(present);
					})
				);
				track(await watchCommands<PanelCommandType, PanelCommand>(boardPath(board.key), receive));
				ready = true;
				mark('info:ready');
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
	 * ПРОХАННЯ ПРИЙШЛО.
	 *
	 * Рахує його господар, а не той, хто натиснув, — і саме тому нове положення
	 * пишеться звідси. Чому так, а не навпаки, сказано в `panelTypes.ts`: вузол
	 * зі станом мусить мати одного письменника, інакше правило доступу
	 * неможливо звузити.
	 *
	 * Стан оновлюється СИНХРОННО, до запису в базу: два прохання поспіль
	 * рахуються від того, що вже показано, а не обидва від старого значення.
	 */
	async function receive(command: PanelCommand): Promise<string | null> {
		const board = boardSession.current;
		if (!board) return 'error.unknown';

		const result = applyPanelCommand(panel, { levels, flags }, command);
		if (refused(result)) return result;

		levels = result.next.levels ?? {};
		flags = result.next.flags ?? {};
		recent = command.cell;
		notices = [
			{ ...result.notice, id: `${command.at}-${command.cell}`, at: Date.now() },
			...notices
		].slice(0, KEPT);

		await publishPanelState(board.key, result.next);
		return null;
	}

	/** Скласти типову панель — рівно ті комірки, з яких починають у залі. */
	async function fill() {
		const board = boardSession.current;
		if (!board || filling) return;
		filling = true;
		try {
			await publishPanel(board.key, starterPanel());
		} catch (error) {
			fatal = describeError(error);
		} finally {
			filling = false;
		}
	}
</script>

<div class="stack stack--wide">
	{#if fatal}
		<Failure reason={fatal} block testid="info-fatal-error" />
	{:else if boardSession.current}
		{@const board = boardSession.current}
		<header class="head card" data-testid="board-head">
			<div class="head__who">
				<h1 class="head__role" data-testid="board-role-title">{t('info.boardTitle')}</h1>
				{#if board.name}
					<p class="head__title">{board.name}</p>
				{/if}
				<p class="muted mono">{board.id}</p>
			</div>
			<div class="head__side">
				<p class="muted" data-testid="info-helpers-count">
					{t('info.helpers', { count: `${helpers}` })}
				</p>

				<!--
					Вибір стоїть у шапці, а не над сіткою: це не дія над панеллю, а
					налаштування ЦЬОГО екрана. За широким пультом видно обидві половини,
					за вузьким доводиться обирати.
				-->
				<div class="views" role="group" aria-label={t('panel.viewTitle')}>
					{#each VIEWS as which (which)}
						<button
							class="views__item"
							type="button"
							aria-pressed={view === which}
							onclick={() => (view = which)}
							data-testid="info-view-{which}-btn"
						>
							{t(`panelView.${which}`)}
						</button>
					{/each}
				</div>
			</div>
		</header>

		{#if !ready}
			<p class="card muted" data-testid="info-wait-text">{t('common.loading')}</p>
		{:else if empty}
			<!--
				ПАНЕЛІ ЩЕ НЕМАЄ, і сказано про це прямо разом із виходом. Порожня
				сітка без пояснення читається як поломка, а порожній екран — як
				незавантажена сторінка.
			-->
			<section class="card stack" data-testid="info-empty-section">
				<p>{t('info.noPanel')}</p>
				<button
					class="btn btn--primary"
					type="button"
					disabled={filling}
					onclick={fill}
					data-testid="info-fill-btn"
				>
					{filling ? t('common.loading') : t('info.fillStarter')}
				</button>
			</section>
		{:else}
			<div class="halves" class:halves--one={view !== 'both'}>
				{#if view !== 'log'}
					<section class="card mirror" data-testid="info-panel-section">
						<!-- Дзеркало: господар бачить те саме, але не тисне за помічника. -->
						<PanelGrid {panel} {levels} {flags} {recent} />
					</section>
				{/if}

				{#if view !== 'panel'}
					<section class="card stack" data-testid="info-log-section">
						<h2 class="subtitle">{t('panel.logTitle')}</h2>
						<PanelLog {notices} />
					</section>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.head__side {
		display: flex;
		flex-direction: column;
		align-items: end;
		gap: var(--gap-xs);
	}

	/* Вибір виду — три кнопки без власних рамок у спільній, як у налаштуваннях. */
	.views {
		display: flex;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.views__item {
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 0;
		border-inline-start: 1px solid var(--border);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: 0.85rem;
	}

	.views__item:first-child {
		border-inline-start: 0;
	}

	.views__item[aria-pressed='true'] {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	/*
	 * Дві половини поруч на пульті, одна під одною на телефоні. Журнал
	 * розтягується, сітка — ні: у неї є власне відношення сторін.
	 */
	/*
	 * ДЗЕРКАЛО НИЖЧЕ ЗА СІТКУ В ЗАЛІ, і це навмисно.
	 *
	 * Тут на нього не тиснуть — на нього дивляться, щоб зрозуміти, звідки
	 * прилетіло прохання. Журнал поруч важливіший, і віддавати йому пів екрана
	 * заради більших кнопок, яких ніхто не натисне, нема сенсу.
	 */
	.mirror {
		display: flex;
		/*
		 * Заміряно на 1280×900: при `min(60dvh, 30rem)` кнопка в дзеркалі виходила
		 * 89×18 — підпис у ній ще вміщався, але прочитати його з відстані, на якій
		 * сидять за пультом, уже не виходило. Ця пара чисел дає 89×26.
		 */
		block-size: min(70dvh, 38rem);
	}

	.halves {
		display: grid;
		grid-template-columns: minmax(240px, 22rem) 1fr;
		gap: var(--gap);
		align-items: start;
	}

	.halves--one {
		grid-template-columns: 1fr;
	}

	@media (max-width: 899px) {
		.halves {
			grid-template-columns: 1fr;
		}
	}

	.subtitle {
		font-size: 1.05rem;
	}
</style>
