<!--
  РЕДАКТОР БЛОКІВ РОЗКЛАДУ З ПРЕСЕТАМИ ШКІЛЬНИХ ДЗВІНКІВ (§ 7.1, FLUID-SIZING-v9 § 7A).

  Дозволяє користувачу налаштовувати дні й часи як вручну, так і вибирати
  один із трьох типових пресетів дзвінків (початок, кінець або обидва).
-->
<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconPlus } from '$lib/config/icons';
	import {
		createSchoolPreset,
		emptyBlock,
		type ScheduleBlock,
		type SchoolPresetType
	} from '$lib/triggers/schedule';
	import ScheduleBlockCard from './ScheduleBlockCard.svelte';

	interface Props {
		blocks: ScheduleBlock[];
		onpreset?: (type: SchoolPresetType) => void;
	}

	let { blocks = $bindable(), onpreset }: Props = $props();

	if (!blocks || blocks.length === 0) {
		blocks = [emptyBlock()];
	}

	function applyPreset(type: SchoolPresetType) {
		blocks = createSchoolPreset(type);
		onpreset?.(type);
	}

	function updateBlock(updated: ScheduleBlock) {
		blocks = blocks.map((b) => (b.id === updated.id ? updated : b));
	}

	function removeBlock(blockId: string) {
		blocks = blocks.filter((b) => b.id !== blockId);
		if (blocks.length === 0) {
			blocks = [emptyBlock()];
		}
	}

	function addBlock() {
		blocks = [...blocks, emptyBlock()];
	}
</script>

<div class="schedule-editor" data-testid="schedule-editor-section">
	<div class="presets-section" data-testid="schedule-presets-section">
		<span class="presets-label">{t('schedule.presets')}</span>
		<div class="presets-row" role="toolbar" data-testid="schedule-presets-toolbar">
			<button
				type="button"
				class="btn btn--secondary preset-btn"
				onclick={() => applyPreset('start')}
				data-testid="schedule-preset-start-btn"
			>
				{t('schedule.presetStart')}
			</button>
			<button
				type="button"
				class="btn btn--secondary preset-btn"
				onclick={() => applyPreset('end')}
				data-testid="schedule-preset-end-btn"
			>
				{t('schedule.presetEnd')}
			</button>
			<button
				type="button"
				class="btn btn--secondary preset-btn"
				onclick={() => applyPreset('both')}
				data-testid="schedule-preset-both-btn"
			>
				{t('schedule.presetBoth')}
			</button>
		</div>
	</div>

	<div class="blocks-list">
		{#each blocks as block, bIndex (block.id)}
			<ScheduleBlockCard
				{block}
				index={bIndex}
				canRemove={blocks.length > 1}
				onupdate={updateBlock}
				onremove={() => removeBlock(block.id)}
			/>
		{/each}
	</div>

	<button
		type="button"
		class="btn btn--secondary add-block-btn"
		onclick={addBlock}
		data-testid="schedule-add-block-btn"
	>
		<IconPlus size={16} />
		{t('schedule.addBlock')}
	</button>
</div>

<style>
	.schedule-editor {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.presets-section {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		padding: var(--gap-sm);
		background: var(--bg-surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.presets-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.presets-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	.preset-btn {
		font-size: 0.8rem;
		padding: 4px 8px;
	}

	.blocks-list {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
	}

	.add-block-btn {
		align-self: flex-start;
		font-size: 0.85rem;
	}
</style>
