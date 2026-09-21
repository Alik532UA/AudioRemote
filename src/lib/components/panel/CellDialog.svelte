<script lang="ts">
	import { untrack } from 'svelte';
	import { IconClose, IconTrash } from '$lib/config/icons';
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
	import { fits, shapeOf, sheetsOf, sizeOf, type Shape } from '$lib/panel/layout';
	import ButtonRows from './ButtonRows.svelte';
	import CellLook, { type CellLookDraft } from './CellLook.svelte';
	import CellShape from './CellShape.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';

	/**
	 * ЩО ПОСТАВИТИ В КОМІРКУ — одне вікно на всі три роди.
	 *
	 * Роди відрізняються двома полями (підписи кнопок, крок повзунка), а решта
	 * в них спільна: місце, підпис, збереження, спорожнення. Три вікна на три
	 * роди розійшлися б на першій же правці спільної половини, і розійшлися б
	 * мовчки.
	 *
	 * ## Чернетка, а не правка на місці
	 *
	 * Поки вікно відкрите, панель у базі не змінюється. Інакше кожна натиснута
	 * літера підпису їхала б у мережу — і, що гірше, на екран помічника в залі:
	 * він читав би «м», «мі», «мік», доки господар набирає.
	 *
	 * ## «Порожньо» — теж рід
	 *
	 * Спорожнити комірку можна двома шляхами: кнопкою внизу й вибором
	 * «Порожньо» серед родів. Другий потрібен тому, що людина, яка передумала
	 * ставити повзунок, шукає відповідь саме там, де вибирала.
	 */
	interface Props {
		/** Номер комірки, `'0'`…`'14'`. Показується людині як `номер + 1`. */
		index: string;
		cell: PanelCell | null;
		/** Уся панель — щоб знати, чи стане віджет такого розміру на це місце. */
		panel: Panel;
		/** `null` — прибрати комірку зовсім. */
		onsave: (cell: PanelCell | null) => void;
		onclose: () => void;
	}

	let { index, cell, panel, onsave, onclose }: Props = $props();

	type Choice = CellKind | 'none';
	const KINDS: readonly Choice[] = ['none', 'buttons', 'slider', 'check'];

	/*
	 * `untrack` — БО ЦЕ ЗНІМОК, а не звʼязок, і сказати про це треба прямо.
	 *
	 * Поля нижче — чернетка вікна. Вона береться з комірки РАЗ, при відкритті, і
	 * далі живе сама: панель у цю мить може змінитися (наприклад, прохання з
	 * зали перемкнуло чекбокс), і підхоплювати це посеред набору тексту означало
	 * б стирати щойно введене. Без `untrack` компілятор чесно питає, чи не
	 * забули ми `$derived`.
	 */
	const start = untrack(() => shapeOf(cell));

	let node = $state<HTMLDialogElement | null>(null);
	let kind = $state<Choice>(untrack(() => cell?.kind ?? 'none'));
	let step = $state(untrack(() => cell?.step ?? 10));
	/** Вигляд віджета одним об'єктом: його править `CellLook` на місці. */
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
	/*
	 * Кнопки живуть масивом об'єктів, бо в кожної їх тепер дві властивості —
	 * підпис і колір. Ключем у `{#each}` іде позиція: двох однакових полів тут
	 * не відрізнити ніяк, і порожній підпис не відрізнити від порожнього.
	 */
	let buttons = $state<{ label: string; color: string | null }[]>(
		untrack(
			() =>
				cell?.buttons?.map((button) => ({ label: button.label, color: button.color ?? null })) ?? [
					{ label: '', color: null },
					{ label: '', color: null },
					{ label: '', color: null }
				]
		)
	);

	$effect(() => {
		node?.showModal();
	});

	/**
	 * Чи є що зберігати.
	 *
	 * Заважає лише один випадок: група кнопок без жодного підпису. Така комірка
	 * зайняла б місце в сітці й не робила б нічого — і зрозуміти, чому вона не
	 * тиснеться, було б нізвідки. Решта родів своїх обов'язкових полів не має,
	 * а «Порожньо» — це прибирання, і воно законне завжди.
	 */
	const ready = $derived(
		kind !== 'buttons' || buttons.some((button) => button.label.trim().length > 0)
	);

	/** Порожні рядки — це не кнопки: людина лишила запасне поле незаповненим. */
	const kept = () =>
		buttons
			.slice(0, MAX_BUTTONS)
			.map((button) => ({
				label: button.label.trim().slice(0, MAX_LABEL),
				...(button.color ? { color: button.color } : {})
			}))
			.filter((button) => button.label.length > 0);

	/**
	 * ЧИ СТАНЕ ВІДЖЕТ НА ЦЕ МІСЦЕ — рахується на льоту, поки його складають.
	 *
	 * Кожна дописана кнопка робить віджет на клітинку довшим, і в якийсь момент
	 * він упирається в край сітки або в сусіда. Сказати про це треба ТУТ, доки
	 * видно обидва органи — кількість кнопок і поворот, — а не після збереження
	 * порожнім місцем у залі.
	 */
	const draft = $derived<PanelCell>({
		kind: kind === 'none' ? 'check' : kind,
		caption: look.caption,
		...(kind === 'buttons' ? { buttons: kept() } : {}),
		...(kind === 'slider' ? { step } : {}),
		...(shape === 'custom' ? { rows, cols } : {}),
		vertical: shape !== 'across'
	});

	/** Назви, які вже є на панелі: підказка, а не межа. */
	const sheets = $derived(sheetsOf(panel));

	const size = $derived(sizeOf(draft));
	const span = $derived(kind === 'none' ? 1 : size.rows * size.cols);
	const roomy = $derived(kind === 'none' || fits(panel, index, size, index));

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
	data-testid="cell-modal"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t('panel.cellTitle', { n: Number(index) + 1 })}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="cell-modal-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<!--
			ТРИ СТОВПЦІ, А НЕ ОДИН НА ВІСІМСОТ ТОЧОК УНИЗ.

			Полів тут вісім, і в один стовпець вони давали вікно, вище за екран:
			частина органів жила за прокруткою, тоді як обабіч лишалося порожньо.
			Стовпці зібрані за питаннями, а не за рівними частинами: «що це», «як
			воно виглядає», «скільки місця займає й що всередині».

			`auto-fit` із межею в 230 точок: на телефоні стовпець один, і розкладка
			згортається сама.
		-->
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
							/*
							 * «Свій розмір» починається з ТОГО, що зараз на екрані, а не з
							 * того, що було при відкритті вікна. Людина, яка щойно додала
							 * четверту кнопку, побачила б у лічильниках учорашні три — і
							 * мусила б спершу виправити число, якого не міняла.
							 */
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

					{#if kind === 'buttons'}
						<div class="field">
							<span class="field__label">{t('panel.buttonsTitle')}</span>
							<ButtonRows
								rows={buttons}
								onadd={() => (buttons = [...buttons, { label: '', color: null }])}
							/>
						</div>
					{:else if kind === 'slider'}
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
					{/if}
				</div>
			{/if}
		</div>

		{#if !roomy}
			<p class="error" role="alert" data-testid="cell-no-room-text">{t('panel.noRoom')}</p>
		{/if}

		<div class="acts">
			<button
				class="btn btn--primary"
				type="button"
				disabled={!ready || !roomy}
				onclick={save}
				data-testid="cell-save-btn"
			>
				{t('panel.save')}
			</button>

			{#if cell}
				<button
					class="btn btn--danger"
					type="button"
					onclick={() => {
						onsave(null);
						node?.close();
					}}
					data-testid="cell-clear-btn"
				>
					<IconTrash size={18} aria-hidden="true" />
					{t('panel.clearCell')}
				</button>
			{/if}
		</div>
	</div>
</dialog>

<style>
	.dialog {
		width: min(880px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		/* Прокручується ВМІСТ, а не саме вікно — так само, як у решті вікон. */
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		max-height: inherit;
		overflow: auto;
		padding: var(--gap-lg);
	}

	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		font-size: 1.1rem;
	}

	.groups {
		display: grid;
		/*
		 * `min(230px, 100%)`, а не голі 230px: гола довжина стає ПІДЛОГОЮ ширини,
		 * і на вузькому екрані сітка розпирає вікно замість того, щоб згорнутися
		 * в одну колонку (FLUID-SIZING-v9 § 1.1).
		 */
		grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));
		gap: var(--gap) var(--gap-lg);
		align-items: start;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		min-width: 0;
	}

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		/* Дії відбиті від полів: інакше «Зберегти» читається як ще одне поле. */
		padding-top: var(--gap-sm);
		border-top: 1px solid var(--border);
	}
</style>
