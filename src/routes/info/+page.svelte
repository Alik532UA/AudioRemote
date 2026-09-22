<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardPath } from '$lib/board/boardPath';
	import { kindOf } from '$lib/board/myBoards';
	import { ensureBoard } from '$lib/net/board';
	import { trackPresence, watchPresence } from '$lib/net/presence';
	import { panelLog } from '$lib/services/panelLog.svelte';
	import { Roster, type Seat } from '$lib/services/roster';
	import { Spotlight, type SpotlightView } from '$lib/panel/spotlight';
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
		type PanelState,
		type VerdictKind
	} from '$lib/net/panelTypes';
	import { applyPanelCommand, refused, type PanelOutcome } from '$lib/panel/apply';
	import { starterPanel } from '$lib/panel/starter';
	import { controlOf, fits, moveTo, sizeOf, turned, withSize } from '$lib/panel/layout';
	import { keepPanel, recallPanel } from '$lib/panel/keep';
	import { mark } from '$lib/services/breadcrumbs';
	import { attentionState } from '$lib/services/attention.svelte';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import SeatTags from '$lib/components/ui/SeatTags.svelte';
	import RemoteDialog from '$lib/components/player/RemoteDialog.svelte';
	import { IconPhone } from '$lib/config/icons';
	import PanelBuilder from '$lib/components/panel/PanelBuilder.svelte';
	import PanelWall from '$lib/components/panel/PanelWall.svelte';
	import PanelLog from '$lib/components/panel/PanelLog.svelte';
	import ScreenControls from '$lib/components/panel/ScreenControls.svelte';
	import { screenView } from '$lib/services/screenView.svelte';
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
	let fatal = $state<TranslationKey | null>(null);

	let panel = $state<Panel>(emptyPanel());
	let levels = $state<Record<string, number>>({});
	let flags = $state<Record<string, boolean>>({});
	/**
	 * Підсвітка — ПО МІСЦЮ, а не одна на екран: пульт один, а панелей стільки,
	 * скільки помічників, і сенс копії рівно в тому, щоб було видно, ЧИЄ
	 * натискання світиться. Такти й арифметику рахує `spotlight.ts`.
	 */
	let spot = $state<SpotlightView>({ recent: {}, hot: {} });
	const spotlight = new Spotlight((next) => (spot = next), RECENT_MS);
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
	/**
	 * Хто за пультом — по панелі на кожного.
	 *
	 * Список тримає сторінка, бо він реактивний; порядок, витримку на блимання
	 * мережі й тьмяніння зниклих рахує `roster.ts`.
	 */
	let seats = $state<Seat[]>([]);
	const roster = new Roster((next) => (seats = next));

	/**
	 * Які панелі світяться від натискання цього автора.
	 *
	 * Команда несе `uid`, а не вкладку: дві вкладки одного помічника
	 * розрізнити нічим, тож світяться обидві. Це чесніше за вибір навмання, і
	 * трапляється воно рідше, ніж двоє людей із двох телефонів.
	 *
	 * Коли панель одна (звели або нікого немає), світиться саме вона: місця, за
	 * яким стежити, тоді просто немає.
	 */
	const lit = (uid: string): string[] => {
		const mine = seats.filter((seat) => seat.uid === uid).map((seat) => seat.key);
		return mine.length > 0 ? mine : ['all'];
	};

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
				track(() => roster.forget());
				track(() => spotlight.stop());
				track(
					await watchPresence(board.key, (next) => {
						roster.saw(next);
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
		remember(
			result,
			command,
			`${command.at}-${command.cell}`,
			false,
			command.name ?? '',
			lit(command.by)
		);
		await publishPanelState(board.key, { ...result.next, press: pressOf(command) });
		return null;
	}

	/** Що саме натиснули: комірки не досить — у віджеті органів кілька. */
	type Touched = { cell: string; type: PanelCommandType; value?: string | number };

	/**
	 * НАТИСКАННЯ У ВИГЛЯДІ, ЯКИЙ ЇДЕ В БАЗУ — щоб його побачила й зала.
	 *
	 * Рядкове значення сюди не потрапляє: у базі це поле числове (номер кнопки
	 * або крок повзунка), а рядок буває лише в розкладці, яку кожен екран
	 * рахує собі сам.
	 */
	const pressOf = (at: Touched): PanelState['press'] => ({
		cell: at.cell,
		type: at.type,
		...(typeof at.value === 'number' ? { value: at.value } : {})
	});

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
		who: string,
		seats: readonly string[]
	): void {
		levels = result.next.levels ?? {};
		flags = result.next.flags ?? {};
		spotlight.press(at.cell, controlOf(at.cell, at.type, at.value), seats);

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
	function own(cell: string, type: PanelCommandType, seat: string, value?: number) {
		const board = boardSession.current;
		if (!board) return;

		const at = Date.now();
		const result = applyPanelCommand(
			panel,
			{ levels, flags },
			{ by: 'self', type, at, cell, ...(value === undefined ? {} : { value }) }
		);
		if (refused(result)) return;

		remember(result, { cell, type, value }, `self-${at}-${cell}`, true, '', [seat]);
		void publishPanelState(board.key, { ...result.next, press: pressOf({ cell, type, value }) });
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
		<div class="desk">
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
						<SeatTags
							names={[...new Set(seats.filter((seat) => seat.name).map((seat) => seat.name))]}
							testid="info-seats-text"
						/>

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
					{editing}
					{empty}
					onedit={() => {
						editing = !editing;
						picked = null;
					}}
				/>
			</div>

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
				{#if screenView.view !== 'log'}
					<div class="desk__wall">
						<PanelWall {panel} {levels} {flags} {seats} {spot} press={own} />
					</div>
				{/if}

				{#if screenView.view !== 'main'}
					<section class="card stack log" data-testid="info-log-section">
						<PanelLog notices={panelLog.entries} onverdict={answer} />
					</section>
				{/if}
			{/if}
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

	/*
	 * ТРИ КОЛОНКИ, І ВОНИ ПОСЕРЕДИНІ: дошка, панелі, журнал.
	 *
	 * Доти стіна й журнал жили всередині другої колонки сіткою «решта + 26rem».
	 * З однією панеллю це давало діру: панель не ширша за 26rem, решта колонки
	 * лишалася порожньою, і три блоки на широкому екрані тулилися до лівого
	 * краю, а праворуч зяяла третина вікна.
	 *
	 * Тому тут ряд, а не сітка: колонки беруть свою ширину, а вільне місце
	 * ділиться ПОРІВНУ обабіч (`justify-content: center`). На вузькому екрані
	 * той самий ряд переносить їх одна під одну без жодного окремого правила —
	 * три колонки поруч перетворилися б на три смужки, у кожній з яких не
	 * вміщається навіть підпис віджета.
	 */
	.desk {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: start;
		gap: var(--gap);
	}

	.desk__side {
		flex: 0 1 20rem;
		min-inline-size: min(100%, 220px);
	}

	/*
	 * Стіна бере рівно стільки, скільки в ній панелей, і не більше: розтягнута
	 * на вільне місце, вона знову лишала б панель у лівому кутку власної
	 * колонки.
	 */
	.desk__wall {
		flex: 0 1 auto;
		min-inline-size: 0;
	}

	/*
	 * КАРТКИ СТОЛУ БЕЗ ВЛАСНИХ ВІДСТУПІВ — і це про обидві осі.
	 *
	 * `.stack` несе `margin: auto` по обох осях: це для короткої картки входу,
	 * яка сама по собі стоїть посеред порожнього екрана. У ряду поруч із
	 * панеллю кожна з половин цього `auto` шкодить по-своєму.
	 *
	 * ЗВЕРХУ: журнал з'їжджав на півекрана вниз — заголовок «Останні дії»
	 * опинявся нижче за середину панелі, і два сусідні блоки починалися на
	 * різній висоті.
	 *
	 * З БОКІВ: автоматичний відступ у гнучкому ряду з'їдає ВСЕ вільне місце
	 * ДО того, як його ділить `justify-content`. Тобто центрування ряду не
	 * працювало зовсім, і винен був не ряд. Заміряно на 1440: три колонки
	 * (320 + 416 + 416) лишали 224 вільних, журнал забирав їх собі як
	 * `margin-inline: 112px` з кожного боку — і вся трійця тулилася до лівого
	 * краю, а праворуч зяяло 112. Зворотний дослід: повертаємо сюди
	 * `margin-block` замість `margin` — журнал знову від'їжджає праворуч.
	 */
	.desk > .card,
	.desk__side > .card,
	.desk__side :global(.card) {
		margin: 0;
	}

	/* Журнал росте вниз, а не розтягує сусідів: у нього своя прокрутка. */

	.log {
		flex: 0 1 26rem;
		min-inline-size: min(100%, 260px);
		max-block-size: min(80dvh, 46rem);
		overflow: auto;
	}
</style>
