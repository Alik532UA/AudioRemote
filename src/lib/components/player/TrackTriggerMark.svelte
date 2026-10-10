<script lang="ts">
	import { IconLater, IconZap } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import type { TrackTrigger } from '$lib/triggers/trigger';

	interface Props {
		trackId: string;
		trigger?: TrackTrigger | null;
		showTrigger: boolean;
		isQueued: boolean;
	}

	let { trackId, trigger, showTrigger, isQueued }: Props = $props();
</script>

{#if isQueued}
	<span class="badge badge--queued" data-testid="track-queued-{trackId}-badge">
		{t('schedule.queuedBadge')}
	</span>
{/if}

{#if showTrigger && trigger?.on}
	{#if trigger.mode === 'schedule'}
		<span
			class="tracks__zap"
			title={t('track.schedule')}
			aria-label={t('track.schedule')}
			data-testid="schedule-mark-{trackId}-icon"
		>
			<IconLater size={14} aria-hidden="true" />
		</span>
	{:else}
		<span
			class="tracks__zap"
			title={t('track.trigger')}
			aria-label={t('track.trigger')}
			data-testid="trigger-mark-{trackId}-icon"
		>
			<IconZap size={14} aria-hidden="true" />
		</span>
	{/if}
{/if}

<style>
	.tracks__zap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--accent);
	}

	.badge--queued {
		padding: 2px 6px;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--bg-surface);
		font-size: 0.7rem;
		font-weight: 600;
	}
</style>
