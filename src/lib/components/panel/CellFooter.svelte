<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconClose, IconTrash } from '$lib/config/icons';

	/**
	 * ПІДВАЛ ДІАЛОГУ КОМІРКИ: дії збереження, виходу та порятунку від тісноти.
	 */
	interface Props {
		ready: boolean;
		roomy: boolean;
		canShrink: boolean;
		canExpandBoard: boolean;
		hasCell: boolean;
		onsave: () => void;
		onclose: () => void;
		onclear: () => void;
		onshrink: () => void;
		onexpand: () => void;
	}

	let {
		ready,
		roomy,
		canShrink,
		canExpandBoard,
		hasCell,
		onsave,
		onclose,
		onclear,
		onshrink,
		onexpand
	}: Props = $props();
</script>

<footer class="dialog__footer">
	{#if !roomy}
		<div class="no-room" role="alert" data-testid="cell-no-room-banner">
			<p class="error no-room__text" data-testid="cell-no-room-text">{t('panel.noRoom')}</p>
			<div class="no-room__acts">
				{#if canShrink}
					<button
						class="btn btn--sm"
						type="button"
						onclick={onshrink}
						data-testid="cell-shrink-fit-btn"
					>
						{t('panel.shrinkFit')}
					</button>
				{/if}
				{#if canExpandBoard}
					<button
						class="btn btn--sm"
						type="button"
						onclick={onexpand}
						data-testid="cell-expand-board-btn"
					>
						{t('panel.expandBoard')}
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="acts">
		<button
			class="btn btn--primary"
			type="button"
			disabled={!ready || !roomy}
			onclick={onsave}
			data-testid="cell-save-btn"
		>
			{t('panel.save')}
		</button>

		<button class="btn" type="button" onclick={onclose} data-testid="cell-modal-close-btn">
			<IconClose size={18} aria-hidden="true" />
			{t('common.close')}
		</button>

		{#if hasCell}
			<button
				class="btn btn--danger acts__wipe"
				type="button"
				onclick={onclear}
				data-testid="cell-clear-btn"
			>
				<IconTrash size={18} aria-hidden="true" />
				{t('panel.clearCell')}
			</button>
		{/if}
	</div>
</footer>

<style>
	.dialog__footer {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: var(--gap);
		border-top: 1px solid var(--border);
		background: var(--bg-surface);
		flex-shrink: 0;
	}

	.no-room {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--danger, #e53e3e) 12%, var(--bg-surface));
		border: 1px solid color-mix(in oklab, var(--danger, #e53e3e) 30%, transparent);
	}

	.no-room__text {
		margin: 0;
		font-weight: 500;
	}

	.no-room__acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-xs);
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
	}

	.acts > :global(*) {
		flex: 0 0 auto;
	}

	.acts__wipe {
		margin-inline-start: auto;
	}
</style>
