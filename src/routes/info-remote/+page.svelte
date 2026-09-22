<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardPath } from '$lib/board/boardPath';
	import { kindOf } from '$lib/board/myBoards';
	import { watchInfo } from '$lib/net/board';
	import { hasPlayer, tellPresence, trackPresence, watchPresence } from '$lib/net/presence';
	import { sendCommand, waitForAck } from '$lib/net/commands';
	import { emptyPanel, watchPanel, watchPanelState, watchVerdict } from '$lib/net/panel';
	import {
		MAX_WHO,
		VERDICT_FRESH_MS,
		type Panel,
		type PanelCommandType,
		type PanelState,
		type PanelVerdict
	} from '$lib/net/panelTypes';
	import { settings } from '$lib/settings/settings.svelte';
	import { controlOf, sheetsOf } from '$lib/panel/layout';
	import { readItem, writeItem } from '$lib/services/storage';
	import { mark } from '$lib/services/breadcrumbs';
	import { attentionState } from '$lib/services/attention.svelte';
	import { describeError } from '$lib/net/describeError';
	import Blocker from '$lib/components/ui/Blocker.svelte';
	import Failure from '$lib/components/ui/Failure.svelte';
	import PanelGrid from '$lib/components/panel/PanelGrid.svelte';
	import SheetPicker from '$lib/components/panel/SheetPicker.svelte';
	import VerdictToast from '$lib/components/panel/VerdictToast.svelte';
	import PanelLog from '$lib/components/panel/PanelLog.svelte';
	import { applyPanelCommand, refused } from '$lib/panel/apply';
	import { panelLog } from '$lib/services/panelLog.svelte';
	import { connect } from '$lib/net/firebase';
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

	/**
	 * Табло закрите — і тоді на панелі не працює жодна кнопка.
	 *
	 * `presenceKnown` — щоб не лякати завчасно: доки перший знімок присутності
	 * не приїхав, «офлайн» означає лише «ще не знаємо».
	 */
	const blocked = $derived(presenceKnown && !boardOnline);
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
	/** Серверна мітка стану, який уже показали. */
	let seenAt = 0;
	/**
	 * Чи приходив хоч один знімок стану. Перший мовчить: вузол живе між
	 * виставами, і планшет, відкритий наступного вечора, блимнув би вчорашнім.
	 */
	let warm = false;
	/**
	 * ВЛАСНИЙ `uid` — щоб упізнати в журналі СВОЮ руку.
	 *
	 * Натискання повертається з табла тим самим шляхом, що й чуже, і з боку
	 * зали вони нічим не відрізняються. Порівняння з власним `uid` — єдине, що
	 * їх розводить: підпис може збігтися, вкладка може бути друга.
	 */
	let me = '';
	/** Такт, який гасить підсвітку. Знімається при виході — інакше пише в мертве. */
	let fade: number | null = null;
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
				// Імʼя й пульт їдуть разом із присутністю: інакше табло не має
				// звідки дізнатися, хто за яким пультом сидить (`presence.ts`).
				track(
					await trackPresence(board.key, 'remote', {
						name: settings.displayName,
						sheet: sheet ?? ''
					})
				);
				me = (await connect()).uid;
				track(() => panelLog.forget());
				track(await watchInfo(board.key, (next) => (info = next)));
				track(await watchPanel(board.key, (next) => (panel = next ?? emptyPanel())));
				track(
					await watchPanelState(board.key, (state) => {
						levels = state?.levels ?? {};
						flags = state?.flags ?? {};
						echo(state);
					})
				);
				track(
					await watchVerdict(board.key, (next) => {
						// Протухлу відповідь НЕ показуємо: вузол один і живе між
						// виставами, тож планшет, відкритий наступного вечора, першим
						// ділом показав би вчорашнє «зроблено».
						verdict = next && Date.now() - next.at < VERDICT_FRESH_MS ? next : null;
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
			if (fade !== null) window.clearTimeout(fade);
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
	 * ВІДГУК НА НАТИСКАННЯ — одразу й на місці, ще до відповіді табла.
	 *
	 * Помічник тисне наосліп і не дивиться на екран довше за мить. Чекати з
	 * підсвіткою на квитанцію означало б показувати її тоді, коли він уже
	 * відвів очі; а спалах на самій кнопці — це відповідь на питання «я взагалі
	 * влучив?», і воно не про мережу. Чи доїхало прохання, каже окремий рядок
	 * помилки — там, де про це й питають.
	 */
	function mind(cell: string, type: PanelCommandType, value?: number, own = true): void {
		recent = cell;
		hot = `${controlOf(cell, type, value)}#${(beat += 1)}`;
		/*
		 * Гукає лише СВОЄ натискання. Спалах на весь екран — це «подивіться
		 * сюди», і від чужої руки в залі він означав би «подивіться на те, що
		 * вже зробили без вас».
		 */
		if (own && panel.cells[cell]?.important) {
			const target = panel.cells[cell];
			const buttonColor =
				target?.kind === 'buttons' && type === 'press' && typeof value === 'number'
					? target.buttons?.[value]?.color
					: undefined;
			attentionState.shout(buttonColor ?? target?.color ?? null);
		}

		const mine = (watch += 1);
		if (fade !== null) window.clearTimeout(fade);
		fade = window.setTimeout(() => {
			fade = null;
			if (watch === mine) recent = null;
		}, RECENT_MS);
	}

	/**
	 * ЧУЖЕ НАТИСКАННЯ — ТАК САМО ВИДНО, як своє.
	 *
	 * Доти зв'язок був однобічний: прохання із зали світилося на таблі, а
	 * зроблене за пультом до зали не доїжджало ніяк. Помічник бачив лише
	 * наслідок — і то не завжди: кнопка наслідку не лишає взагалі, тобто
	 * натискання за пультом для зали просто не існувало.
	 *
	 * ПЕРШИЙ ЗНІМОК МОВЧИТЬ. Вузол стану живе між виставами, і планшет,
	 * відкритий наступного вечора, першим ділом блимнув би вчорашнім
	 * натисканням — так само, як показав би вчорашню відповідь, якби її не
	 * стерегла свіжість.
	 *
	 * Своє натискання відблискує вдруге, і це не вада: перший спалах — «я
	 * влучив», другий — «табло це прийняло». Обидва відповідають на різні
	 * питання, і саме другого доти не було ні в якому вигляді.
	 */
	function echo(state: PanelState | null): void {
		const at = state?.atServer ?? 0;
		/*
		 * «Перший знімок» — це ПЕРШИЙ ВИКЛИК, а не «мітка ще нульова». Дошка, на
		 * якій сьогодні ще нічого не тиснули, віддає `null`, і мітка лишається
		 * нулем; перевірка по нулю з'їдала б тоді й перше справжнє натискання —
		 * тобто саме той випадок, заради якого все це й робиться.
		 */
		const fresh = warm && state?.press && at > seenAt;
		const was = { levels, flags };
		warm = true;
		seenAt = at;
		if (!fresh || !state?.press) return;

		const { cell, type, value, by, name, desk } = state.press;
		mind(cell, type, value, false);

		/*
		 * Рядок журналу рахується з ПОПЕРЕДНЬОГО положення органів: повідомлення
		 * каже «було 50 — стало 60», а знімок, що приїхав, несе вже «стало».
		 * Той самий `applyPanelCommand`, що й на таблі, — інакше два журнали на
		 * одну подію розійшлися б у словах.
		 */
		const result = applyPanelCommand(panel, was, {
			by: by ?? '',
			type,
			at,
			cell,
			...(value === undefined ? {} : { value })
		});
		if (refused(result)) return;
		panelLog.asked(
			result.notice,
			`echo-${at}-${cell}`,
			Boolean(by) && by === me,
			desk ? '' : (name ?? ''),
			desk
		);
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
		{#if blocked}
			<Blocker testid="info-offline-hint" text={t('info.offlineHint')} />
		{/if}

		<!--
			`display: contents` — щоб `inert` дістався всьому вмісту, не змінивши
			жодного відступу: обгортка потрібна атрибутові, а не розкладці.
		-->
		<div class="hall__body" inert={blocked}>
			<!--
			СПОВІЩЕННЯ ЛЕЖАТЬ НАД СТОРІНКОЮ, А НЕ В НІЙ.

			Доти відповідь звукорежисера й рядок помилки стояли в потоці над
			панеллю — і поява кожного зсувала панель униз рівно на свою висоту.
			Тобто в мить, коли помічник дивиться на екран найуважніше (щойно
			попросив і чекає), кнопки під його пальцем від'їжджають, і наступне
			натискання йде не туди. Зникнення смуги через кілька секунд зсуває
			їх назад — удруге й так само раптово.

			ЗВЕРХУ, А НЕ ЗНИЗУ: планшет тримають у руці, і внизу екрана лежать
			пальці. ПІД СМУГОЮ ЗАСТОСУНКУ, а не поверх неї: накрити «Назад»
			означало б зробити зі сповіщення пастку — те саме правило, що й у
			`Blocker`.
		-->
			<div class="notes">
				<VerdictToast {verdict} shownMs={VERDICT_SHOWN_MS} ondone={() => (verdict = null)} />

				{#if trouble}
					<p class="error" role="alert" data-testid="info-trouble-text">{t(trouble)}</p>
				{/if}
			</div>

			<div class="desk">
				<header class="bar" data-testid="board-head">
					<span class="bar__name">{info?.name || board.id}</span>
					<span class="link" class:link--on={boardOnline} data-testid="link-state">
						<span class="link__dot" aria-hidden="true"></span>
						{boardOnline ? t('info.boardOnline') : t('info.boardOffline')}
					</span>
				</header>

				{#if empty}
					<p class="card muted" data-testid="info-remote-empty-text">
						{presenceKnown ? t('info.noPanelRemote') : t('common.loading')}
					</p>
				{:else}
					<div class="mid">
						<SheetPicker
							{sheets}
							value={sheet}
							onpick={(next) => {
								sheet = next;
								writeItem(SHEET_KEY, next ?? '');
								const board = boardSession.current;
								if (board) {
									void tellPresence(board.key, { name: settings.displayName, sheet: next ?? '' });
								}
							}}
						/>

						<div class="room">
							<PanelGrid {panel} {levels} {flags} {recent} {hot} {busy} {sheet} press={ask} />
						</div>
					</div>

					<!--
						ЖУРНАЛ І В ЗАЛІ ТЕЖ. Доти в помічника не було відповіді на «що тут
						щойно сталося»: він бачив лише власне натискання, та й те мить.
						Тепер кожне натискання приїжджає станом (`panelState.press`), тож
						рядок збирається з того ж джерела, що й підсвітка, — і журнал
						виходить той самий, що за пультом, лише без кнопок відповіді: у
						залі відповідати нема на що.
					-->
					<section class="card stack log" data-testid="info-remote-log-section">
						<PanelLog notices={panelLog.entries} />
					</section>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/*
	 * СМУГА СПОВІЩЕНЬ — ФІКСОВАНА, І ВОНА НЕ ЛОВИТЬ НАТИСКАНЬ.
	 *
	 * `fixed` знімає сповіщення з потоку: панель більше не стрибає ні від
	 * появи смуги, ні від її зникнення. Починається смуга під шапкою —
	 * `--bar-h` заміряє оболонка, бо на вузькому екрані шапка переносить
	 * кнопки й сталого числа тут немає.
	 *
	 * `pointer-events: none` на самій смузі обов'язковий: порожня вона тягнеться
	 * через усю ширину, і без цього з'їдала б натискання по панелі під собою —
	 * тобто ламала б рівно те, заради чого сторінку відкривають. Самі
	 * сповіщення події приймають: смуга відповіді ставить відлік на паузу,
	 * поки її тримають пальцем.
	 *
	 * `z-index` нижчий за шапку (у неї 20) — з тієї самої причини, що в
	 * `Blocker`: вихід лишається відкритим завжди.
	 */
	.notes {
		position: fixed;
		inset-inline: 16px;
		top: calc(var(--bar-h, 3.25rem) + var(--gap-sm));
		z-index: 15;
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		max-inline-size: 32rem;
		margin-inline: auto;
		pointer-events: none;
	}

	.notes > :global(*) {
		pointer-events: auto;
		box-shadow: 0 8px 24px var(--shadow-strong);
	}

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

	/*
	 * Обгортка існує лише заради `inert`, тож у розкладці її немає зовсім:
	 * діти лишаються прямими елементами колонки, і сітка так само дістає все
	 * вільне місце.
	 */
	.hall__body {
		display: contents;
	}

	/* flex-колонка — умова, яку ставить сама сітка; див. її стилі. */
	.room {
		display: flex;
		flex: 1;
		min-block-size: 0;
	}

	/*
	 * ТЕЛЕФОН ЛИШАЄТЬСЯ ЯК БУВ: `display: contents` — і жодного сліду в
	 * розкладці. Там екран належить сітці, і будь-яка друга колонка забирає
	 * висоту в кнопок, які тиснуть наосліп.
	 */
	.desk,
	.mid {
		display: contents;
	}

	.log {
		display: none;
	}

	/*
	 * КОМП'ЮТЕР: ТА САМА РОЗКЛАДКА, ЩО В ТАБЛА.
	 *
	 * Доти в помічника за комп'ютером був лише пульт — половина порожнього
	 * екрана й жодної відповіді на «що тут щойно сталося», хоч за пультом та
	 * сама дошка показує це третьою колонкою. Людина ходить між двома екранами
	 * одного вечора, і дві різні розкладки на один предмет означають, що на
	 * кожному треба наново шукати, де тут що.
	 *
	 * Межа 900 — та сама, з якої дошка стає дво- й трипільною
	 * (`base.css`): одна відповідь на «чи це вже не телефон» на весь застосунок.
	 */
	@media (min-width: 900px) {
		/*
		 * СТОРІНКА ВИХОДИТЬ ІЗ МЕЖІ ЧИТАНОЇ ШИРИНИ — з тієї самої причини, що й
		 * табло. `.stack` тримає 760 точок, і це правильно для тексту: рядок,
		 * ширший за цю межу, око читає гірше. Панель не читають — на неї
		 * дивляться й у неї цілять пальцем, і кожна зайва точка ширини тут
		 * означає більшу кнопку. Заміряно на 1440: із межею панелі діставалося
		 * 222 точки з 1408, тобто колонка вужча за власну назву.
		 */
		.hall {
			max-inline-size: none;
		}

		.desk {
			display: flex;
			flex: 1;
			gap: var(--gap);
			align-items: stretch;
			min-block-size: 0;
		}

		.mid {
			display: flex;
			flex: 1 1 auto;
			flex-direction: column;
			gap: var(--gap);
			min-inline-size: 0;
		}

		/* Сітка бере свою ширину й стоїть посеред колонки, а не в лівому кутку. */
		.room {
			flex: 1 1 auto;
			justify-content: center;
			min-inline-size: 0;
		}

		.bar {
			flex: 0 1 16rem;
			flex-direction: column;
			align-items: start;
			align-self: start;
			padding: var(--gap-sm) var(--gap);
			border: 1px solid var(--border);
			border-radius: var(--radius);
			background: var(--bg-surface);
		}

		.log {
			display: flex;
			flex: 0 1 26rem;
			min-inline-size: min(100%, 260px);
			margin: 0;
			overflow: auto;
		}
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
</style>
