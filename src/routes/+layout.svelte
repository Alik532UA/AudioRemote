<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import '$lib/css/base/tokens.css';
	import '$lib/css/base/base.css';
	import { themeState } from '$lib/services/theme.svelte';
	import { i18n, t } from '$lib/i18n/i18n.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import AppMark from '$lib/components/ui/AppMark.svelte';
	import ReloadPrompt from '$lib/components/ui/ReloadPrompt.svelte';
	import { IconBack, IconMenu, IconSettings } from '$lib/config/icons';
	import { mark, rotate } from '$lib/services/breadcrumbs';
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
	const atHome = $derived([root, `${root}/menu`].includes(page.url.pathname.replace(/\/$/, '')));

	/**
	 * «Назад» — це КРОК НАЗАД, а не стрибок на головну.
	 *
	 * Доти воно завжди вело в головне меню, і шлях «плеєр → налаштування →
	 * назад» викидав з дошки замість повернення до неї. Стрілка з таким
	 * написом обіцяє саме попереднє місце.
	 *
	 * Порожня історія буває, коли сторінку відкрили прямим посиланням: там
	 * `history.back()` вивів би людину із застосунку зовсім.
	 */
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

	const goBack = () => {
		if (window.history.length > 1) window.history.back();
		else void goto(resolve('/menu'));
	};

	onMount(() => {
		// Журнал першим: усе, що станеться далі, мусить у нього потрапити.
		rotate();
		mark('app:start');

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

		return unwatch;
	});
</script>

<!--
	ШАПКА — ЗНАК І ДВА ОРГАНИ КЕРУВАННЯ, більше нічого.

	Назва застосунку й підпис під нею тут були зайві: людина, яка відкрила
	застосунок, уже знає, що вона в ньому, а місце вгорі екрана телефона
	найдорожче. Заголовок сторінки тепер несе сама сторінка — і несе великим
	шрифтом, бо він там один.

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

			{#if ready && !atHome && !hideBack}
				<button class="shell__back" type="button" onclick={goBack} data-testid="back">
					<IconBack size={18} aria-hidden="true" />
					{t('common.back')}
				</button>
			{/if}
		</div>

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
		{@render children()}
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

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.shell__top {
		display: flex;
		flex: none;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-sm) 16px;
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
		transition: color var(--transition-fast);
		border: 0;
		border-radius: var(--radius-full);
		background: var(--bg-surface-raised);
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
		color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.shell__mark,
		.shell__back,
		.shell__settings {
			transition: none;
		}
	}
</style>
