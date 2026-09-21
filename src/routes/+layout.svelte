<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import '$lib/css/base/tokens.css';
	import '$lib/css/base/base.css';
	import { themeState } from '$lib/services/theme.svelte';
	import { i18n, t } from '$lib/i18n/i18n.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import AppMark from '$lib/components/ui/AppMark.svelte';
	import ReloadPrompt from '$lib/components/ui/ReloadPrompt.svelte';
	import DesktopUpdatePrompt from '$lib/components/ui/DesktopUpdatePrompt.svelte';
	import { IconBack, IconMenu, IconSettings } from '$lib/config/icons';
	import { mark, rotate } from '$lib/services/breadcrumbs';
	import { logCrashes } from '$lib/services/crashLog';
	import { purgeLegacyHandles } from '$lib/audio/localSource';
	import BoardSheet from '$lib/components/ui/BoardSheet.svelte';
	import SettingsDialog from '$lib/components/settings/SettingsDialog.svelte';
	import { boardPanel } from '$lib/services/boardPanel.svelte';
	import { narrow } from '$lib/services/narrow.svelte';

	let { children } = $props();

	let ready = $state(false);

	/*
	 * «Назад» живе в шапці, а не на сторінці.
	 *
	 * На кожній сторінці стояв власний рядок із посиланням — окремий рядок
	 * заввишки в дотик, який нічого не показував і з'їдав найдорожче місце
	 * вгорі. У шапці вже є смуга того самого призначення, і там воно коштує
	 * нуль.
	 *
	 * На головній його немає: повертатися нема куди.
	 */
	/*
	 * «Початок» — це і корінь, і меню.
	 *
	 * Корінь лише стрілочник і живе мить, але поки він на екрані, кнопка
	 * «назад» там була б обіцянкою нікуди. Меню — справжній початок, і
	 * повертатися з нього нема куди.
	 */
	const root = base.replace(/\/$/, '');
	/** Шлях без кінцевої скісної: `/menu` і `/menu/` — те саме місце. */
	const bare = (path: string | undefined): string => (path ?? '').replace(/\/$/, '');
	const atHome = $derived([root, `${root}/menu`].includes(bare(page.url.pathname)));

	/**
	 * «Назад» — це КРОК НАЗАД, а не стрибок на головну.
	 *
	 * Доти воно завжди вело в головне меню, і шлях «плеєр → налаштування →
	 * назад» викидав з дошки замість повернення до неї. Стрілка з таким
	 * написом обіцяє саме попереднє місце.
	 */

	/**
	 * СКІЛЬКИ КРОКІВ МИ ЗРОБИЛИ ВСЕРЕДИНІ ЗАСТОСУНКУ — і чому це рахується САМЕ
	 * ТУТ, а не питається в `history.length`.
	 *
	 * `history.length` — це довжина історії ВКЛАДКИ, а не нашої. Сторінку,
	 * відкриту прямим посиланням, вона бачить не першою: у вкладці до неї вже
	 * був порожній запис, і `length` дорівнює двом. Заміряно в чистій вкладці на
	 * `/create`: `history.length === 2`, кнопка «назад» показана, натискання
	 * веде на `about:blank` — тобто викидає людину із застосунку зовсім.
	 *
	 * У застосунку на комп'ютері те саме число дорівнює одиниці, і спрацьовував
	 * запасний шлях «піти в меню» — з тим самим виглядом поломки, бо стрілка з
	 * написом «назад» веде не назад.
	 *
	 * Тому лічильник свій. Він росте на кожному переході вперед і спадає на
	 * кожному `popstate`; кнопка показується лише тоді, коли він більший за
	 * нуль, тобто коли повертатися СПРАВДІ є куди.
	 *
	 * Корінь `/` до лічильника не додається навмисно: він стрілочник і ЗАМІНЮЄ
	 * свій запис (`replaceState` у `+page.svelte`), а не додає новий. Порахувати
	 * його означало б показати кнопку, яка веде в порожнечу, — рівно той дефект,
	 * заради якого лічильник і з'явився.
	 */
	let depth = $state(0);

	afterNavigate((navigation) => {
		if (navigation.type === 'enter') {
			// Нове завантаження документа — історія застосунку починається заново.
			depth = 0;
			return;
		}
		if (navigation.type === 'popstate') {
			depth = Math.max(0, depth + navigation.delta);
			return;
		}
		if (bare(navigation.from?.url.pathname) === root) return;
		depth += 1;
	});

	const canGoBack = $derived(depth > 0);

	/**
	 * РОЛЬ ЦЬОГО ПРИСТРОЮ — У СМУЗІ ЗАСТОСУНКУ.
	 *
	 * «Плеєр» і «Пульт» — це не назва сторінки, а відповідь на питання, яке
	 * ставлять із іншого кінця зали: «на цьому пристрої що?». Доти вона жила
	 * лише в картці дошки, а картка на телефоні ховається за кнопкою меню — тож
	 * саме там, де пристроїв багато й переплутати їх найлегше, ролі не було
	 * видно зовсім.
	 *
	 * Береться з МАРШРУТУ, а не з відкритої дошки: сторінка плеєра лишається
	 * плеєром і тоді, коли дошку ще не обрали, — і напис не блимає, поки
	 * з'єднання піднімається.
	 */
	const roleLabel = $derived.by(() => {
		const path = bare(page.url.pathname);
		if (path === `${root}/player`) return t('player.title');
		if (path === `${root}/remote`) return t('remote.title');
		// Другий вид дошки зве ті самі ролі інакше — див. докблок до `BoardKind`.
		if (path === `${root}/info`) return t('info.boardTitle');
		if (path === `${root}/info-remote`) return t('info.remoteTitle');
		return '';
	});
	/*
	 * На телефоні шестірня спершу відкриває вікно з дошкою, і вже звідти ведуть
	 * налаштування застосунку. На широкому екрані шапка дошки стоїть карткою в
	 * колонці, тож посередник не потрібен — шестірня веде прямо.
	 */
	const sheetFirst = $derived(narrow.matches && boardPanel.content !== null);

	// Сторінка може попросити закрити аркуш — див. `boardPanel.close()`.
	$effect(() => {
		if (boardPanel.closeRequests > 0) sheetOpen = false;
	});
	let sheetOpen = $state(false);

	/**
	 * Налаштування відкриваються ВІКНОМ, а не переходом.
	 *
	 * Перехід коштував двох речей: у браузері сторінка приймача, яку покинули,
	 * втрачає дескриптор теки (тобто повернення = «оберіть папку заново»), а ще
	 * вона грає — піти з неї посеред заняття означає зупинити музику в залі.
	 *
	 * Сторінка `/settings` лишається: пряме посилання мусить працювати, і на ній
	 * самій вікно не потрібне. Тому кнопка там веде себе як і раніше.
	 */
	let settingsOpen = $state(false);
	const onSettingsPage = $derived(page.url.pathname.replace(/\/$/, '') === `${root}/settings`);

	/**
	 * «НАЗАД» НЕ ПОКАЗУЄТЬСЯ НА ПУЛЬТІ, КОЛИ ЦЕ ТЕЛЕФОН.
	 *
	 * Пульт на телефоні відкривають і працюють із нього весь вечір; «назад» там
	 * веде в меню, тобто геть від того, заради чого його відкрили. Місце в
	 * смузі при цьому найдорожче саме на телефоні, а вихід нікуди не дівається —
	 * він за знаком застосунку ліворуч.
	 */
	const hideBack = $derived(
		narrow.matches && page.url.pathname.replace(/\/$/, '') === `${root}/remote`
	);

	// Запасного «піти в меню» тут більше немає: кнопки просто не буває там, де
	// повертатися нікуди, тож гілка була б недосяжною.
	const goBack = () => window.history.back();

	onMount(() => {
		// Журнал першим: усе, що станеться далі, мусить у нього потрапити.
		rotate();
		mark('app:start');

		/*
		 * Перехоплювач — ОДРАЗУ ЗА ЖУРНАЛОМ, до першого ж рядка, який здатен
		 * кинути. Межа помилки нижче ловить рендер і `$effect`; усе інше —
		 * обробники подій, таймери, колбеки бази, `void poll()` в опитувачі —
		 * летіло повз усіх, і слід у журналі обривався, не назвавши причини.
		 */
		const unlog = logCrashes(window);

		/*
		 * Прибрати базу, у якій доти лежав дескриптор теки. Читання того запису
		 * вбиває рендерер (див. `localSource.ts`), тож у того, хто вже
		 * користувався застосунком, вона лежить зарядженою. Видалення читанням не
		 * є й проходить безпечно.
		 */
		purgeLegacyHandles();

		// Обидва читають сховище й `window`, тож лише після монтування.
		themeState.init();
		i18n.init();
		const unwatch = narrow.init();
		ready = true;
		mark('app:ready');

		return () => {
			unwatch();
			unlog();
		};
	});
</script>

<!--
	ШАПКА — ЗНАК, РОЛЬ І ДВА ОРГАНИ КЕРУВАННЯ, більше нічого.

	Назва застосунку й підпис під нею тут були зайві: людина, яка відкрила
	застосунок, уже знає, що вона в ньому, а місце вгорі екрана телефона
	найдорожче. Заголовок сторінки тепер несе сама сторінка — і несе великим
	шрифтом, бо він там один.

	РОЛЬ — виняток, і єдиний. «Плеєр» чи «Пульт» відповідає не на «де я», а на
	«цей пристрій що робить», і питання це ставлять із іншого кінця зали. Доти
	відповідь жила лише в картці дошки, а на телефоні картка ховається за
	кнопкою меню — тобто саме там, де пристроїв багато, ролі не було видно
	зовсім. Слово коротке й ріжеться трикрапкою, тож місця не з'їдає.

	Фону теж немає: смуга іншого кольору відділяла шапку від вмісту, якого вона
	не відділяє, — сторінка й так починається нижче.

	Версія переїхала в налаштування: вона потрібна рівно тоді, коли про неї
	питають, і саме там її шукатимуть.
-->
<div class="shell">
	<header class="shell__top">
		<div class="shell__left">
			<!--
				Знак веде в МЕНЮ, а не в корінь. Корінь — стрілочник: він поніс би
				назад на ту саму сторінку, з якої людина щойно натиснула знак.
			-->
			<a class="shell__mark" href={resolve('/menu')} title={t('app.name')} data-testid="brand">
				<AppMark size={26} />
				<span class="visually-hidden">{t('app.name')}</span>
			</a>

			{#if ready && !atHome && !hideBack && canGoBack}
				<button class="shell__back" type="button" onclick={goBack} data-testid="back">
					<IconBack size={18} aria-hidden="true" />
					{t('common.back')}
				</button>
			{/if}
		</div>

		{#if ready && roleLabel}
			<p class="shell__role" data-testid="shell-role-text">{roleLabel}</p>
		{/if}

		{#if ready}
			<div class="shell__controls">
				<ThemeToggle />
				{#if sheetFirst}
					<!--
						ГАМБУРГЕР, А НЕ ШЕСТІРНЯ. За цією кнопкою не налаштування, а меню
						дошки: її шапка, вхід в адміністратори і вже звідти — перехід до
						налаштувань застосунку. Шестірня обіцяла б інше, і обіцянку цю
						довелося б виконувати «налаштуваннями в налаштуваннях».
					-->
					<button
						class="shell__settings"
						type="button"
						title={t('settings.boardMenu')}
						aria-label={t('settings.boardMenu')}
						onclick={() => (sheetOpen = true)}
						data-testid="go-settings"
					>
						<IconMenu size={20} aria-hidden="true" />
					</button>
				{:else if onSettingsPage}
					<a
						class="shell__settings"
						href={resolve('/settings')}
						title={t('settings.open')}
						aria-label={t('settings.open')}
						data-testid="go-settings"
					>
						<IconSettings size={20} aria-hidden="true" />
					</a>
				{:else}
					<button
						class="shell__settings"
						type="button"
						title={t('settings.open')}
						aria-label={t('settings.open')}
						onclick={() => (settingsOpen = true)}
						data-testid="go-settings"
					>
						<IconSettings size={20} aria-hidden="true" />
					</button>
				{/if}
			</div>
		{/if}
	</header>

	<main class="page">
		<!--
			МЕЖА ПОМИЛКИ НАВКОЛО СТОРІНКИ, А НЕ НАВКОЛО ВСЬОГО.

			Вона стоїть усередині оболонки навмисно: шапка з «назад», меню й
			налаштуваннями лишається на екрані, тож із поламаної сторінки є куди
			піти. Межа навколо `<div class="shell">` дала б той самий білий
			аркуш, лише з написом.

			Ловить помилки РЕНДЕРУ й `$effect` усередині межі. Обробники подій і
			асинхронний код поза рендером сюди не потрапляють — там свої
			`try/catch` (ERROR-HANDLING-v9 § 2.3).

			`reset()` показує вміст заново. Для більшості поломок — тих, що
			прийшли з одного невдалого стану, — цього досить, а для решти поруч
			стоїть вихід у меню.
		-->
		<svelte:boundary onerror={(error) => mark(`crash ${String(error).slice(0, 80)}`)}>
			{@render children()}

			{#snippet failed(_error, reset)}
				<div class="crash" role="alert" data-testid="page-crash">
					<h1 class="crash__title">{t('error.crashTitle')}</h1>
					<p class="crash__hint">{t('error.crashHint')}</p>

					<div class="crash__actions">
						<button
							class="btn btn--primary"
							type="button"
							onclick={reset}
							data-testid="crash-retry"
						>
							{t('error.retry')}
						</button>
						<a class="btn" href={resolve('/menu')} data-testid="crash-to-menu"
							>{t('error.toMenu')}</a
						>
					</div>
				</div>
			{/snippet}
		</svelte:boundary>
	</main>
</div>

{#if sheetOpen && boardPanel.content}
	<BoardSheet
		head={boardPanel.content}
		onsettings={() => {
			sheetOpen = false;
			settingsOpen = true;
		}}
		onclose={() => (sheetOpen = false)}
	/>
{/if}

{#if settingsOpen}
	<SettingsDialog onclose={() => (settingsOpen = false)} />
{/if}

<ReloadPrompt />
<!--
	ДВІ РІЗНІ ПРОПОЗИЦІЇ, І ЦЕ НАВМИСНО.

	`ReloadPrompt` оновлює СТОРІНКУ: новий service worker уже завантажений,
	перезавантаження триває мить. `DesktopUpdatePrompt` — ВСТАНОВЛЕНИЙ
	ЗАСТОСУНОК: інсталятор закриває вікно й відкриває заново, тобто звук у залі
	зникає на кілька секунд.

	Звести їх в одну панель означало б сховати саме ту різницю, яка людину й
	цікавить. У браузері друга не показується взагалі — перевірка одразу віддає
	«не застосунок».
-->
<DesktopUpdatePrompt />

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	/*
	 * СМУГА ЗАЛИШАЄТЬСЯ НА ЕКРАНІ.
	 *
	 * Доти вона їхала разом зі сторінкою: на довгому списку треків знак
	 * застосунку, «Назад» і шестірня виїжджали геть, і щоб вийти з дошки,
	 * доводилося спершу прокрутити список до самого верху. На телефоні це
	 * особливо дратує — там список найдовший відносно екрана.
	 *
	 * Напівпрозорість плюс розмиття: видно, що під смугою щось є і сторінка
	 * прокручується, але текст під нею не змагається з кнопками за увагу.
	 * `backdrop-filter` підтримують усі цільові браузери; там, де ні, лишиться
	 * просто напівпрозорий фон — смуга не зникне.
	 */
	.shell__top {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		flex: none;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-sm) 16px;
		background: var(--bg-header-glass);
		backdrop-filter: blur(12px);
		/*
		 * МЕЖА ПОТРІБНА САМЕ ЧЕРЕЗ ПРОЗОРІСТЬ.
		 *
		 * Без неї нижній край скла нічим не позначений: трек, що проїжджає під
		 * смугою, видно наполовину розмито й наполовину чисто, і місце переходу
		 * читається як обрізаний навпіл рядок. Лінія каже, що там закінчується
		 * панель, — і те саме місце перестає виглядати поламаним.
		 */
		border-bottom: 1px solid var(--border);
	}

	.shell__left {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		min-width: 0;
	}

	/* Не коло, а капсула: усередині ще й напис. Висота та сама. */
	.shell__back {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		min-height: var(--tap);
		padding-inline: var(--gap);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}

	/*
	 * Роль пристрою. Не кнопка й не посилання — просто відповідь на «що тут»,
	 * тож ні відступу на дотик, ні наведення в неї немає.
	 *
	 * `min-width: 0` разом із трикрапкою: на вузькому екрані поруч стоять знак,
	 * «назад» і два органи керування, і слово мусить різатися, а не розсувати
	 * смугу (1.4.10 міряє саме це — `a11y-layout.spec.ts`).
	 */
	.shell__role {
		/*
		 * ПО ЦЕНТРУ СМУГИ, а не поруч зі знаком.
		 *
		 * `flex: 1 1 0` між лівим блоком і органами керування: напис займає все,
		 * що лишилося, і центрується в ньому. Це не те саме, що центр екрана —
		 * ліворуч і праворуч стоять різні за шириною блоки, — але саме це око й
		 * читає як «посередині смуги».
		 *
		 * БАЗА НУЛЬ, а не `auto`, і це не дрібниця: з `auto` власна ширина слова
		 * входить у розрахунок, і на 320 px смуга переносила органи керування в
		 * ДРУГИЙ рядок — заміряно, висота шапки ставала 113 px замість 60. На
		 * телефоні це найдорожче місце екрана. З нулем слово стискається й
		 * ріжеться трикрапкою, а смуга лишається однорядковою.
		 *
		 * `min-width: 0` разом із трикрапкою: на 320 px поруч стоять знак,
		 * «назад» і два органи керування, і слово мусить різатися, а не
		 * розсувати смугу (1.4.10 міряє саме це — `a11y-layout.spec.ts`).
		 */
		flex: 1 1 0;
		min-width: 0;
		margin: 0;
		overflow: hidden;
		color: var(--text-primary);
		font-size: 1.05rem;
		font-weight: 700;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.shell__back:hover,
	.shell__back:focus-visible {
		color: var(--accent);
	}

	/*
	 * ТРИ ОРГАНИ ШАПКИ — ОДНА ФОРМА: знак, «Назад», налаштування.
	 *
	 * Знак і «Назад» стояли голими написами поруч із кнопкою налаштувань у
	 * власному колі: три сусіди в одному ряду, з яких один виглядає кнопкою, а
	 * двоє — ні, читаються як недороблені, а не як різні за призначенням.
	 *
	 * Рамки немає в жодного: тло вже відділяє їх від сторінки, а лінія поверх
	 * нього лише додає шуму в смугу, де й так три предмети.
	 */
	.shell__mark,
	.shell__back,
	.shell__settings {
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast);
		border: 0;
		border-radius: var(--radius-full);
		background: var(--bg-header-btn);
	}

	.shell__mark {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		color: var(--text-primary);
		text-decoration: none;
	}

	.shell__controls {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	/* Рівно така сама заввишки, як тугал поруч. */
	.shell__settings {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		color: var(--text-secondary);
	}

	.shell__mark:hover,
	.shell__mark:focus-visible,
	.shell__back:hover,
	.shell__back:focus-visible,
	.shell__settings:hover,
	.shell__settings:focus-visible {
		background: var(--bg-header-btn-hover);
		color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.shell__mark,
		.shell__back,
		.shell__settings {
			transition: none;
		}
	}

	/* Поламана сторінка: вміст межі помилки. */
	.crash {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap);
		padding: var(--gap-lg) var(--gap);
		text-align: center;
	}

	.crash__title {
		margin: 0;
		font-size: 1.3rem;
	}

	.crash__hint {
		margin: 0;
		max-width: 60ch;
		color: var(--text-secondary);
	}

	.crash__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap-sm);
	}
</style>
