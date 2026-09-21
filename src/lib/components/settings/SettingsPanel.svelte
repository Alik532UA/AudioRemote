<!--
	НАЛАШТУВАННЯ — КОМПОНЕНТ, А НЕ ЛИШЕ СТОРІНКА.

	Причина в тому, що переходом на окрему сторінку коштувало забагато. У
	браузері сторінка приймача, яку покинули, втрачає дескриптор теки — тобто
	повернення з налаштувань означало «оберіть папку заново». А ще вона грає
	музику: піти з неї посеред заняття, щоб змінити гучність за замовчуванням,
	не можна.

	Тому той самий вміст показується і сторінкою (`/settings` — пряме посилання
	лишається), і вікном поверх поточної (`SettingsDialog`). Дублювати його в
	двох місцях не можна: налаштування — саме те, що розходиться тихо.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import DiagnosticsTrail from './DiagnosticsTrail.svelte';
	import HardResetButton from './HardResetButton.svelte';
	import MusicFolderCard from './MusicFolderCard.svelte';
	import ContactCard from './ContactCard.svelte';
	import AutoStartSwitch from './AutoStartSwitch.svelte';
	import { IconCheck, IconDice, IconTrash, IconWarning } from '$lib/config/icons';
	import { i18n, LOCALES, t, type Locale } from '$lib/i18n/i18n.svelte';
	import {
		makeBoardId,
		makePassword,
		normalizeBoardId,
		normalizePassword
	} from '$lib/board/secret';
	import { MAX_NAME, settings } from '$lib/settings/settings.svelte';
	import {
		START_BOARDS,
		START_PAGES,
		type StartBoard,
		type StartPage
	} from '$lib/settings/startPage.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';
	import { isEmulator } from '$lib/net/firebase';

	const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' };

	/**
	 * Чи це збірка для розробки.
	 *
	 * `import.meta.env.DEV` — прапорець Vite, який стає літералом на складанні,
	 * тож у бойовій збірці гілка під ним не лишається навіть кодом. Це не
	 * налаштування й не змінна конфігу: питання тут одне — «нас зараз
	 * розробляють».
	 */
	const DEV = import.meta.env.DEV;

	let boardId = $state('');
	let password = $state('');
	/** Пара «певної дошки» для запуску. Зберігається окремою кнопкою. */
	let pinnedId = $state('');
	let pinnedPassword = $state('');
	let saved = $state(false);
	let pinnedSaved = $state(false);

	onMount(() => {
		settings.load();
		boardId = settings.fixedBoardId;
		password = settings.fixedPassword;
		pinnedId = settings.startBoardId;
		pinnedPassword = settings.startBoardPassword;
	});

	const hasId = $derived(normalizeBoardId(boardId).length > 0);
	const hasPassword = $derived(normalizePassword(password).length > 0);
	/** Заповнена половина пари — не налаштування, а помилка, яку видно одразу. */
	const halfPair = $derived(hasId !== hasPassword);
	const bothSet = $derived(hasId && hasPassword);

	function save() {
		settings.save({ fixedBoardId: boardId.trim(), fixedPassword: password.trim() });
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	/**
	 * Вибір дошки — лише там, де дошку ВІДКРИВАЮТЬ.
	 *
	 * «Підключення до дошки» його не має: це форма, і вибирати дошку — її
	 * власна робота. Налаштування, яке вирішувало б за форму, чим їй
	 * зайнятися, суперечило б причині, з якої форму відкривають.
	 */
	const boardChoiceShown = $derived(
		settings.startPage === 'player' || settings.startPage === 'remote'
	);

	function savePinned() {
		settings.save({
			startBoardId: pinnedId.trim(),
			startBoardPassword: pinnedPassword.trim()
		});
		pinnedSaved = true;
		setTimeout(() => (pinnedSaved = false), 2000);
	}

	function clear() {
		settings.clear();
		boardId = '';
		password = '';
	}
</script>

<!--
	СІТКА КАРТОК, А НЕ ОДИН СТОВПЕЦЬ НА 440px.

	Налаштувань стало вчетверо більше, ніж було, і в одну колонку вони давали
	довгу стрічку посеред монітора: порожньо з боків, прокрутка там, де
	прокручувати нема чого. Колонки не задані числом — `auto-fit` сам ставить
	одну на телефоні, дві на планшеті й три на моніторі.
-->
<div class="stack stack--wide">
	<h1 class="title">{t('settings.title')}</h1>

	<div class="cards">
		<section class="card stack">
			<h2 class="subtitle">{t('settings.lookTitle')}</h2>

			<div class="field">
				<span class="field__label" id="lang-label">{t('settings.language')}</span>
				<div class="langs" role="group" aria-labelledby="lang-label">
					{#each LOCALES as locale (locale)}
						<button
							type="button"
							class="btn langs__btn"
							class:btn--primary={i18n.locale === locale}
							aria-pressed={i18n.locale === locale}
							data-testid="settings-lang-{locale}"
							onclick={() => void i18n.set(locale)}
						>
							{LOCALE_NAMES[locale]}
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field__label" id="theme-label">{t('theme.group')}</span>
				<!--
				ТРИТАКТНИЙ ВИБІР ЖИВЕ САМЕ ТУТ.

				У шапці стоїть двопозиційний тугал: він показує, що людина бачить,
				і перемикає одним рухом. Третє положення — «як у пристрої», тобто
				ВІДМОВА від вибору — у перемикача з двома станами не вміщається.
				Тому воно тут, разом із показом теми на наведенні, якого тугал теж
				не вміє (THEME-SWITCHER § 2–4).
			-->
				<div aria-labelledby="theme-label">
					<ThemeSwitcher />
				</div>
			</div>
		</section>

		<section class="card stack">
			<h2 class="subtitle">{t('settings.launchTitle')}</h2>

			<div class="field">
				<span class="field__label" id="start-label">{t('settings.startTitle')}</span>
				<!--
					Кнопки в спільній рамці, а не випадний список. Список ховає варіанти
					за одним рядком: щоб побачити, з чого взагалі можна обирати, треба
					спершу його відкрити. Тут усі пʼять видно одразу, і обраний видно
					теж — без жодного натискання.
				-->
				<Picker
					labelledby="start-label"
					value={settings.startPage}
					prefix="settings-start"
					options={START_PAGES.map((page) => ({ value: page, label: t(`start.${page}`) }))}
					onpick={(next) => settings.save({ startPage: next as StartPage })}
				/>
				<p class="muted">{t('settings.startLead')}</p>
			</div>

			<!--
				Автозапуск стоїть у «Запуску» — тобто там, де вже вирішують, що
				відкрити при старті. У браузері його не буде: сам компонент про це
				знає й не малює нічого.
			-->
			<AutoStartSwitch />

			{#if boardChoiceShown}
				<div class="field">
					<span class="field__label" id="start-board-label">{t('settings.startBoardTitle')}</span>
					<Picker
						labelledby="start-board-label"
						value={settings.startBoard}
						prefix="settings-board"
						options={START_BOARDS.map((which) => ({
							value: which,
							label: t(`startBoard.${which}`)
						}))}
						onpick={(next) => settings.save({ startBoard: next as StartBoard })}
					/>
				</div>

				{#if settings.startBoard === 'fixed'}
					<div class="field">
						<label class="field__label" for="pinned-id">{t('create.idLabel')}</label>
						<input
							id="pinned-id"
							class="input mono"
							type="text"
							bind:value={pinnedId}
							maxlength="16"
							autocapitalize="characters"
							autocorrect="off"
							spellcheck="false"
							data-testid="pinned-id"
						/>
					</div>

					<PasswordField
						id="pinned-password"
						label={t('create.passwordLabel')}
						bind:value={pinnedPassword}
						autocomplete="off"
					/>

					<p class="muted">{t('settings.startBoardLead')}</p>

					<button
						class="btn btn--primary"
						type="button"
						onclick={savePinned}
						data-testid="pinned-save"
					>
						{#if pinnedSaved}
							<IconCheck size={18} aria-hidden="true" />
							{t('settings.saved')}
						{:else}
							{t('settings.save')}
						{/if}
					</button>
				{/if}
			{/if}
		</section>

		<!--
			«ЩО ПОКАЗУВАТИ» — ОКРЕМОЮ КАРТКОЮ, а не хвостом «Запуску».

			Обидва перемикачі відповідають на питання «що видно на екрані», і до
			запуску не мають стосунку взагалі. Лежачи під вибором стартової
			сторінки, вони читалися як його продовження — тобто як щось, що діє
			лише при старті.
		-->
		<!--
			ПІДПИС У ЖУРНАЛІ — це підпис, а не обліковий запис.

			Вхід лишається анонімним: пароль знає дошка, а не людина. Але журнал
			на три помічники без імен відповідає лише на «що просили», тоді як
			питають у нього й «хто» — просять різні люди з різних кутів зали.
			Порожнє поле означає «як було»: анонімно.
		-->
		<section class="card stack" data-testid="settings-name-section">
			<h2 class="subtitle">{t('settings.nameTitle')}</h2>

			<div class="field">
				<label class="field__label" for="settings-name">{t('settings.name')}</label>
				<input
					id="settings-name"
					class="input"
					type="text"
					maxlength={MAX_NAME}
					value={settings.displayName}
					placeholder={t('settings.nameAnon')}
					oninput={(event) => settings.save({ displayName: event.currentTarget.value })}
					data-testid="settings-name-input"
				/>
				<p class="muted">{t('settings.nameHint')}</p>
			</div>
		</section>

		<section class="card stack" data-testid="settings-show-section">
			<h2 class="subtitle">{t('settings.showTitle')}</h2>

			<div class="field">
				<Switch
					checked={settings.showTrigger}
					label={t('settings.showTrigger')}
					testid="settings-show-trigger"
					onchange={(next) => settings.save({ showTrigger: next })}
				/>
				<p class="muted">{t('settings.showTriggerHint')}</p>
			</div>

			<!--
				Перемикач ховає ВХІД у меню, а не самі сторінки: інфодошка вже жива,
				просто ще недороблена, і той, хто її вмикає, мусить мати змогу й
				вимкнути назад — не перевстановлюючи застосунок.
			-->
			<div class="field">
				<Switch
					checked={settings.showInfoBoards}
					label={t('settings.showInfoBoards')}
					testid="settings-show-info-boards"
					onchange={(next) => settings.save({ showInfoBoards: next })}
				/>
				<p class="muted">{t('settings.showInfoBoardsHint')}</p>
			</div>
		</section>

		<MusicFolderCard />

		<section class="card stack">
			<h2 class="subtitle">{t('settings.fixedTitle')}</h2>
			<p class="muted">{t('settings.fixedLead')}</p>

			<div class="field">
				<label class="field__label" for="fixed-id">{t('settings.fixedId')}</label>
				<div class="row">
					<input
						id="fixed-id"
						class="input mono"
						type="text"
						bind:value={boardId}
						maxlength="16"
						autocapitalize="characters"
						autocorrect="off"
						spellcheck="false"
						data-testid="fixed-id"
					/>
					<button
						class="btn"
						type="button"
						title={t('settings.generate')}
						aria-label="{t('settings.generate')}: {t('settings.fixedId')}"
						onclick={() => (boardId = makeBoardId())}
					>
						<IconDice size={18} aria-hidden="true" />
					</button>
				</div>
			</div>

			<div class="row row--grow">
				<div class="row__field">
					<PasswordField
						id="fixed-password"
						label={t('settings.fixedPassword')}
						bind:value={password}
						autocomplete="off"
					/>
				</div>
				<button
					class="btn"
					type="button"
					title={t('settings.generate')}
					aria-label="{t('settings.generate')}: {t('settings.fixedPassword')}"
					onclick={() => (password = makePassword())}
				>
					<IconDice size={18} aria-hidden="true" />
				</button>
			</div>

			{#if halfPair}
				<p class="note note--warn" data-testid="half-pair">
					<IconWarning size={18} aria-hidden="true" />
					<span>{t('settings.halfPair')}</span>
				</p>
			{:else if bothSet}
				<p class="note note--warn" data-testid="reuse-warning">
					<IconWarning size={18} aria-hidden="true" />
					<span>{t('settings.reuseWarning')}</span>
				</p>
			{:else}
				<p class="muted">{t('settings.emptyMeans')}</p>
			{/if}

			<div class="row">
				<button
					class="btn btn--primary"
					type="button"
					onclick={save}
					disabled={halfPair}
					data-testid="settings-save"
				>
					{#if saved}
						<IconCheck size={18} aria-hidden="true" />
						{t('settings.saved')}
					{:else}
						{t('settings.save')}
					{/if}
				</button>

				{#if settings.fixedBoardId || settings.fixedPassword}
					<button
						class="btn btn--danger"
						type="button"
						onclick={clear}
						data-testid="settings-clear"
					>
						<IconTrash size={18} aria-hidden="true" />
						{t('settings.clear')}
					</button>
				{/if}
			</div>
		</section>

		<ContactCard />

		<!--
			НАЗВА КАРТКИ ЗАЛЕЖИТЬ ВІД ТОГО, ЩО В НІЙ ЛИШИЛОСЯ.

			Журнал останніх дій — інструмент розробки: він відповідає на «на якому
			кроці впала вкладка», і читає його той, хто дивиться в код. У зібраному
			застосунку він лише лякає стіною рядків того, хто зайшов змінити мову.

			Без журналу в картці лишаються скидання й версія — тобто вже не
			«Діагностика», а «Додатково». Заголовок, який описує щось інше, ніж
			лежить під ним, гірший за відсутній.
		-->
		<section class="card stack" data-testid="settings-extra-section">
			<h2 class="subtitle">{DEV ? t('settings.diagTitle') : t('settings.extraTitle')}</h2>

			<!--
			Версія переїхала сюди з підвалу кожної сторінки. Вона потрібна рівно
			тоді, коли про неї питають («а яка у вас збірка?»), — тобто в
			налаштуваннях, а не під очима щохвилини.

			Поруч — ознака емулятора: інакше «дошка не створюється» на бойовій
			адресі й на локальній виглядають однаково.
		-->
			{#if DEV}
				<DiagnosticsTrail />
				<hr class="rule" />
			{/if}

			<HardResetButton />

			<p class="about muted" data-testid="about">
				<span>{t('app.name')}</span>
				<span class="mono">{t('settings.version')} {__APP_VERSION__}</span>
				{#if isEmulator()}
					<span class="about__badge">{t('settings.emulator')}</span>
				{/if}
			</p>
		</section>
	</div>
</div>

<style>
	.title {
		/* Місце під хрестик вікна: у нього тепер нульова висота й він лежить поверх. */
		padding-right: var(--tap);
		font-size: 1.3rem;
	}

	/*
	 * ТРИ КОЛОНКИ — межа, а не побажання.
	 *
	 * `auto-fit` із мінімумом 300px давав на моніторі чотири, і картка
	 * «Діагностика» їхала в окремий стовпець сама до себе. Три ставить
	 * стільки, скільки груп налаштувань у застосунку є.
	 */
	/*
	 * КОЛОНКИ ТЕКСТУ, А НЕ СІТКА, — і причина суто в тому, що видно на екрані.
	 *
	 * Картки тут різновисокі: «Вигляд» — два ряди кнопок, «Запуск» — список із
	 * п'яти пунктів і перемикач. Сітка ставить їх рядами, і під низькою карткою
	 * лишається діра заввишки з різницю: пів екрана порожнечі між «Виглядом» і
	 * «Сталою дошкою», яку видно раніше за самі налаштування.
	 *
	 * Багатоколонкова розкладка заповнює колонки щільно, зверху вниз. Ціна
	 * названа: порядок читання стає стовпцевим, а не рядковим. Для набору
	 * незалежних карток це не втрата — між «Виглядом» і «Запуском» немає
	 * послідовності, яку можна було б зіпсувати.
	 */
	/*
	 * ПАНЕЛЬ МІРЯЄ СЕБЕ, А НЕ ВІКНО (FLUID-SIZING-v9 § 7A, `FS-CONTAINER`).
	 *
	 * Той самий вміст показується і сторінкою `/settings`, і вікном поверх
	 * дошки. Медіазапит міряв ВІКНО, тож у вікні шириною `min(1100px, 100vw −
	 * 32px)` мінус падінги тіла він рахував місце, якого панелі не дісталося:
	 * на екрані 1100px три колонки заїжджали в 1036px, а на 720px дві — у 656px.
	 *
	 * `inline-size`, а не `size`: висота тут від вмісту, і `size` дав би нуль.
	 */
	.stack--wide {
		container-type: inline-size;
	}

	.cards {
		columns: 1;
		column-gap: var(--gap);
	}

	/*
	 * Пороги — колишні віконні мінус 32px полів `.page`: рівно стільки місця
	 * лишалося панелі на сторінці, тобто на сторінці розкладка не змінилася
	 * взагалі, а у вікні вперше стала чесною.
	 */
	@container (min-width: 688px) {
		.cards {
			columns: 2;
		}
	}

	/*
	 * ТРЕТЯ КОЛОНКА ВІДКРИВАЄТЬСЯ РАНІШЕ, бо карток стало більше.
	 *
	 * Заміряно: вміст вікна налаштувань — 1036 точок, тобто рівно під старим
	 * порогом 1068. Вікно показувало дві колонки на екрані, де для трьох місця
	 * вистачало, і нижня половина списку йшла під згин.
	 */
	@container (min-width: 1000px) {
		.cards {
			columns: 3;
		}
	}

	/*
	 * ЧЕТВЕРТА КОЛОНКА. Поріг узятий із ширини самої картки: чотири по 230
	 * точок плюс три проміжки — це 968, і нижче за ~1240 четверта колонка
	 * почала б різати поля вводу. Вище — навпаки: три колонки лишали обабіч
	 * вікна порожнечу, а список тягнувся вниз.
	 */
	@container (min-width: 1240px) {
		.cards {
			columns: 4;
		}
	}

	/*
	 * `.stack` центрує себе по вертикалі автоматичними відступами — це потрібно
	 * картці входу посеред екрана й шкодить картці в комірці сітки: сусіди
	 * різної висоти розʼїжджалися сходинкою.
	 */
	.cards :global(.stack) {
		margin-block: 0;
	}

	/*
	 * ПРОМІЖОК МІЖ КАРТКАМИ — ПІСЛЯ скидання `margin-block`, а не до нього.
	 *
	 * Доти цей блок стояв вище, і правило `.cards :global(.stack)` його
	 * перебивало: картка — це `class="card stack"`, тож нуль вигравав за
	 * порядком. Наслідок було видно на екрані — сусідні картки в колонці
	 * торкалися боками, без жодного просвіту, тоді як між колонками просвіт був.
	 *
	 * Картку не можна розрізати між колонками: половина полів поїхала б угору.
	 */
	.cards > :global(.card) {
		margin-block: 0 var(--gap);
		break-inside: avoid;
	}

	.subtitle {
		font-size: 1.05rem;
	}

	.rule {
		width: 100%;
		height: 1px;
		margin: 0;
		border: 0;
		background: var(--border);
	}

	.langs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.langs__btn {
		flex: 1;
		min-width: 120px;
	}

	/* Поле розтягується, кнопка-кубик лишається квадратною поруч із ним. */
	.row--grow {
		align-items: start;
	}

	.row__field {
		flex: 1;
		min-width: 0;
	}

	.row--grow .btn {
		margin-top: 1.35rem;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.note--warn {
		color: var(--warn);
	}

	.about {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
	}

	.about__badge {
		padding: 2px 8px;
		border: 1px solid var(--warn);
		border-radius: var(--radius-full);
		color: var(--warn);
		font-size: 0.75rem;
	}
</style>
