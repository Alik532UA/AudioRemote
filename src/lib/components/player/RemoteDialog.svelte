<script lang="ts">
	import { IconCheck, IconClose, IconCopy } from '$lib/config/icons';
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import QrCode from '$lib/components/ui/QrCode.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import AdminSetup from './AdminSetup.svelte';

	/**
	 * ОДНЕ ВІКНО НА ОБИДВА ВИДИ ДОШКИ.
	 *
	 * Інструкція «як підключити» — найдорожчий текст у застосунку: його читає
	 * людина, яка вперше тримає телефон із цією адресою, і читає рівно один
	 * раз. Другий примірник цього вікна для інфодошки розійшовся б із першим на
	 * першій же правці кроків, і помітили б це не ми.
	 *
	 * Різниться в них небагато, і все воно тут параметрами: як зветься той, кого
	 * підключають, у якому розділі його форма, що дописати до адреси й чи є в
	 * цього виду дошки третя роль узагалі.
	 */
	interface Props {
		id: string;
		password: string;
		/** Адреса дошки в базі — саме її, а не пароль, несе посилання. */
		boardKey: string;
		/** Маршрут, на якому стоїть вікно: його знімають з адреси, щоб лишився корінь. */
		route?: string;
		/** Заголовок вікна: «Підключити пульт» або «Підключити помічника». */
		title?: TranslationKey;
		/** Той самий заголовок у скопійованому тексті. */
		how?: TranslationKey;
		/** Другий крок: у якому саме розділі шукати «Підключитися». */
		step2?: TranslationKey;
		/** Що дописати до адреси підключення: порожньо або `?kind=info`. */
		search?: string;
		/** Чи відкритий канал адміністратора зараз. */
		adminOn?: boolean;
		/** Другий пароль, якщо він уже заданий, — щоб було що показати. */
		admin?: string;
		/**
		 * Увімкнути з цим паролем, або вимкнути зовсім (`null`).
		 *
		 * Немає — у цього виду дошки третьої ролі ще немає, і смуга
		 * адміністратора не показується взагалі. Показана, але безсила, вона
		 * обіцяла б те, чого не станеться.
		 */
		onadmin?: (password: string | null) => Promise<void>;
		onclose: () => void;
	}

	let {
		id,
		password,
		boardKey,
		route = 'player',
		title = 'player.connect',
		how = 'player.connectHow',
		step2 = 'player.connectStep2',
		search = '',
		adminOn = false,
		admin = '',
		onadmin,
		onclose
	}: Props = $props();

	/**
	 * ЯК ПІДКЛЮЧИТИ ПУЛЬТ — ВІКНО, А НЕ ЗГОРНУТИЙ БЛОК НА СТОРІНЦІ.
	 *
	 * Пароль лежав у `<details>` під заголовком дошки й тягнув на себе місце в
	 * колонці, хоч потрібен рівно один раз — коли до дошки підключають телефон.
	 * Тут він разом з інструкцією, тобто там, де його шукають, і зникає з очей
	 * одразу, як інструкцію прочитали. Пароль на екрані в залі бачить не лише
	 * той, хто його спитав.
	 *
	 * `<dialog>` із `showModal()` — з тих самих причин, що й у вікні треку:
	 * затемнення, Escape, пастка фокуса й повернення його назад уже написані.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	let copied = $state(false);

	/**
	 * Адреса, яку диктують уголос, — без шляху сторінки.
	 *
	 * На екрані зараз `/player`, але телефону потрібен корінь: звідти йдуть до
	 * «Підключитися». Диктувати адресу з `/player` означало б відправити людину
	 * на сторінку приймача.
	 */
	const address = $derived.by(() => {
		if (typeof window === 'undefined') return '';
		const { origin, pathname } = window.location;
		return origin + pathname.replace(new RegExp(`/${route}/?$`), '/');
	});

	$effect(() => {
		node?.showModal();
	});

	/**
	 * ПОВНА ІНСТРУКЦІЯ, а не два рядки.
	 *
	 * Копіювали це, щоб переслати колезі — і колега отримував ідентифікатор із
	 * паролем без жодного слова про те, куди їх вводити. Тепер у буфер іде те
	 * саме, що на екрані: кроки, адреса й обидва значення.
	 *
	 * Текст збирається з ТИХ САМИХ рядків словника, що й вікно, — інакше
	 * переклад розійшовся б із тим, що читає людина.
	 */
	/**
	 * ПОСИЛАННЯ НЕСЕ АДРЕСУ ДОШКИ, А НЕ ПАРОЛЬ.
	 *
	 * Пульту пароль не потрібен ніколи: увійти досить за ключем, бо ключ і є
	 * адреса (хеш від пари, див. `boardPath.ts`). Тому в посиланні їде він — і
	 * з цього виходять три речі одразу.
	 *
	 * 1. Пароль не покидає цього комп'ютера. Це важить найбільше там, де в
	 *    налаштуваннях задано СТАЛУ пару: один пароль відкриває всі дошки, і
	 *    пересилати його заради однієї — надто щедро.
	 * 2. Відновити пароль із ключа неможливо за побудовою.
	 * 3. Посилання стає чистим ASCII. Пароль із українських слів давав
	 *    `%D0%92%D0%9E...` на пів екрана, і людина не бачила, що саме надсилає.
	 *
	 * Усе це — у ФРАГМЕНТІ, після `#`: браузер серверу його не надсилає ніколи,
	 * тож ні журнал хостингу, ні проксі, ні `Referer` його не бачать. Сторінка
	 * підключення стирає фрагмент з адреси одразу, як прочитає, — щоб не лишався
	 * і в історії телефона.
	 *
	 * Чого це не робить безпечним: ключ ВІДКРИВАЄ дошку. Хто отримав посилання,
	 * той усередині — інакше «одне натискання» неможливе за побудовою.
	 */
	/**
	 * Чи має телефон запам'ятати цю дошку як типову.
	 *
	 * Прапорець їде В ПОСИЛАННІ, а не вмикається на телефоні: вирішує той, хто
	 * посилання дає. Колезі, якого покликали на один вечір, міняти налаштування
	 * телефона не треба; тому, хто щодня вмикає музику в тому самому залі, —
	 * навпаки, інакше він щоразу проходить меню.
	 */
	let autoStart = $state(true);

	const link = $derived(
		`${address}connect${search}#k=${boardKey}&id=${encodeURIComponent(id)}${autoStart ? '&start=1' : ''}`
	);

	const fullText = $derived(
		[
			`${t('player.connectQuick')}: ${link}`,
			'',
			t(how),
			`1. ${t('player.connectStep1')} ${address}`,
			`2. ${t(step2)}`,
			`3. ${t('player.connectStep3')}`,
			'',
			`${t('create.idLabel')}: ${id}`,
			`${t('create.passwordLabel')}: ${password}`
		].join(String.fromCharCode(10))
	);

	let linkCopied = $state(false);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 2000);
		} catch {
			// Буфер заборонений політикою — лишається код камерою.
		}
	}

	async function copyAll() {
		try {
			await navigator.clipboard.writeText(fullText);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер заборонений політикою — усе потрібне й так на екрані.
		}
	}
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="remote-modal"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t(title)}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="remote-modal-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<!--
			ТРИ КОЛОНКИ, бо тут три РІЗНІ способи, а не один довгий.
			
			Одним стовпцем вікно виростало вище за екран, і людина гортала його,
			шукаючи потрібний спосіб; обабіч при цьому лишалося порожнє місце.
			Колонки ставлять способи поруч — і видно, що обирати, не читаючи всього.

			КОЛОНОК ДВІ, БО СПОСОБІВ ДВА: камерою й руками. Доти їх було три —
			третя звалася «Значення» й тримала ідентифікатор із паролем. Але це
			не спосіб, це ДАНІ ДРУГОГО способу: третій крок інструкції каже
			«введіть ідентифікатор і пароль звідси», і «звідси» показувало за
			межу сусідньої картки. Тобто нумерований список обіцяв повний
			порядок дій і посеред нього відсилав в інше місце.

			Заразом зникла й нерівність висот: перша колонка з QR була втричі
			вища за дві сусідні, і поруч із нею вони читалися як рештки.
		-->
		<div class="grid">
			<section class="pane">
				<h3 class="pane__title">{t('player.connectQuick')}</h3>
				<QrCode value={link} label={t('player.connectLink')} />
				<p class="muted">{t('player.connectQrHint')}</p>

				<!--
					Саме посилання НЕ показуємо текстом. Тридцять два символи ключа —
					це стіна, яку ніхто не читає, а в колонці вона ще й розсипалася на
					п'ять рядків і робила вікно вищим за екран. Хто копіює, той і так
					побачить його там, куди вставить; хто ні — тому потрібна камера.
					Значення лишається доступним перевіркам через `data-link`.
				-->
				<button
					class="btn"
					type="button"
					onclick={copyLink}
					data-testid="dialog-link"
					data-link={link}
				>
					{#if linkCopied}
						<IconCheck size={18} aria-hidden="true" />
						{t('common.copied')}
					{:else}
						<IconCopy size={18} aria-hidden="true" />
						{t('player.connectCopyLink')}
					{/if}
				</button>

				<Switch
					checked={autoStart}
					label={t('player.connectAuto')}
					testid="connect-auto"
					onchange={(next) => (autoStart = next)}
				/>

				<p class="muted">{t('player.connectQuickHint')}</p>
			</section>

			<section class="pane">
				<h3 class="pane__title">{t('player.connectManual')}</h3>
				<ol class="steps">
					<li>{t('player.connectStep1')}</li>
					<li>{t(step2)}</li>
					<li>{t('player.connectStep3')}</li>
				</ol>

				<div class="field">
					<span class="field__label">{t('player.connectAddress')}</span>
					<div class="line">
						<output class="mono line__value line__value--address" data-testid="dialog-address">
							{address}
						</output>
						<CopyButton value={address} label={t('player.connectAddress')} testid="copy-address" />
					</div>
				</div>

				<!--
					Два значення — дві кнопки. Ідентифікатор і пароль вводять у різні
					поля, а часом треба переслати лише пароль: одна кнопка на все вікно
					змушувала виділяти текст мишею — і то з поля, де пароль прихований
					крапками.
				-->
				<div class="field">
					<span class="field__label">{t('create.idLabel')}</span>
					<div class="line">
						<output class="secret mono line__value" data-testid="dialog-id">{id}</output>
						<CopyButton value={id} label={t('create.idLabel')} testid="copy-id" />
					</div>
				</div>

				<!--
					Кнопка пароля — ВСЕРЕДИНІ поля, поруч із оком. Поруч із полем вона
					з'їжджала б під рядок підказок (Caps Lock, розкладка), який там є
					завжди, навіть порожній.
				-->
				<PasswordField
					id="player-password"
					label={t('create.passwordLabel')}
					value={password}
					autocomplete="off"
					readonly
				>
					{#snippet action()}
						<CopyButton value={password} label={t('create.passwordLabel')} testid="copy-password" />
					{/snippet}
				</PasswordField>
			</section>
		</div>

		<!--
			ТРЕТЯ РОЛЬ — ОКРЕМОЮ СМУГОЮ ПІД КОЛОНКАМИ, а не ще однією колонкою, і
			окремим компонентом: в інфодошки адмінського каналу немає взагалі, і те
			саме вікно відкривається там без цієї смуги. Чому саме так — у
			`AdminSetup.svelte`.
		-->
		{#if onadmin}
			<AdminSetup on={adminOn} password={admin} onapply={onadmin} />
		{/if}

		<button class="btn" type="button" onclick={copyAll} data-testid="copy-secret">
			{#if copied}
				<IconCheck size={18} aria-hidden="true" />
				{t('common.copied')}
			{:else}
				<IconCopy size={18} aria-hidden="true" />
				{t('player.connectCopyAll')}
			{/if}
		</button>
	</div>
</dialog>

<style>
	.dialog {
		width: min(1000px, calc(100vw - 32px));
		/* Вікно не буває вищим за екран: прокручується ВМІСТ, а не сторінка. */
		max-height: calc(100dvh - 48px);
		/*
		 * Прокручується ВМІСТ, а не саме вікно. Без цього рядка смуг дві: у
		 * `__body` своя (він і має прокручуватися), а в самого вікна ще одна —
		 * бо падінг тіла додається до його ж `max-height`, і тіло на кілька
		 * десятків пікселів переростає вікно.
		 */
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		max-height: inherit;
		overflow: auto;
		padding: var(--gap-lg);
	}

	.grid {
		display: grid;
		gap: var(--gap);
		grid-template-columns: 1fr;
		/* Колонки різної висоти стоять на місці, а не тягнуться до найвищої. */
		align-items: start;
	}

	/*
	 * Межа в 900px: три колонки по 280px плюс проміжки й відступи. Вужче —
	 * посилання починає ламатися посеред ключа, і читати його стає неможливо.
	 */
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/*
	 * Смуга адміністратора відділена лінією, а не проміжком: без неї вона
	 * читається як продовження третьої колонки, тобто як ще одна пара значень
	 * для підключення — а це рішення іншого роду.
	 */
	/*
	 * Заголовок і перемикач СТОЯТЬ ПОРУЧ, а не по краях смуги.
	 *
	 * `space-between` розкидав їх на всю ширину вікна: підпис ліворуч, перемикач
	 * за пів метра праворуч, і зв'язок між ними доводилося добудовувати очима.
	 * Тепер перемикач одразу за заголовком, а порожнє місце лишається праворуч —
	 * там, де воно нічого не означає.
	 */
	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		font-size: 1.1rem;
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.9rem;
	}

	/*
		Значення й кнопка в один рядок. Кнопка не стискається — скорочуватися має
		довга адреса, а не дія біля неї.
	*/
	/*
	 * Значення й кнопка копіювання — ПО ЦЕНТРУ рядка, а не по низу.
	 *
	 * Кнопка вища за текст удвічі, тож вирівнювання по низу лишало над текстом
	 * порожнечу в половину кнопки — і підпис поля («Адреса», «Ідентифікатор»)
	 * опинявся від свого значення далі, ніж поля одне від одного. Близькість
	 * читається раніше за будь-який підпис, тож група розпадалася на очах.
	 */
	.line {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	.line__value {
		flex: 1 1 auto;
		min-width: 0;
	}

	.line__value--address {
		word-break: break-all;
		color: var(--accent);
	}

	.secret {
		font-size: 1.15rem;
		letter-spacing: 0.12em;
	}
</style>
