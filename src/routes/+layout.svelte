<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import '$lib/css/base/tokens.css';
	import '$lib/css/base/base.css';
	import { themeState } from '$lib/services/theme.svelte';
	import { i18n, t } from '$lib/i18n/i18n.svelte';
	import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
	import { IconSettings } from '$lib/config/icons';
	import ReloadPrompt from '$lib/components/ui/ReloadPrompt.svelte';

	let { children } = $props();

	let ready = $state(false);

	onMount(() => {
		// Обидва читають сховище й `window`, тож лише після монтування.
		themeState.init();
		i18n.init();
		ready = true;
	});
</script>

<div class="shell">
	<header class="shell__top">
		<a class="shell__brand" href={resolve('/')} data-testid="brand">
			<span class="shell__name">{t('app.name')}</span>
			<span class="shell__tagline">{t('app.tagline')}</span>
		</a>
		{#if ready}
			<!--
				У шапці лишається те, що перемикають часто: тема — одним рухом.
				Мова й третій стан теми («як у пристрої») живуть у налаштуваннях,
				бо їх ставлять раз.
			-->
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

	<footer class="shell__foot muted">
		<span>{t('app.name')} {__APP_VERSION__}</span>
	</footer>
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-sm) 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-surface);
	}

	.shell__brand {
		display: flex;
		flex-direction: column;
		color: inherit;
		text-decoration: none;
	}

	.shell__name {
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.shell__tagline {
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.shell__controls {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	.shell__settings {
		display: grid;
		place-items: center;
		width: var(--tap);
		min-height: var(--tap);
		border: 2px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
	}

	.shell__settings:hover,
	.shell__settings:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.shell__foot {
		margin-top: auto;
		padding: var(--gap) 16px calc(var(--gap) + env(safe-area-inset-bottom));
		text-align: center;
	}
</style>
