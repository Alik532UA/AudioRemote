<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardPath } from '$lib/board/boardPath';
	import { kindOf } from '$lib/board/myBoards';
	import { ensureBoard } from '$lib/net/board';
	import { trackPresence, watchPresence, type PresenceMap } from '$lib/net/presence';
	import { panelLog } from '$lib/services/panelLog.svelte';
	import { pruneAcks, watchCommands } from '$lib/net/commands';
	import {
		emptyPanel,
		publishPanel,
		publishPanelState,
		publishVerdict,
		watchPanel,
		watchPanelState
	} from '$lib/net/panel';
	import {
		gridOf,
		PANEL_COLS,
		PANEL_ROWS,
		type Panel,
		type PanelCell,
		type PanelCommand,
		type PanelCommandType,
		type VerdictKind
	} from '$lib/net/panelTypes';
	import { applyPanelCommand, refused, type PanelOutcome } from '$lib/panel/apply';
	import { starterPanel } from '$lib/panel/starter';
	import { controlOf, fits, moveTo, sheetsOf, sizeOf, turned, withSize } from '$lib/panel/layout';
	import { keepPanel, recallPanel } from '$lib/panel/keep';
	import { mark } from '$lib/services/breadcrumbs';
	import { attentionState } from '$lib/services/attention.svelte';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import RemoteDialog from '$lib/components/player/RemoteDialog.svelte';
	import { IconPhone } from '$lib/config/icons';
	import PanelBuilder from '$lib/components/panel/PanelBuilder.svelte';
	import PanelWall from '$lib/components/panel/PanelWall.svelte';
	import PanelLog from '$lib/components/panel/PanelLog.svelte';
	import ScreenControls, { type View } from '$lib/components/panel/ScreenControls.svelte';
	import CellDialog from '$lib/components/panel/CellDialog.svelte';
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

	/**
	 * СКІЛЬКИ ЖИВЕ ПІДСВІТКА НА ПАНЕЛІ — три секунди, а не до наступного прохання.
	 *
	 * Доти комірка лишалася підсвіченою назавжди, і через півгодини панель
	 * казала неправду: обведене місце читалося як «просять зараз», хоч просили
	 * його востаннє в першій дії. Журнал відповідає на «що було» і тримає рядок
	 * скільки завгодно; панель відповідає на «що зараз», і «зараз» мусить
	 * минати.
	 */
	const RECENT_MS = 3000;

	let ready = $state(false);
	let helpers = $state(0);
	/** Хто на звʼязку. Потрібен цілим: стіна підписує ним кожен пульт. */
	let present = $state<PresenceMap>({});
	let fatal = $state<TranslationKey | null>(null);
	let view = $state<View>('both');

	let panel = $state<Panel>(emptyPanel());
	let levels = $state<Record<string, number>>({});
	let flags = $state<Record<string, boolean>>({});
	/** Комірка, яку щойно попросили. Гасне сама через `RECENT_MS`. */
	let recent = $state<string | null>(null);
	/** Орган, який щойно натиснули, плюс номер натискання. Спалахує на панелі. */
	let hot = $state<string | null>(null);
	/*
	 * Два лічильники, і обидва НЕ реактивні навмисно: від них не залежить
	 * жодна розмітка. Перший робить кожне натискання відмітним — без нього та
	 * сама кнопка вдруге дала б той самий рядок, і спалах не перезапустився б.
	 * Другий стежить, чия черга гасити підсвітку: натискання на ту саму комірку
	 * за дві секунди мусить дати нові три, а не догоряти старі.
	 */
	let beat = 0;
	let watch = 0;
	let filling = $state(false);
	/** Чи вже пробували підняти панель із копії. Пробуємо один раз. */
	let restored = false;
	/** Режим складання. Поки він увімкнений, сітка показує місця, а не органи. */
	let editing = $state(false);
	/** Яку комірку зараз правлять. Порожньо — вікно закрите. */
	let picked = $state<string | null>(null);
	/** Чи відкрите вікно «як підключити помічника». */
	let inviteOpen = $state(false);

	/*
	 * Ключі окремими сталими, а не рядками в атрибутах.
	 *
	 * Гейт мертвих ключів (`i18n/unused.test.ts`) шукає ключ у КОДІ й бачить
	 * лише одинарні лапки; рядок в атрибуті розмітки повз нього проходить, і
	 * ключ, який перестануть показувати, лишиться у словнику назавжди. Обгортка
	 * `{'…'}` те саме вирішила б, але на ній червоніє `no-useless-mustaches`.
	 */
	const INVITE_TITLE = 'info.connectHelper' as const;
	const INVITE_HOW = 'info.connectHow' as const;
	const INVITE_STEP2 = 'info.connectStep2' as const;

	const empty = $derived(Object.keys(panel.cells).length === 0);
	const sheets = $derived(sheetsOf(panel));

	onMount(() => {
		boardSession.restore();
		attentionState.init();
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
				track(await watchPanel(board.key, (next) => hold(board.key, next)));
				track(
					await watchPanelState(board.key, (state) => {
						levels = state?.levels ?? {};
						flags = state?.flags ?? {};
					})
				);
				/*
				 * Знімок присутності відповідає на два питання одразу: скільки
				 * помічників ЗАРАЗ і коли якийсь із них зʼявився чи відпав. Друге —
				 * робота журналу, тож знімок віддається йому цілим.
				 */
				track(() => panelLog.forget());
				track(
					await watchPresence(board.key, (next) => {
						present = next;
						helpers = panelLog.saw(next);
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
	 * ЗНІМОК ПАНЕЛІ ПРИЇХАВ — показати й ЗАПАМ'ЯТАТИ.
	 *
	 * Копія лягає в браузер щоразу, і саме тому вузол, який зник із бази, не
	 * забирає з собою вечір роботи: панель повертається туди сама. Чому «зник»
	 * і «спорожнили» — різні випадки, сказано в `panel/keep.ts`.
	 *
	 * Повернення робиться ОДИН раз на сторінку: інакше людина, яка щойно
	 * спорожнила панель до нуля комірок, боролася б із власним табло.
	 */
	function hold(key: string, next: Panel | null): void {
		if (next) {
			panel = next;
			keepPanel(key, next);
			return;
		}

		panel = emptyPanel();
		if (restored) return;
		restored = true;

		const kept = recallPanel(key);
		if (kept) void publishPanel(key, { rev: Date.now(), cells: kept.cells });
	}

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

		// Прохання ІЗ ЗАЛИ — і тільки воно гукає: власне натискання людина й так
		// бачить, а екран, що блимає на кожен власний рух, вимикають.
		attentionState.ask();
		remember(result, command, `${command.at}-${command.cell}`, false, command.name ?? '');
		await publishPanelState(board.key, result.next);
		return null;
	}

	/** Що саме натиснули: комірки не досить — у віджеті органів кілька. */
	type Touched = { cell: string; type: PanelCommandType; value?: string | number };

	/**
	 * ПІДСВІТКА НА ПАНЕЛІ ГАСНЕ САМА, і гасить її ОСТАННЄ натискання.
	 *
	 * Лічильник, а не порівняння з коміркою: два прохання на ту саму комірку за
	 * дві секунди дали б два такти, і перший із них погасив би підсвітку
	 * другого через секунду після її появи.
	 */
	function focus(cell: string): void {
		recent = cell;
		const mine = (watch += 1);
		window.setTimeout(() => {
			if (watch === mine) recent = null;
		}, RECENT_MS);
	}

	/**
	 * Записати наслідок: нове положення органів, підсвітка й рядок у журналі.
	 *
	 * Спільне для прохання із зали й для власного натискання — саме тому, що
	 * різниці між ними майже немає. Уся різниця — мітка `own`, і вона потрібна
	 * рівно для того, щоб людина не шукала в залі того, хто попросив, коли
	 * просила вона сама.
	 */
	function remember(
		result: PanelOutcome,
		at: Touched,
		id: string,
		own: boolean,
		who: string
	): void {
		levels = result.next.levels ?? {};
		flags = result.next.flags ?? {};
		focus(at.cell);
		hot = `${controlOf(at.cell, at.type, at.value)}#${(beat += 1)}`;

		// Важливу дію видно навіть тому, хто дивиться не на екран (`panelTypes.ts`).
		if (panel.cells[at.cell]?.important) attentionState.shout();

		panelLog.asked(result.notice, id, own, who);
	}

	/**
	 * ПОСТАВИТИ (або прибрати) КОМІРКУ.
	 *
	 * Пишеться ВСЯ панель одним записом, а не одна комірка: `publishPanel` —
	 * це `set` на весь вузол, і саме так вона й читається помічником. Часткове
	 * оновлення дало б мить, у яку в залі видно панель, якої не існувало
	 * ніколи.
	 *
	 * `rev` іде від годинника: номер редакції потрібен тому, хто колись
	 * правитиме дошку з пульта, а не самому табло.
	 */
	async function putCell(at: string, cell: PanelCell | null) {
		const board = boardSession.current;
		if (!board) return;

		const cells = { ...panel.cells };
		if (cell) cells[at] = cell;
		else delete cells[at];

		try {
			await publishPanel(board.key, { rev: Date.now(), cells });
		} catch (error) {
			fatal = describeError(error);
		}
	}

	/**
	 * ГОСПОДАР НАТИСНУВ САМ — без команди й без квитанції, але В ЖУРНАЛ.
	 *
	 * Команди немає, бо він і так єдиний письменник цього вузла (див.
	 * `panelTypes.ts`): посилати прохання самому собі через журнал команд не
	 * треба, рахунок той самий — `applyPanelCommand`.
	 *
	 * А от рядок у журналі є. Журнал відповідає на «що тут щойно сталося», і
	 * зроблене руками за пультом лишає такий самий слід, як прохання із зали:
	 * інакше картина, за якою потім розбираються, буде з діркою. Мітка `own`
	 * каже, чия це була рука.
	 */
	function own(cell: string, type: PanelCommandType, value?: number) {
		const board = boardSession.current;
		if (!board) return;

		const at = Date.now();
		const result = applyPanelCommand(
			panel,
			{ levels, flags },
			{ by: 'self', type, at, cell, ...(value === undefined ? {} : { value }) }
		);
		if (refused(result)) return;

		remember(result, { cell, type, value }, `self-${at}-${cell}`, true, '');
		void publishPanelState(board.key, result.next);
	}

	/**
	 * ПОВЕРНУТИ ВІДЖЕТ НА МІСЦІ — колесом миші просто над ним.
	 *
	 * Мовчки, якщо в новому повороті місця немає: поворот тиснуть мимохідь, і
	 * повідомлення на кожен рух колеса заважало б більше, ніж допомагало. Хто
	 * хоче знати, чому не вийшло, відкриває віджет — там сказано.
	 */
	async function rotate(at: string) {
		const cell = panel.cells[at];
		if (!cell) return;

		const wanted = turned(sizeOf(cell));
		if (!fits(panel, at, wanted, at)) return;
		await putCell(at, withSize(cell, wanted));
	}

	/**
	 * ПЕРЕТЯГНУЛИ ВІДЖЕТ. Мовчки, якщо так не виходить.
	 *
	 * Перетягування — жест, а не команда: людина бачить, куди тягне, і бачить,
	 * що віджет не поїхав. Повідомлення на кожну невдалу спробу заважало б
	 * більше, ніж допомагало; підсвітка цілі й так каже, що під пальцем.
	 */
	async function shift(at: string, to: string) {
		const board = boardSession.current;
		if (!board) return;

		const cells = moveTo(panel, at, to);
		if (!cells) return;

		try {
			await publishPanel(board.key, { rev: Date.now(), cells });
		} catch (error) {
			fatal = describeError(error);
		}
	}

	/**
	 * ВІДПОВІСТИ НА ПРОХАННЯ — трьома словами, яких досі не було зовсім.
	 *
	 * Помічник у залі досі знав лише те, що вкладка табла відкрита. Чи людина
	 * прохання побачила й чи збирається його виконувати, він не знав ніяк — і
	 * при потребі йшов через усю залу питати вголос.
	 *
	 * Помилку запису тут МОВЧКИ не ковтаємо, але й не валимо екран: відповідь —
	 * це ввічливість, а не команда, і невдала ввічливість не варта того, щоб
	 * звукорежисер посеред вистави читав повідомлення про мережу.
	 */
	function answer(kind: VerdictKind, cell: string, caption: string): void {
		const board = boardSession.current;
		if (!board) return;
		void publishVerdict(board.key, kind, cell, caption);
	}

	/**
	 * Покласти панель цілком — із файлу, зі зміненим розміром, звідки завгодно.
	 *
	 * Розмір пишеться ЛИШЕ коли він не типовий: три на п'ять — це відсутність
	 * полів, а не два числа. Інакше кожна дошка носила б у собі значення за
	 * замовчуванням, і змінити його колись стало б неможливо.
	 */
	async function putPanel(next: Panel): Promise<void> {
		const board = boardSession.current;
		if (!board) return;

		const grid = gridOf(next);
		const own = grid.rows !== PANEL_ROWS || grid.cols !== PANEL_COLS;

		try {
			await publishPanel(board.key, {
				rev: Date.now(),
				...(own ? { rows: grid.rows, cols: grid.cols } : {}),
				cells: next.cells
			});
		} catch (error) {
			fatal = describeError(error);
		}
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
		<!--
			СТІЛ ЗВУКОРЕЖИСЕРА — ТРИ КОЛОНКИ, а не смуга на всю ширину й порожнеча
			під нею.

			Доти шапка тяглася через увесь екран, а під нею лишалося три чверті
			порожнього місця: сітка стояла в лівому кутку, журнал — карткою посеред
			пустки. Кожна з трьох речей на цьому екрані має свою ширину й не має
			жодної причини ділити рядок із рештою: дошка вузька, панель своєї
			форми, журнал — те, що росте й заповнює.
		-->
		<div class="desk" class:desk--one={view !== 'both'}>
			<div class="desk__side">
				<header class="head card desk__who" data-testid="board-head">
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
					ЯК ПОКЛИКАТИ ПОМІЧНИКА — там само, де в плеєра «Підключити пульт».
					Без цієї кнопки дошка була глухим кутом: ідентифікатор на екрані є,
					пароль знає лише той, хто створював, а звідки його взяти вдруге —
					нізвідки. Те саме вікно, ті самі кроки; різне лише слово «помічник»
					і розділ, у якому шукати форму.

					Лише для СВОЄЇ дошки: пароля в чужому записі немає, і показувати
					порожнє вікно нема сенсу.
				-->
						{#if board.password}
							<button
								class="btn btn--sm"
								type="button"
								onclick={() => (inviteOpen = true)}
								data-testid="info-open-remote-btn"
							>
								<IconPhone size={18} aria-hidden="true" />
								{t('info.connectHelper')}
							</button>
						{/if}
					</div>
				</header>

				<ScreenControls
					{view}
					{editing}
					{empty}
					onview={(next) => (view = next)}
					onedit={() => {
						editing = !editing;
						picked = null;
					}}
				/>
			</div>

			<div class="desk__main">
				{#if !ready}
					<p class="card muted" data-testid="info-wait-text">{t('common.loading')}</p>
				{:else if editing}
					<PanelBuilder
						{panel}
						{empty}
						{filling}
						name={board.name || board.id}
						onpick={(cell) => (picked = cell)}
						onrotate={(cell) => void rotate(cell)}
						onmove={(at, to) => void shift(at, to)}
						onfill={fill}
						onload={(next) => void putPanel(next)}
						onresize={(grid) => void putPanel({ ...panel, ...grid })}
					/>
				{:else if empty}
					<!--
				ПАНЕЛІ ЩЕ НЕМАЄ, і сказано про це прямо разом із виходом. Порожня
				сітка без пояснення читається як поломка, а порожній екран — як
				незавантажена сторінка.
			-->
					<section class="card stack" data-testid="info-empty-section">
						<p>{t('info.noPanel')}</p>
						<!--
					ОДИН ВИХІД, А НЕ ДВА. «Скласти типову панель» живе в самому
					складальнику, поруч із сіткою, яку вона заповнить: дві кнопки тут
					питали б у людини, яка ще не бачила жодної комірки, чим типова
					панель відрізняється від власної.
				-->
						<button
							class="btn btn--primary"
							type="button"
							onclick={() => (editing = true)}
							data-testid="info-start-edit-btn"
						>
							{t('panel.edit')}
						</button>
					</section>
				{:else}
					{#if view !== 'log'}
						<PanelWall {panel} {levels} {flags} {sheets} {present} {recent} {hot} press={own} />
					{/if}

					{#if view !== 'panel'}
						<section class="card stack log" data-testid="info-log-section">
							<h2 class="subtitle">{t('panel.logTitle')}</h2>
							<PanelLog notices={panelLog.entries} onverdict={answer} />
						</section>
					{/if}
				{/if}
			</div>
		</div>

		{#if inviteOpen && board.password}
			<RemoteDialog
				id={board.id}
				password={board.password}
				boardKey={board.key}
				route="info"
				title={INVITE_TITLE}
				how={INVITE_HOW}
				step2={INVITE_STEP2}
				search="?kind=info"
				onclose={() => (inviteOpen = false)}
			/>
		{/if}

		{#if picked !== null}
			<CellDialog
				index={picked}
				{panel}
				cell={panel.cells[picked] ?? null}
				onsave={(cell) => void putCell(picked as string, cell)}
				onclose={() => (picked = null)}
			/>
		{/if}
	{/if}
</div>

<style>
	/*
	 * Шапка стовпчиком, а не в два кінці рядка: у вузькій колонці «в два кінці»
	 * означає «майже впритул», і роль злипалася б із лічильником.
	 */
	.desk__who {
		flex-direction: column;
		align-items: stretch;
	}

	.head__side {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--gap-xs);
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

	/*
	 * ДОШКА ВУЗЬКА, РЕШТА ЗАБИРАЄ ЩО ЛИШИЛОСЯ.
	 *
	 * У шапки немає причини бути ширшою за свій вміст: у ній ідентифікатор,
	 * лічильник підказок і три кнопки. Ширина потрібна журналу — саме його
	 * читають через увесь стіл.
	 */
	/* Ліва колонка: дві картки одна під одною — дошка й керування екраном. */
	.desk__side {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	/*
	 * ТАБЛО ВИХОДИТЬ ІЗ ЗАГАЛЬНОЇ МЕЖІ ШИРИНИ — і лише воно.
	 *
	 * `main.page` обмежений 1280 точками, і це правильно для всього, що ЧИТАЮТЬ:
	 * рядок, ширший за цю межу, око читає гірше, бо губить початок наступного.
	 * Табло не читають — на нього дивляться, і кожна зайва точка ширини тут
	 * означає ще один видимий пульт замість ще одного за прокруткою. Заміряно на
	 * 1800: із межею стіні діставалося 480 при потрібних 848, тобто обидві
	 * панелі стояли за краєм на моніторі, де вони вміщаються вдвічі.
	 *
	 * Через `:has()` на власному локаторі, а не класом в оболонці: оболонка не
	 * мусить знати, які сторінки широкі, а сторінка не мусить лізти в її розмітку.
	 */
	:global(main.page:has([data-testid='info-wall-list'])) {
		max-width: none;
	}

	.desk {
		display: grid;
		grid-template-columns: minmax(220px, 20rem) 1fr;
		gap: var(--gap);
		align-items: start;
	}

	/*
	 * УСЕРЕДИНІ — СТІНА ПАНЕЛЕЙ І ЖУРНАЛ ПОРУЧ, і вільне місце дістається СТІНІ.
	 *
	 * Доти було навпаки: панель ≤24rem, журнал забирає решту. Для однієї панелі
	 * це правильно — вона й так не ширша за 26rem, а журнал росте текстом. Для
	 * стіни — ні: панелей стало кілька, вони стоять у ряд, і кожна зайва точка
	 * ширини означає ще один видимий пульт замість ще одного за прокруткою.
	 * Журнал натомість дістав межу: рядок ширший за 26rem читається гірше, бо
	 * око губить початок наступного.
	 */
	.desk__main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(260px, 26rem);
		gap: var(--gap);
		align-items: start;
	}

	.desk--one .desk__main {
		grid-template-columns: 1fr;
	}

	/*
	 * На вузькому екрані колонка одна: три поруч перетворилися б на три смужки,
	 * у кожній з яких не вміщається навіть підпис віджета.
	 */
	@media (max-width: 1099px) {
		.desk,
		.desk__main {
			grid-template-columns: 1fr;
		}
	}

	/* Журнал росте вниз, а не розтягує сусідів: у нього своя прокрутка. */
	/*
	 * КАРТКИ СТОЛУ ПОЧИНАЮТЬСЯ ЗВЕРХУ, а не повисають посеред колонки.
	 *
	 * `.stack` несе `margin-block: auto` — воно для короткої картки входу, яка
	 * на порожньому екрані має стояти посередині. У ряду з панеллю журнал від
	 * цього з'їжджав на півекрана вниз: заголовок «Останні дії» опинявся нижче
	 * за середину панелі, і два сусідні блоки починалися на різній висоті.
	 */
	.desk__main > .card,
	.desk__side > .card {
		margin-block: 0;
	}

	.log {
		max-block-size: min(80dvh, 46rem);
		overflow: auto;
	}

	.subtitle {
		font-size: 1.05rem;
	}
</style>
