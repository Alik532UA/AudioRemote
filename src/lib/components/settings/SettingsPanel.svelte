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
	import { IconCheck, IconDice, IconFolder, IconTrash, IconWarning } from '$lib/config/icons';
	import { i18n, LOCALES, t, type Locale } from '$lib/i18n/i18n.svelte';
	import {
		makeBoardId,
		makePassword,
		normalizeBoardId,
		normalizePassword
	} from '$lib/board/secret';
	import { settings } from '$lib/settings/settings.svelte';
	import { rememberedFolder, rememberFolder, runningInTauri } from '$lib/audio/tauriSource';
	import { START_BOARDS, START_PAGES } from '$lib/settings/startPage.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { isEmulator } from '$lib/net/firebase';
	import { currentTrail, previousTrail, trailAsText } from '$lib/services/breadcrumbs';

	const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' };

	let boardId = $state('');
	let password = $state('');
	/** Пара «певної дошки» для запуску. Зберігається окремою кнопкою. */
	let pinnedId = $state('');
	let pinnedPassword = $state('');
	let saved = $state(false);
	let pinnedSaved = $state(false);
	let trailCopied = $state(false);
	let trail = $state<{ at: number; step: string }[]>([]);
	let trailIsPrevious = $state(false);

	/** Журнал готовим текстом: у розмітці перенос рядка не записати. */
	const trailText = $derived(
		trail.map((crumb) => `+${crumb.at}ms  ${crumb.step}`).join(String.fromCharCode(10))
	);

	async function copyTrail() {
		try {
			await navigator.clipboard.writeText(trailAsText());
			trailCopied = true;
			setTimeout(() => (trailCopied = false), 2000);
		} catch {
			/* буфер заборонений — журнал видно на екрані */
		}
	}

	onMount(() => {
		/*
		 * Показуємо ПОПЕРЕДНІЙ сеанс, якщо він є: саме він обривається на кроці,
		 * після якого вкладка не вижила. Поточний цікавий лише коли попереднього
		 * немає — тобто нічого не падало.
		 */
		const previous = previousTrail();
		trailIsPrevious = previous.length > 0;
		trail = trailIsPrevious ? previous : currentTrail();

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

	/**
	 * ПАПКА З МУЗИКОЮ — стан і дії, лише для застосунку на комп'ютері.
	 *
	 * Тут навмисно два шляхи до однієї речі: діалог і поле. Діалог зручніший,
	 * коли папку шукають; поле — коли шлях уже є (скопіювали з провідника,
	 * продиктували, переносять налаштування на другий комп'ютер школи).
	 *
	 * Обидва закінчуються однаково: `rememberFolder` не лише запам'ятовує шлях,
	 * а й видає застосунку право читати саме цю папку. Забути про друге —
	 * означало б зберегти шлях і лишити список порожнім.
	 */
	const onDesktop = runningInTauri();
	let folderPath = $state('');
	let folderSaved = $state(false);
	let folderError = $state(false);

	onMount(() => {
		folderPath = rememberedFolder();
	});

	async function saveFolder() {
		folderError = false;
		if (!(await rememberFolder(folderPath))) {
			folderError = true;
			return;
		}
		folderSaved = true;
		setTimeout(() => (folderSaved = false), 2000);
	}

	async function pickFolder() {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const picked = await open({
			directory: true,
			multiple: false,
			title: t('settings.folderPick')
		});
		if (typeof picked !== 'string') return;
		folderPath = picked;
		await saveFolder();
	}

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
							onclick={() => i18n.set(locale)}
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
				<div class="picker" role="radiogroup" aria-labelledby="start-label">
					{#each START_PAGES as page (page)}
						<button
							class="picker__item"
							type="button"
							role="radio"
							aria-checked={settings.startPage === page}
							onclick={() => settings.save({ startPage: page })}
							data-testid="settings-start-{page}"
						>
							{t(`start.${page}`)}
						</button>
					{/each}
				</div>
				<p class="muted">{t('settings.startLead')}</p>
			</div>

			<div class="field">
				<Switch
					checked={settings.showTrigger}
					label={t('settings.showTrigger')}
					testid="settings-show-trigger"
					onchange={(next) => settings.save({ showTrigger: next })}
				/>
				<p class="muted">{t('settings.showTriggerHint')}</p>
			</div>

			{#if boardChoiceShown}
				<div class="field">
					<span class="field__label" id="start-board-label">{t('settings.startBoardTitle')}</span>
					<div class="picker" role="radiogroup" aria-labelledby="start-board-label">
						{#each START_BOARDS as which (which)}
							<button
								class="picker__item"
								type="button"
								role="radio"
								aria-checked={settings.startBoard === which}
								onclick={() => settings.save({ startBoard: which })}
								data-testid="settings-board-{which}"
							>
								{t(`startBoard.${which}`)}
							</button>
						{/each}
					</div>
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
			ПАПКА — ЛИШЕ ДЛЯ ЗАСТОСУНКУ НА КОМП'ЮТЕРІ.

			У браузері поля зі шляхом не буде ніколи, і це не забута гілка: сторінка
			не може відкрити файл за шляхом у принципі, хоч би скільки його вводили
			(PROJECT-CONTEXT § 5.0). Показувати поле, яке нічого не зробить, гірше,
			ніж не показувати нічого.
		-->
		{#if onDesktop}
			<section class="card stack">
				<h2 class="subtitle">{t('settings.folderTitle')}</h2>
				<p class="muted">{t('settings.folderLead')}</p>

				<div class="field">
					<label class="field__label" for="music-folder">{t('settings.folderLabel')}</label>
					<input
						id="music-folder"
						class="input mono"
						type="text"
						spellcheck="false"
						placeholder="C:\Users\…\Music\Зал 2"
						bind:value={folderPath}
						data-testid="folder-path"
					/>
				</div>

				<div class="row">
					<button class="btn" type="button" onclick={pickFolder} data-testid="folder-pick">
						<IconFolder size={18} aria-hidden="true" />
						{t('settings.folderPick')}
					</button>

					<button
						class="btn btn--primary"
						type="button"
						onclick={saveFolder}
						data-testid="folder-save"
					>
						{#if folderSaved}
							<IconCheck size={18} aria-hidden="true" />
							{t('settings.saved')}
						{:else}
							{t('settings.save')}
						{/if}
					</button>
				</div>

				{#if folderError}
					<p class="error" data-testid="folder-error">{t('settings.folderMissing')}</p>
				{/if}
			</section>
		{/if}

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

		<section class="card stack">
			<h2 class="subtitle">{t('settings.diagTitle')}</h2>

			<!--
			Версія переїхала сюди з підвалу кожної сторінки. Вона потрібна рівно
			тоді, коли про неї питають («а яка у вас збірка?»), — тобто в
			налаштуваннях, а не під очима щохвилини.

			Поруч — ознака емулятора: інакше «дошка не створюється» на бойовій
			адресі й на локальній виглядають однаково.
		-->
			<details class="trail" data-testid="trail">
				<summary class="trail__toggle">
					{t('settings.trail')}
					{#if trailIsPrevious}· {t('settings.trailHint')}{/if}
				</summary>

				<div class="trail__body">
					{#if trail.length === 0}
						<p class="muted">{t('settings.trailEmpty')}</p>
					{:else}
						<pre class="trail__text mono">{trailText}</pre>
						<button class="btn" type="button" onclick={copyTrail} data-testid="copy-trail">
							{#if trailCopied}
								<IconCheck size={18} aria-hidden="true" />
								{t('common.copied')}
							{:else}
								{t('common.copy')}
							{/if}
						</button>
					{/if}
				</div>
			</details>

			<hr class="rule" />

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
	.cards {
		columns: 1;
		column-gap: var(--gap);
	}

	/* Картку не можна розрізати між колонками: половина полів поїхала б угору. */
	.cards > :global(.card) {
		margin-bottom: var(--gap);
		break-inside: avoid;
	}

	@media (min-width: 720px) {
		.cards {
			columns: 2;
		}
	}

	@media (min-width: 1100px) {
		.cards {
			columns: 3;
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
	 * Перемикач списком: кнопки без власних рамок у спільній рамці.
	 *
	 * Ряд окремих кнопок на пʼять довгих підписів розсипався б на пʼять рядків
	 * із проміжками між ними — і перестав би читатися як ОДИН вибір.
	 */
	.picker {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
	}

	.picker__item {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 0;
		border-top: 1px solid var(--border);
		background: none;
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker__item:first-child {
		border-top: 0;
	}

	.picker__item:hover,
	.picker__item:focus-visible {
		background: var(--bg-sunken);
	}

	/*
	 * Обраний позначено смугою збоку, а не самим лише тлом: тло в темній темі
	 * відрізняється на кілька відсотків яскравості й на проєкторі в залі
	 * зникає зовсім.
	 */
	.picker__item[aria-checked='true'] {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
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

	.trail {
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.trail__toggle {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		list-style-position: inside;
	}

	.trail__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: 0 var(--gap) var(--gap);
	}

	.trail__text {
		max-height: 40vh;
		margin: 0;
		overflow: auto;
		color: var(--text-secondary);
		font-size: 0.75rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.about__badge {
		padding: 2px 8px;
		border: 1px solid var(--warn);
		border-radius: var(--radius-full);
		color: var(--warn);
		font-size: 0.75rem;
	}
</style>
