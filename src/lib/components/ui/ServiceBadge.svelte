<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import { IconCheck, IconCopy } from '$lib/config/icons';
	import { debugMode } from '$lib/services/debugMode.svelte';
	import { createKeySequence } from '$lib/services/keySequence';
	import { logService } from '$lib/services/logService.svelte';

	let copied = $state(false);
	let fallbackReport = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	const versionSequence = createKeySequence({
		code: 'KeyV',
		threshold: () => debugMode.pressesToToggle,
		onComplete: () => {
			debugMode.toggle();
		}
	});

	function handleKeydown(event: KeyboardEvent) {
		versionSequence.handle(event);
	}

	const appVersion = $derived(logService.appVersion);
	const errorCount = $derived(logService.errorCount);

	const urlDebug = $derived(browser && page.url.searchParams.get('debug') === '1');
	const isVisible = $derived(urlDebug || debugMode.enabled);

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
</script>

<svelte:window onkeydown={handleKeydown} />

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
	<button
		type="button"
		class="service-badge"
		class:has-errors={errorCount > 0}
		class:copied
		onclick={copyReport}
		aria-label="Copy debug report — {appVersion}"
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
{/if}

<style>
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
	}

	@media (prefers-reduced-motion: reduce) {
		.service-badge {
			transition: none;
		}
	}
</style>
