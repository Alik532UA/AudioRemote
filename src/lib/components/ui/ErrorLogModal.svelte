<script lang="ts">
	import { focusTrap } from '$lib/utils/focusTrap';
	import { logService, type LogLevel } from '$lib/services/logService.svelte';
	import {
		IconBug,
		IconCheck,
		IconClose,
		IconCopy,
		IconInfo,
		IconTrash,
		IconWarning
	} from '$lib/config/icons';
	import { onDestroy } from 'svelte';

	interface Props {
		isOpen: boolean;
		onclose: () => void;
	}

	let { isOpen, onclose }: Props = $props();

	type FilterType = 'all' | LogLevel;
	let activeFilter = $state<FilterType>('all');
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	const logs = $derived(logService.logs);
	const errorCount = $derived(logs.filter((e) => e.level === 'error').length);
	const warnCount = $derived(logs.filter((e) => e.level === 'warn').length);
	const infoCount = $derived(logs.filter((e) => e.level === 'info').length);

	const filteredList = $derived(
		(activeFilter === 'all' ? logs : logs.filter((e) => e.level === activeFilter)).slice().reverse()
	);

	onDestroy(() => {
		if (copyTimer) clearTimeout(copyTimer);
	});

	async function handleCopy() {
		const report = logService.getReport();
		try {
			await navigator.clipboard.writeText(report);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1500);
		} catch (error) {
			logService.warn('ui', 'Failed to copy report from modal', error);
		}
	}

	function handleClear() {
		logService.clear();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	function formatTime(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleTimeString('uk-UA', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});
		} catch {
			return iso;
		}
	}
</script>

{#if isOpen}
	<div
		class="modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="error-log-modal-title"
		data-testid="error-log-modal-overlay"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose();
		}}
		onkeydown={handleKeydown}
		{@attach focusTrap()}
	>
		<div class="modal-card" data-testid="error-log-modal-container">
			<div class="modal-header" data-testid="error-log-modal-header">
				<div class="header-left">
					<div class="icon-wrap">
						<IconBug size={18} />
					</div>
					<div>
						<h2 id="error-log-modal-title" class="modal-title" data-testid="error-log-modal-title">
							Журнал помилок та подій
						</h2>
						<span class="version-badge">v{logService.appVersion}</span>
					</div>
				</div>
				<button
					type="button"
					class="btn-close"
					onclick={onclose}
					aria-label="Закрити"
					data-testid="error-log-modal-close-btn"
				>
					<IconClose size={18} />
				</button>
			</div>

			<div class="modal-toolbar">
				<div class="tabs" role="tablist" data-testid="error-log-modal-tabs">
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === 'all'}
						class="tab"
						class:tab--active={activeFilter === 'all'}
						onclick={() => (activeFilter = 'all')}
						data-testid="error-log-modal-all-tab"
					>
						Всі <span class="tab-badge">{logs.length}</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === 'error'}
						class="tab"
						class:tab--active={activeFilter === 'error'}
						onclick={() => (activeFilter = 'error')}
						data-testid="error-log-modal-error-tab"
					>
						Помилки <span class="tab-badge tab-badge--error">{errorCount}</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === 'warn'}
						class="tab"
						class:tab--active={activeFilter === 'warn'}
						onclick={() => (activeFilter = 'warn')}
						data-testid="error-log-modal-warn-tab"
					>
						Увага <span class="tab-badge tab-badge--warn">{warnCount}</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeFilter === 'info'}
						class="tab"
						class:tab--active={activeFilter === 'info'}
						onclick={() => (activeFilter = 'info')}
						data-testid="error-log-modal-info-tab"
					>
						Інфо <span class="tab-badge tab-badge--info">{infoCount}</span>
					</button>
				</div>

				<div class="actions">
					<button
						type="button"
						class="btn-action"
						class:btn-action--copied={copied}
						onclick={handleCopy}
						data-testid="error-log-modal-copy-btn"
						aria-label="Copy report"
					>
						{#if copied}
							<IconCheck size={14} />
							<span>Скопійовано</span>
						{:else}
							<IconCopy size={14} />
							<span>Копіювати звіт</span>
						{/if}
					</button>
					<button
						type="button"
						class="btn-action btn-action--danger"
						onclick={handleClear}
						disabled={logs.length === 0}
						data-testid="error-log-modal-clear-btn"
						aria-label="Clear logs"
					>
						<IconTrash size={14} />
						<span>Очистити</span>
					</button>
				</div>
			</div>

			<div class="modal-body" data-testid="error-log-modal-list">
				{#if filteredList.length === 0}
					<div class="empty-state" data-testid="error-log-modal-empty-message">
						<IconCheck size={28} class="empty-icon" />
						<p class="empty-text">Журнал порожній. Жодної події не зафіксовано!</p>
					</div>
				{:else}
					<div class="event-list">
						{#each filteredList as item, idx (idx)}
							<div class="event-card event-card--{item.level}">
								<div class="event-header">
									<div class="event-tags">
										{#if item.level === 'error'}
											<span class="level-pill level-pill--error">
												<IconWarning size={11} /> ERROR
											</span>
										{:else if item.level === 'warn'}
											<span class="level-pill level-pill--warn">
												<IconWarning size={11} /> WARN
											</span>
										{:else}
											<span class="level-pill level-pill--info">
												<IconInfo size={11} /> INFO
											</span>
										{/if}
										<span class="meta-pill">{item.category}</span>
									</div>
									<time class="event-time" title={item.timestamp}>
										{formatTime(item.timestamp)}
									</time>
								</div>
								<div class="event-message">{item.message}</div>
								{#if item.data}
									<details class="event-stack">
										<summary>Дані виклику</summary>
										<pre>{JSON.stringify(item.data, null, 2)}</pre>
									</details>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10001;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}
	.modal-card {
		background: #18181b;
		color: #f4f4f5;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		width: 100%;
		max-width: 800px;
		max-height: 85dvh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.03);
	}
	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}
	.modal-title {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.2;
		color: #ffffff;
	}
	.version-badge {
		font-size: 0.6875rem;
		font-family: ui-monospace, monospace;
		opacity: 0.6;
	}
	.btn-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: #f4f4f5;
		opacity: 0.7;
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			background 0.15s ease;
	}
	.btn-close:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
	}
	.modal-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 18px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.15);
		flex-wrap: wrap;
	}
	.tabs {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: #f4f4f5;
		opacity: 0.7;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.tab:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.05);
	}
	.tab--active {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		font-weight: 600;
	}
	.tab-badge {
		font-size: 0.6875rem;
		padding: 1px 5px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.15);
	}
	.tab-badge--error {
		background: #ef4444;
		color: #ffffff;
	}
	.tab-badge--warn {
		background: #f59e0b;
		color: #000000;
	}
	.tab-badge--info {
		background: #3b82f6;
		color: #ffffff;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.btn-action {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.05);
		color: #f4f4f5;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.btn-action:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
	}
	.btn-action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn-action--copied {
		background: #15803d !important;
		color: #ffffff !important;
		border-color: #15803d !important;
	}
	.btn-action--danger:hover:not(:disabled) {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.1);
	}
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 16px 18px;
		min-height: 200px;
	}
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 16px;
		opacity: 0.7;
	}
	.empty-text {
		margin: 0;
		font-size: 0.9375rem;
	}
	:global(.empty-icon) {
		color: #22c55e;
	}
	.event-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.event-card {
		padding: 10px 14px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-left-width: 4px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.event-card--error {
		border-left-color: #ef4444;
	}
	.event-card--warn {
		border-left-color: #f59e0b;
	}
	.event-card--info {
		border-left-color: #3b82f6;
	}
	.event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
	}
	.event-tags {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.level-pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-weight: 700;
		font-size: 0.625rem;
		padding: 1px 5px;
		border-radius: 4px;
		text-transform: uppercase;
	}
	.level-pill--error {
		background: #ef4444;
		color: #ffffff;
	}
	.level-pill--warn {
		background: #f59e0b;
		color: #000000;
	}
	.level-pill--info {
		background: #3b82f6;
		color: #ffffff;
	}
	.meta-pill {
		font-size: 0.6875rem;
		opacity: 0.6;
		font-family: ui-monospace, monospace;
	}
	.event-time {
		opacity: 0.5;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
	}
	.event-message {
		font-size: 0.8125rem;
		word-break: break-word;
		line-height: 1.4;
	}
	.event-stack {
		margin-top: 4px;
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.event-stack summary {
		cursor: pointer;
		user-select: none;
		font-size: 0.6875rem;
		opacity: 0.6;
	}
	.event-stack summary:hover {
		opacity: 1;
	}
	.event-stack pre {
		margin: 6px 0 0;
		padding: 8px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.4);
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-close,
		.tab,
		.btn-action {
			transition: none;
		}
	}
</style>
