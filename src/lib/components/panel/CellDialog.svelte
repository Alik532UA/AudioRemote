<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';
	import {
		MAX_BUTTONS,
		MAX_CAPTION,
		MAX_LABEL,
		MAX_STEP,
		MAX_PANEL_ICON,
		MAX_SHEET,
		MIN_STEP,
		type CellKind,
		type Panel,
		type PanelCell
	} from '$lib/net/panelTypes';
	import {
		expansionFor,
		fitInPlace,
		fits,
		shapeOf,
		sheetsOf,
		sizeOf,
		turned,
		type Grid,
		type Shape
	} from '$lib/panel/layout';
	import ButtonRows from './ButtonRows.svelte';
	import CellLook, { type CellLookDraft } from './CellLook.svelte';
	import CellShape from './CellShape.svelte';
	import CellFooter from './CellFooter.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';

	interface Props {
		index: string;
		cell: PanelCell | null;
		panel: Panel;
		onresize?: (grid: Grid) => void;
		onsave: (cell: PanelCell | null) => void;
		onclose: () => void;
	}

	let { index, cell, panel, onresize, onsave, onclose }: Props = $props();

	type Choice = CellKind | 'none';
	const KINDS: readonly Choice[] = ['none', 'buttons', 'slider', 'check'];

	const start = untrack(() => shapeOf(cell));

	let node = $state<HTMLDialogElement | null>(null);
	let kind = $state<Choice>(untrack(() => cell?.kind ?? 'none'));
	let step = $state(untrack(() => cell?.step ?? 10));
	let look = $state<CellLookDraft>(
		untrack(() => ({
			caption: cell?.caption ?? '',
			icon: cell?.icon ?? '',
			sheet: cell?.sheet ?? '',
			color: cell?.color ?? null,
			important: cell?.important === true
		}))
	);
	let shape = $state<Shape>(start.shape);
	let rows = $state(start.rows);
	let cols = $state(start.cols);
	let buttons = $state<{ label: string; color: string | null; hidden?: boolean }[]>(
		untrack(
			() =>
				cell?.buttons?.map((b) => ({
					label: b.label,
					color: b.color ?? null,
					hidden: b.hidden === true
				})) ?? [
					{ label: '', color: null },
					{ label: '', color: null },
					{ label: '', color: null }
				]
		)
	);

	$effect(() => {
		node?.showModal();
	});

	const ready = $derived(kind !== 'buttons' || buttons.some((b) => b.label.trim().length > 0));

	const kept = () =>
		buttons
			.slice(0, MAX_BUTTONS)
			.map((b) => ({
				label: b.label.trim().slice(0, MAX_LABEL),
				...(b.color ? { color: b.color } : {}),
				...(b.hidden ? { hidden: true } : {})
			}))
			.filter((b) => b.label.length > 0);

	const draft = $derived<PanelCell>({
		kind: kind === 'none' ? 'check' : kind,
		caption: look.caption,
		...(kind === 'buttons' ? { buttons: kept() } : {}),
		...(kind === 'slider' ? { step } : {}),
		...(shape === 'custom' ? { rows, cols } : {}),
		vertical: shape !== 'across'
	});

	const sheets = $derived(sheetsOf(panel));
	const size = $derived(sizeOf(draft));
	const span = $derived(kind === 'none' ? 1 : size.rows * size.cols);
	const roomy = $derived(kind === 'none' || fits(panel, index, size, index));

	const bestFitting = $derived(!roomy ? fitInPlace(panel, index, size, index) : null);
	const canShrink = $derived(bestFitting !== null);

	function shrinkFit() {
		if (!bestFitting) return;
		const sideways = turned(size);
		if (
			bestFitting.rows === sideways.rows &&
			bestFitting.cols === sideways.cols &&
			shape !== 'custom'
		) {
			shape = shape === 'down' ? 'across' : 'down';
			return;
		}
		shape = 'custom';
		rows = bestFitting.rows;
		cols = bestFitting.cols;
	}

	const expanded = $derived(!roomy ? expansionFor(panel, index, size, index) : null);
	const canExpandBoard = $derived(onresize !== undefined && expanded !== null);

	function expandBoard() {
		if (expanded && onresize) onresize(expanded);
	}

	function save() {
		if (kind === 'none') {
			onsave(null);
			node?.close();
			return;
		}

		const next: PanelCell = {
			kind,
			caption: look.caption.trim().slice(0, MAX_CAPTION),
			vertical: shape !== 'across',
			...(shape === 'custom' ? { rows, cols } : {}),
			...(look.color ? { color: look.color } : {}),
			...(look.important ? { important: true } : {}),
			...(look.sheet.trim() ? { sheet: look.sheet.trim().slice(0, MAX_SHEET) } : {}),
			...(look.icon.trim() ? { icon: look.icon.trim().slice(0, MAX_PANEL_ICON) } : {})
		};
		if (kind === 'buttons') next.buttons = kept();
		if (kind === 'slider') next.step = step;

		onsave(next);
		node?.close();
	}
</script>

<dialog
	bind:this={node}
	class="dialog"
	class:dialog--empty={kind === 'none'}
	data-testid="cell-modal"
	{onclose}
	onclick={(event) => {
		if (event.target === node) node?.close();
	}}
>
	<header class="dialog__head">
		<h2 class="dialog__title">{t('panel.cellTitle', { n: Number(index) + 1 })}</h2>
	</header>

	<div class="dialog__body">
		<!-- Чотири стовпці: що це, як виглядає, форма, вміст -->
		<div class="groups">
			<div class="group">
				<div class="field">
					<span class="field__label" id="cell-kind-label">{t('panel.kind')}</span>
					<Picker
						labelledby="cell-kind-label"
						value={kind}
						prefix="cell-kind"
						options={KINDS.map((which) => ({ value: which, label: t(`panelKind.${which}`) }))}
						onpick={(next) => (kind = next as Choice)}
					/>
				</div>
			</div>

			{#if kind !== 'none'}
				<CellLook {look} {sheets} />

				<div class="group">
					<CellShape
						{shape}
						{rows}
						{cols}
						{span}
						onshape={(next) => {
							if (next === 'custom' && shape !== 'custom') {
								rows = size.rows;
								cols = size.cols;
							}
							shape = next;
						}}
						onsize={(down, across) => {
							rows = down;
							cols = across;
						}}
					/>
				</div>

				{#if kind === 'buttons'}
					<div class="group">
						<div class="field">
							<span class="field__label">{t('panel.buttonsTitle')}</span>
							<ButtonRows
								rows={buttons}
								onadd={() => (buttons = [...buttons, { label: '', color: null }])}
								onremove={(pos) => (buttons = buttons.filter((_, i) => i !== pos))}
							/>
						</div>
					</div>
				{:else if kind === 'slider'}
					<div class="group">
						<div class="field">
							<label class="field__label" for="cell-step">{t('panel.step')}</label>
							<NumberStepper
								id="cell-step"
								value={step}
								min={MIN_STEP}
								max={MAX_STEP}
								label={t('panel.step')}
								onchange={(next) => (step = next)}
							/>
							<p class="muted">{t('panel.stepHint')}</p>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<CellFooter
		{ready}
		{roomy}
		{canShrink}
		{canExpandBoard}
		hasCell={cell !== null}
		onsave={save}
		onclose={() => node?.close()}
		onclear={() => {
			onsave(null);
			node?.close();
		}}
		onshrink={shrinkFit}
		onexpand={expandBoard}
	/>
</dialog>

<style>
	.dialog {
		display: flex;
		flex-direction: column;
		width: min(1080px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog--empty {
		width: min(440px, calc(100vw - 32px));
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap);
		border-bottom: 1px solid var(--border);
		background: var(--bg-surface);
		flex-shrink: 0;
	}

	.dialog__title {
		margin: 0;
		font-size: 1.1rem;
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		flex: 1 1 auto;
		overflow-y: auto;
		padding: var(--gap);
	}

	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
		gap: var(--gap);
		align-items: start;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		min-width: 0;
	}
</style>
