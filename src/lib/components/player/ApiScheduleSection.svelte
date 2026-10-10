<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { defaultSchedule, withinSchedule, type WeekSchedule } from '$lib/triggers/trigger';

	interface Props {
		schedule?: WeekSchedule | null;
	}

	let { schedule = $bindable() }: Props = $props();

	const DAYS = [
		'week.mon',
		'week.tue',
		'week.wed',
		'week.thu',
		'week.fri',
		'week.sat',
		'week.sun'
	] as const;

	let scheduleOn = $state(untrack(() => Boolean(schedule)));
	const asleep = $derived(scheduleOn && !withinSchedule(schedule));

	function toggleSchedule(next: boolean) {
		scheduleOn = next;
		schedule = next ? (schedule ?? defaultSchedule()) : null;
	}

	function sameEveryDay() {
		const first = schedule?.[0];
		if (!schedule || !first) return;
		schedule = schedule.map((day) => ({ ...day, from: first.from, to: first.to }));
	}
</script>

<div class="field">
	<Switch
		checked={scheduleOn}
		label={t('trigger.schedule')}
		testid="trigger-schedule"
		onchange={toggleSchedule}
	/>

	{#if scheduleOn && schedule}
		<ul class="week">
			{#each schedule as day, index (index)}
				<li class="week__row" class:week__row--off={!day.on}>
					<button
						class="week__day"
						type="button"
						role="switch"
						aria-checked={day.on}
						onclick={() => (day.on = !day.on)}
						data-testid="week-on-{index}"
					>
						{t(DAYS[index])}
					</button>
					<input
						class="input week__time"
						type="time"
						aria-label={t('week.from', { day: t(DAYS[index]) })}
						value={day.from}
						disabled={!day.on}
						oninput={(event) => (day.from = event.currentTarget.value)}
						data-testid="week-from-{index}"
					/>
					<span class="week__dash">–</span>
					<input
						class="input week__time"
						type="time"
						aria-label={t('week.to', { day: t(DAYS[index]) })}
						value={day.to}
						disabled={!day.on}
						oninput={(event) => (day.to = event.currentTarget.value)}
						data-testid="week-to-{index}"
					/>
				</li>
			{/each}
		</ul>

		<button class="week__same" type="button" onclick={sameEveryDay} data-testid="week-same">
			{t('trigger.scheduleSame')}
		</button>

		<p class="muted">{t('trigger.scheduleHint')}</p>
		{#if asleep}
			<p class="note note--warn" data-testid="schedule-asleep">
				<span>{t('trigger.scheduleNow')}</span>
			</p>
		{/if}
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.week {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: var(--gap-xs) 0 0;
		padding: 0;
		list-style: none;
	}

	.week__row {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
	}

	.week__row--off {
		opacity: 0.55;
	}

	.week__day {
		flex: none;
		width: 2.6rem;
		min-height: 32px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.week__day[aria-checked='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.week__dash {
		flex: none;
		color: var(--text-muted);
	}

	.week__time {
		flex: 1 1 0;
		min-width: 0;
		min-height: 32px;
		padding-inline: var(--gap-xs);
		font-size: 0.85rem;
	}

	.week__time::-webkit-calendar-picker-indicator {
		display: none;
	}

	.week__same {
		align-self: start;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.8rem;
		word-break: break-word;
	}

	.note--warn {
		color: var(--warn);
	}
</style>
