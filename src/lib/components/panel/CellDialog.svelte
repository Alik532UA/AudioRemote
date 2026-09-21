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
		MIN_STEP,
		type CellKind,
		type Panel,
		type PanelCell
	} from '$lib/net/panelTypes';
	import { fits, spanOf } from '$lib/panel/layout';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';
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
	let node = $state<HTMLDialogElement | null>(null);
	let kind = $state<Choice>(untrack(() => cell?.kind ?? 'none'));
	let caption = $state(untrack(() => cell?.caption ?? ''));
	let step = $state(untrack(() => cell?.step ?? 10));
	let vertical = $state(untrack(() => cell?.vertical !== false));
	let color = $state<string | null>(untrack(() => cell?.color ?? null));
	let icon = $state(untrack(() => cell?.icon ?? ''));
	/*
	 * Підписи кнопок живуть окремим масивом рядків, а не масивом об'єктів:
	 * `bind:value` на полі всередині `{#each}` по об'єктах вимагав би ключа,
	 * якого в них немає, — порожній підпис не відрізнити від порожнього
	 * підпису.
	 */
	let labels = $state<string[]>(
		untrack(() => cell?.buttons?.map((button) => button.label) ?? ['', '', ''])
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
	const ready = $derived(kind !== 'buttons' || labels.some((label) => label.trim().length > 0));

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
		caption,
		...(kind === 'buttons'
			? { buttons: labels.filter((label) => label.trim().length > 0).map((label) => ({ label })) }
			: {}),
		...(kind === 'slider' ? { step } : {}),
		vertical
	});

	const span = $derived(kind === 'none' ? 1 : spanOf(draft));
	const roomy = $derived(kind === 'none' || fits(panel, index, span, vertical, index));

	function save() {
		if (kind === 'none') {
			onsave(null);
			node?.close();
			return;
		}

		const next: PanelCell = {
			kind,
			caption: caption.trim().slice(0, MAX_CAPTION),
			vertical,
			...(color ? { color } : {}),
			...(icon.trim() ? { icon: icon.trim().slice(0, MAX_PANEL_ICON) } : {})
		};
		if (kind === 'buttons') {
			// Порожні рядки — це не кнопки: людина лишила запасне поле незаповненим.
			next.buttons = labels
				.map((label) => label.trim().slice(0, MAX_LABEL))
				.filter((label) => label.length > 0)
				.map((label) => ({ label }));
		}
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

		{#if kind !== 'none'}
			<div class="field">
				<label class="field__label" for="cell-caption">{t('panel.caption')}</label>
				<input
					id="cell-caption"
					class="input"
					type="text"
					maxlength={MAX_CAPTION}
					bind:value={caption}
					data-testid="cell-caption-input"
				/>
				<p class="muted">{t('panel.captionHint')}</p>
			</div>

			<!--
				ЗНАЧОК І КОЛІР — ті самі, що в треків, і з тієї ж причини: у темному
				залі шукають очима те, що впізнають, а не читають підпис. Клавіатуру
				емодзі відкриває сама система (Win+. на компʼютері), тож поле тут
				звичайне текстове.
			-->
			<div class="field">
				<label class="field__label" for="cell-icon">{t('panel.icon')}</label>
				<input
					id="cell-icon"
					class="input input--icon"
					type="text"
					maxlength={MAX_PANEL_ICON}
					bind:value={icon}
					placeholder={t('track.emojiHint')}
					data-testid="cell-icon-input"
				/>
			</div>

			<div class="field">
				<span class="field__label">{t('panel.color')}</span>
				<ColorPalette value={color} testid="cell-swatch" onpick={(slug) => (color = slug)} />
			</div>

			<!--
				ПОВОРОТ — ТУТ, А НЕ ЛИШЕ КОЛЕСОМ МИШІ. Колесом швидше, але його немає
				ні на телефоні, ні з клавіатури, а без повороту панель не скласти.
			-->
			<div class="field">
				<span class="field__label" id="cell-turn-label">{t('panel.turn')}</span>
				<Picker
					row
					labelledby="cell-turn-label"
					value={vertical ? 'down' : 'across'}
					prefix="cell-turn"
					options={[
						{ value: 'down', label: t('panel.turnDown') },
						{ value: 'across', label: t('panel.turnAcross') }
					]}
					onpick={(next) => (vertical = next === 'down')}
				/>
				<p class="muted">{t('panel.spanHint', { count: span })}</p>
			</div>
		{/if}

		{#if !roomy}
			<p class="error" role="alert" data-testid="cell-no-room-text">{t('panel.noRoom')}</p>
		{/if}

		{#if kind === 'buttons'}
			<div class="field">
				<span class="field__label">{t('panel.buttonsTitle')}</span>
				{#each labels as _, position (position)}
					<label class="visually-hidden" for="cell-label-{position}">
						{t('panel.buttonLabel', { n: position + 1 })}
					</label>
					<input
						id="cell-label-{position}"
						class="input"
						type="text"
						maxlength={MAX_LABEL}
						placeholder={t('panel.buttonLabel', { n: position + 1 })}
						bind:value={labels[position]}
						data-testid="cell-label-{position}-input"
					/>
				{/each}

				{#if labels.length < MAX_BUTTONS}
					<button
						class="btn btn--sm"
						type="button"
						onclick={() => (labels = [...labels, ''])}
						data-testid="cell-add-label-btn"
					>
						{t('panel.addButton')}
					</button>
				{/if}
				<p class="muted">{t('panel.buttonsHint')}</p>
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
		width: min(480px, calc(100vw - 32px));
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

	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}
</style>
