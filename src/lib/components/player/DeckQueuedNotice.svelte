<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconClose } from '$lib/config/icons';

	interface Props {
		title: string;
		oncancel: () => void;
	}

	let { title, oncancel }: Props = $props();
</script>

<div class="deck__queued" data-testid="deck-queued-section">
	<span class="deck__queued-text" data-testid="deck-queued-text">
		{t('schedule.nextQueued', { track: title })}
	</span>
	<button
		type="button"
		class="deck__queued-cancel"
		title={t('schedule.cancelQueue')}
		aria-label={t('schedule.cancelQueue')}
		onclick={oncancel}
		data-testid="deck-cancel-queued-btn"
	>
		<IconClose size={16} />
	</button>
</div>

<style>
	.deck__queued {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-xs);
		padding: 4px 8px;
		background: var(--accent-soft);
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
	}

	.deck__queued-cancel {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.deck__queued-cancel:hover {
		color: var(--text-primary);
	}
</style>
