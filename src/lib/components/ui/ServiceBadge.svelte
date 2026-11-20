<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import { IconBug, IconCheck, IconCopy, IconEyeOff, IconTrash } from '$lib/config/icons';
	import { debugMode } from '$lib/services/debugMode.svelte';
	import { createKeySequence } from '$lib/services/keySequence';
	import { logService } from '$lib/services/logService.svelte';
	import ErrorLogModal from './ErrorLogModal.svelte';

	let copied = $state(false);
	let fallbackReport = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	let menuOpen = $state(false);
	let modalOpen = $state(false);
	let userDismissed = $state(false);

	const versionSequence = createKeySequence({
		code: 'KeyV',
		threshold: () => debugMode.pressesToToggle,
		onComplete: () => {
			debugMode.toggle();
		}
	});

	function handleKeydown(event: KeyboardEvent) {
		versionSequence.handle(event);
		if (event.key === 'Escape' && menuOpen) {
			menuOpen = false;
		}
	}

	function handleWindowClick(e: MouseEvent) {
		if (!menuOpen) return;
		const target = e.target as HTMLElement | null;
		if (!target?.closest('.service-badge-wrapper')) {
			menuOpen = false;
		}
	}

	const appVersion = $derived(logService.appVersion);
	const errorCount = $derived(logService.errorCount);

	$effect(() => {
		if (debugMode.enabled) userDismissed = false;
	});

	const urlDebug = $derived(browser && page.url.searchParams.get('debug') === '1');
	const isVisible = $derived(!userDismissed && (urlDebug || debugMode.enabled));

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
	});

	async function copyReport() {
		const report = logService.getReport();
		try {
			await navigator.clipboard.writeText(report);
			fallbackReport = null;
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1500);
		} catch (error) {
			logService.warn('ui', 'Failed to copy log report to clipboard', error);
			fallbackReport = report;
		}
	}

	async function handleAction(action: 'copy' | 'modal' | 'clear' | 'hide') {
		menuOpen = false;
		if (action === 'copy') await copyReport();
		else if (action === 'modal') modalOpen = true;
		else if (action === 'clear') logService.clear();
		else if (action === 'hide') {
			userDismissed = true;
			if (debugMode.enabled) debugMode.toggle();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

{#if fallbackReport}
	<textarea
		class="log-fallback"
		readonly
		value={fallbackReport}
		aria-label="Debug report fallback"
		data-testid="service-badge-report-textarea"
	></textarea>
{/if}

{#if isVisible}
	<div class="service-badge-wrapper">
		{#if menuOpen}
			<div class="menu" role="menu" data-testid="service-badge-context-menu">
				<button
					type="button"
					class="menu-item"
					role="menuitem"
					onclick={() => handleAction('copy')}
					data-testid="service-badge-copy-report-btn"
				>
					<IconCopy size={14} />
					<span class="menu-item__text">Скопіювати повний звіт</span>
				</button>
				<button
					type="button"
					class="menu-item"
					role="menuitem"
					onclick={() => handleAction('modal')}
					data-testid="service-badge-view-errors-btn"
				>
					<IconBug size={14} />
					<span class="menu-item__text">Переглянути помилки</span>
					<span class="menu-item__count" class:menu-item__count--has-errors={errorCount > 0}>
						{errorCount > 99 ? '99+' : errorCount}
					</span>
				</button>
				<button
					type="button"
					class="menu-item"
					role="menuitem"
					onclick={() => handleAction('clear')}
					data-testid="service-badge-clear-btn"
				>
					<IconTrash size={14} />
					<span class="menu-item__text">Скинути лічильник</span>
				</button>
				<div class="menu-separator" role="separator"></div>
				<button
					type="button"
					class="menu-item menu-item--hide"
					role="menuitem"
					onclick={() => handleAction('hide')}
					data-testid="service-badge-hide-btn"
				>
					<IconEyeOff size={14} />
					<span class="menu-item__text">Приховати табло</span>
				</button>
			</div>
		{/if}

		<button
			type="button"
			class="service-badge"
			class:has-errors={errorCount > 0}
			class:copied
			onclick={() => (menuOpen = !menuOpen)}
			oncontextmenu={(e) => {
				e.preventDefault();
				menuOpen = true;
			}}
			aria-label="Copy debug report — {appVersion}"
			aria-haspopup="menu"
			aria-expanded={menuOpen}
			data-testid="app-version-value"
		>
			{#if copied}
				<IconCheck size={14} class="hint-icon" />
			{:else if errorCount > 0}
				<span class="count">{errorCount > 99 ? '99+' : errorCount}</span>
			{:else}
				<IconCopy size={12} class="hint-icon" />
			{/if}
			<span class="version">{appVersion}</span>
		</button>
	</div>
{/if}

<ErrorLogModal isOpen={modalOpen} onclose={() => (modalOpen = false)} />

<style>
	.service-badge-wrapper {
		display: contents;
	}

	.menu {
		position: fixed;
		bottom: 56px;
		left: 16px;
		z-index: 10000;
		display: flex;
		flex-direction: column;
		min-width: 210px;
		padding: 6px;
		border-radius: 12px;
		background: #242424;
		border: 1px solid #444444;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #ffffff;
		cursor: pointer;
		font-size: 0.8125rem;
		text-align: left;
		transition: background 0.15s ease;
	}

	.menu-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.menu-item__text {
		flex: 1;
	}

	.menu-item__count {
		font-size: 0.6875rem;
		font-weight: 700;
		padding: 1px 5px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.menu-item__count--has-errors {
		background: #7f1d1d;
		color: #ffffff;
	}

	.menu-separator {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 4px 0;
	}

	.menu-item--hide {
		opacity: 0.8;
	}

	.menu-item--hide:hover {
		opacity: 1;
		color: #ef4444;
	}

	.service-badge {
		position: fixed;
		bottom: 16px;
		left: 16px;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 0 10px;
		border-radius: 16px;
		background: #242424;
		color: #ffffff;
		border: 1px solid #444444;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		cursor: pointer;
		font-family: inherit;
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.service-badge:hover {
		transform: scale(1.05);
	}

	.service-badge.has-errors {
		background: #c92a2a;
		border-color: #7f1d1d;
		color: #ffffff;
	}

	.service-badge.copied {
		background: #237a35;
		border-color: #1b5e20;
		color: #ffffff;
	}

	.count {
		padding: 2px 5px;
		border-radius: 8px;
		background: #7f1d1d;
		color: #ffffff;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
		font-family: monospace;
	}

	.version {
		font-size: 11px;
		font-family: monospace;
		line-height: 1;
		white-space: nowrap;
	}

	.log-fallback {
		position: fixed;
		bottom: 60px;
		left: 16px;
		right: 16px;
		height: 40dvh;
		z-index: 9999;
		padding: 8px;
		font-family: monospace;
		font-size: 0.75rem;
		background: #1e1e1e;
		color: #ffffff;
		border: 2px solid #ef4444;
		border-radius: 8px;
		resize: none;
	}

	@media (pointer: coarse) {
		.service-badge {
			min-height: 44px;
			padding: 0 14px;
			border-radius: 22px;
		}

		.version {
			font-size: 12px;
		}

		.menu {
			bottom: 68px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.service-badge,
		.menu-item {
			transition: none;
		}
	}

	@media print {
		.service-badge,
		.menu,
		.log-fallback {
			display: none !important;
		}
	}
</style>
