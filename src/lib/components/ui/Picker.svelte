<script lang="ts">
	/**
	 * ВИБІР ОДНОГО З КІЛЬКОХ — кнопки без власних рамок у спільній рамці.
	 *
	 * Не випадний список. Список ховає варіанти за одним рядком: щоб побачити, з
	 * чого взагалі можна обирати, треба спершу його відкрити. Тут видно все
	 * одразу, і обраний видно теж — без жодного натискання.
	 *
	 * ## Чому окремим компонентом
	 *
	 * Бо цих самих сорока рядків CSS у проєкті вже було три копії: у
	 * налаштуваннях (що відкривати при запуску), у вікні віджета (рід і поворот)
	 * і на таблі (що показувати). Копії розходяться тихо — спершу висотою,
	 * потім смужкою обраного, — і те саме рішення починає виглядати як три різні.
	 *
	 * ## Стовпчиком чи рядком
	 *
	 * Стовпчиком, коли підписи довгі («Підключення до дошки»); рядком, коли
	 * короткі й їх видно поруч («Стовпчиком / Рядком»). Це не смак: п'ять
	 * довгих підписів у ряд розсипаються на п'ять рядків із проміжками й
	 * перестають читатися як ОДИН вибір.
	 */
	interface Option {
		value: string;
		label: string;
		/** Готовий локатор кнопки — щоб кожне місце називало свої по-своєму. */
		testid: string;
	}

	interface Props {
		options: readonly Option[];
		value: string;
		/** `id` підпису поруч. Або `label` — коли підпису на екрані немає. */
		labelledby?: string;
		label?: string;
		row?: boolean;
		onpick: (value: string) => void;
	}

	let { options, value, labelledby, label, row = false, onpick }: Props = $props();
</script>

<div
	class="picker"
	class:picker--row={row}
	role="radiogroup"
	aria-labelledby={labelledby}
	aria-label={label}
>
	{#each options as option (option.value)}
		<button
			class="picker__item"
			type="button"
			role="radio"
			aria-checked={value === option.value}
			onclick={() => onpick(option.value)}
			data-testid={option.testid}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
	}

	.picker--row {
		flex-direction: row;
	}

	.picker__item {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 0;
		border-top: 1px solid var(--border);
		background: none;
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker--row .picker__item {
		flex: 1 1 0;
		min-width: 0;
		justify-content: center;
		padding: 0 var(--gap-xs);
		border-top: 0;
		border-inline-start: 1px solid var(--border);
	}

	.picker__item:first-child {
		border-top: 0;
		border-inline-start: 0;
	}

	.picker__item:hover,
	.picker__item:focus-visible {
		background: var(--bg-sunken);
	}

	/*
	 * Обраний позначено смугою збоку, а не самим лише тлом: тло в темній темі
	 * відрізняється на кілька відсотків яскравості й на проєкторі в залі
	 * зникає зовсім.
	 */
	.picker__item[aria-checked='true'] {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}

	/* У ряду смуга йде зверху: збоку вона накладалася б на межу сусіда. */
	.picker--row .picker__item[aria-checked='true'] {
		box-shadow: inset 0 3px 0 var(--accent);
	}
</style>
