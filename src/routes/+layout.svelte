<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import '$lib/css/base/tokens.css';
	import '$lib/css/base/base.css';
	import { themeState } from '$lib/services/theme.svelte';
	import { i18n, t } from '$lib/i18n/i18n.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import AppMark from '$lib/components/ui/AppMark.svelte';
	import ReloadPrompt from '$lib/components/ui/ReloadPrompt.svelte';
	import { IconSettings } from '$lib/config/icons';

	let { children } = $props();

	let ready = $state(false);

	onMount(() => {
		// Обидва читають сховище й `window`, тож лише після монтування.
		themeState.init();
		i18n.init();
		ready = true;
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
		<a class="shell__mark" href={resolve('/')} title={t('app.name')} data-testid="brand">
			<AppMark size={34} />
			<span class="visually-hidden">{t('app.name')}</span>
		</a>

		{#if ready}
			<div class="shell__controls">
				<ThemeToggle />
				<a
					class="shell__settings"
					href={resolve('/settings')}
					title={t('settings.open')}
					aria-label={t('settings.open')}
					data-testid="go-settings"
				>
					<IconSettings size={20} aria-hidden="true" />
				</a>
			</div>
		{/if}
	</header>

	<main class="page">
		{@render children()}
	</main>
</div>

<ReloadPrompt />

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.shell__top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-sm) 16px;
	}

	.shell__mark {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		color: var(--text-primary);
		text-decoration: none;
	}

	.shell__controls {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	/*
	 * Кругла й рівно така сама заввишки, як тугал поруч: два органи керування в
	 * одному ряду з різною висотою читаються як недороблені, а не як різні.
	 */
	.shell__settings {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		transition:
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.shell__settings:hover,
	.shell__settings:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.shell__settings {
			transition: none;
		}
	}
</style>
