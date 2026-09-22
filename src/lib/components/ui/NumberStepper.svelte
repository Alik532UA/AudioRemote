<script lang="ts">
	interface Props {
		value: number;
		min: number;
		max: number;
		/** `id` поля — він же основа локатора й ціль `<label for>`. */
		id: string;
		/** Що саме крутять. Іде в підпис кнопок для читалки. */
		label: string;
		square?: boolean;
		onchange: (next: number) => void;
	}

	let { value, min, max, id, label, square = false, onchange }: Props = $props();

	/**
	 * ЧОТИРИ КНОПКИ ЗАМІСТЬ РІДНОГО ЛІЧИЛЬНИКА.
	 *
	 * Стрілки, які браузер малює в `input[type=number]`, тут не працюють як
	 * орган керування: вони заввишки вісім пікселів кожна, стоять щільно одна
	 * над одною й на дотик не влучаються зовсім (44×44 — власний стандарт
	 * проєкту, `a11y-layout.spec.ts`). Поля ж ці крутять саме на телефоні: пауза
	 * між повторами й такт опитування — це те, що підбирають на місці.
	 *
	 * Крок два, а не один: «на скільки разів більше» майже завжди питання
	 * одиниць, а «на скільки секунд» — п'ятірок. Одна пара кнопок дає обидва
	 * без перемикача.
	 *
	 * Стрілки прибираються з самого поля (`appearance: textfield` плюс правило
	 * для WebKit): лишені, вони робили б те саме кроком в одиницю й поруч із
	 * власними кнопками читалися б як інший орган.
	 */
	const STEPS = [-5, -1, 1, 5] as const;

	/**
	 * Затиснути й округлити.
	 *
	 * Поле лишається текстовим для людини: у ньому можна стерти все й набрати
	 * своє. Тому порожній рядок і сміття не перетворюються на нуль — вони
	 * лишають значення, яке було.
	 */
	function commit(raw: number): void {
		if (!Number.isFinite(raw)) return;
		const next = Math.min(max, Math.max(min, Math.round(raw)));
		if (next !== value) onchange(next);
	}

	const stepTitle = (step: number): string => `${label}: ${step > 0 ? '+' : '−'}${Math.abs(step)}`;
</script>

<div class="stepper" class:stepper--square={square}>
	{#each STEPS as step (step)}
		{#if step < 0}
			<button
				class="stepper__btn"
				type="button"
				disabled={value <= min}
				aria-label={stepTitle(step)}
				title={stepTitle(step)}
				onclick={() => commit(value + step)}
				data-testid="{id}-minus{Math.abs(step)}-btn"
			>
				−{Math.abs(step)}
			</button>
		{/if}
	{/each}

	<input
		{id}
		class="input mono stepper__input"
		type="number"
		{min}
		{max}
		{value}
		inputmode="numeric"
		data-testid={id}
		oninput={(event) => commit(Number(event.currentTarget.value))}
	/>

	{#each STEPS as step (step)}
		{#if step > 0}
			<button
				class="stepper__btn"
				type="button"
				disabled={value >= max}
				aria-label={stepTitle(step)}
				title={stepTitle(step)}
				onclick={() => commit(value + step)}
				data-testid="{id}-plus{step}-btn"
			>
				+{step}
			</button>
		{/if}
	{/each}
</div>

<style>
	.stepper {
		display: flex;
		align-items: stretch;
		gap: var(--gap-xs);
	}

	.stepper__input {
		flex: 1 1 auto;
		min-width: 3.5rem;
		text-align: center;
		appearance: textfield;
	}

	.stepper--square {
		align-items: center;
		width: fit-content;
	}

	.stepper--square .stepper__btn {
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		display: grid;
		place-items: center;
		aspect-ratio: 1;
	}

	.stepper--square .stepper__input {
		flex: 0 0 calc(var(--tap) * 1.2);
		width: calc(var(--tap) * 1.2);
		height: calc(var(--tap) * 1.2);
		min-width: 0;
		padding-inline: 0;
		font-size: 1.15rem;
		aspect-ratio: 1;
	}

	.stepper__input::-webkit-outer-spin-button,
	.stepper__input::-webkit-inner-spin-button {
		margin: 0;
		appearance: none;
	}

	.stepper__btn {
		flex: 0 0 auto;
		min-width: var(--tap);
		min-height: var(--tap);
		padding-inline: var(--gap-xs);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-surface);
		color: var(--text-primary);
		font: inherit;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.stepper__btn:hover:not(:disabled),
	.stepper__btn:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	/*
	 * Межу видно, а не вгадують: на краю діапазону кнопка гасне, а не мовчки
	 * нічого не робить.
	 */
	.stepper__btn:disabled {
		color: var(--text-muted);
		cursor: default;
		opacity: 0.5;
	}
</style>
