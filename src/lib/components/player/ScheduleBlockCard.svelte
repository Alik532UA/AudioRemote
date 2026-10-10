<!--
  КАРТКА ОКРЕМОГО БЛОКУ РОЗКЛАДУ (§ 7.1, FLUID-SIZING-v9 § 7A).

  Винесена з ScheduleEditor, щоб редактор залишався під лімітом 300 рядків.
  Містить вибір днів тижня та список точок часу з полем додавання.
-->
<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconClose, IconPlus, IconTrash } from '$lib/config/icons';
	import { parseTimes, type ScheduleBlock } from '$lib/triggers/schedule';

	interface Props {
		block: ScheduleBlock;
		index: number;
		canRemove: boolean;
		onupdate: (block: ScheduleBlock) => void;
		onremove: () => void;
	}

	let { block, index, canRemove, onupdate, onremove }: Props = $props();

	let inputValue = $state('');

	const DAY_KEYS = [
		'week.mon',
		'week.tue',
		'week.wed',
		'week.thu',
		'week.fri',
		'week.sat',
		'week.sun'
	] as const;

	function toggleDay(day: number) {
		const nextDays = block.days.includes(day)
			? block.days.filter((d) => d !== day)
			: [...block.days, day].sort((a, b) => a - b);
		onupdate({ ...block, days: nextDays });
	}

	function addTimes() {
		const raw = inputValue.trim();
		if (!raw) return;
		const parsed = parseTimes(raw);
		if (parsed.length === 0) return;

		const merged = new Set([...block.times, ...parsed]);
		const nextTimes = [...merged].sort((a, b) => a.localeCompare(b));
		onupdate({ ...block, times: nextTimes });
		inputValue = '';
	}

	function removeTime(time: string) {
		const nextTimes = block.times.filter((t) => t !== time);
		onupdate({ ...block, times: nextTimes });
	}
</script>

<div class="block-card card" data-testid="schedule-block-{index}-card">
	<div class="block-head">
		<span class="block-label">{t('schedule.blockDays')}</span>
		{#if canRemove}
			<button
				type="button"
				class="btn-icon"
				title={t('schedule.removeBlock')}
				aria-label={t('schedule.removeBlock')}
				onclick={onremove}
				data-testid="schedule-block-{index}-remove-btn"
			>
				<IconTrash size={16} />
			</button>
		{/if}
	</div>

	<div class="days-row">
		{#each DAY_KEYS as dayKey, dIndex (dayKey)}
			<button
				type="button"
				role="checkbox"
				aria-checked={block.days.includes(dIndex)}
				class="week__day"
				onclick={() => toggleDay(dIndex)}
				data-testid="schedule-block-{index}-day-{dIndex}-btn"
			>
				{t(dayKey)}
			</button>
		{/each}
	</div>

	<div class="times-section">
		<span class="block-label">{t('schedule.blockTimes')}</span>

		{#if block.times.length === 0}
			<p class="muted" data-testid="schedule-block-{index}-no-times-text">
				{t('schedule.noTimes')}
			</p>
		{:else}
			<div class="chips" data-testid="schedule-block-{index}-times-list">
				{#each block.times as time, tIndex (time)}
					<span class="chip" data-testid="schedule-block-{index}-time-{tIndex}-item">
						<span class="mono">{time}</span>
						<button
							type="button"
							class="chip__remove"
							onclick={() => removeTime(time)}
							aria-label={t('schedule.removeBlock')}
							data-testid="schedule-block-{index}-time-{tIndex}-remove-btn"
						>
							<IconClose size={12} />
						</button>
					</span>
				{/each}
			</div>
		{/if}

		<div class="time-input-row">
			<input
				type="text"
				class="input time-input"
				aria-label={t('schedule.blockTimes')}
				placeholder={t('schedule.timePlaceholder')}
				bind:value={inputValue}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addTimes();
					}
				}}
				data-testid="schedule-block-{index}-time-input"
			/>
			<button
				type="button"
				class="btn btn--secondary time-add-btn"
				onclick={addTimes}
				data-testid="schedule-block-{index}-add-time-btn"
			>
				<IconPlus size={16} />
				{t('schedule.addTime')}
			</button>
		</div>
	</div>
</div>

<style>
	.block-card {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: var(--gap-sm);
		background: var(--bg-surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.block-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.btn-icon {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.btn-icon:hover {
		background: var(--bg-sunken);
		color: var(--warn);
	}

	.days-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.week__day {
		flex: 1 1 0;
		min-width: 2rem;
		min-height: 32px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
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

	.times-section {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		font-size: 0.8rem;
	}

	.chip__remove {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.chip__remove:hover {
		color: var(--text-primary);
	}

	.time-input-row {
		display: flex;
		gap: var(--gap-xs);
		margin-top: 4px;
	}

	.time-input {
		flex: 1 1 0;
		min-width: 0;
		font-size: 0.85rem;
		padding: 4px 8px;
	}

	.time-add-btn {
		flex: none;
		font-size: 0.8rem;
		padding: 4px 10px;
	}
</style>
