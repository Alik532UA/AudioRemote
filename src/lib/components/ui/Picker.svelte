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
	}

	interface Props {
		options: readonly Option[];
		value: string;
		/**
		 * Основа локатора: кнопка отримає `{prefix}-{значення}-radio`.
		 *
		 * САМЕ ОСНОВА, а не готовий рядок на кожен варіант. Готовий рядок довелося
		 * б збирати в JS того, хто кличе, — і тоді сканер локаторів
		 * (`testid.test.ts`) перестав би їх бачити взагалі: він читає розмітку.
		 * Гейт, повз який можна пройти, переставивши рядок в інший файл, не гейт.
		 */
		prefix: string;
		/** `id` підпису поруч. Або `label` — коли підпису на екрані немає. */
		labelledby?: string;
		label?: string;
		row?: boolean;
		onpick: (value: string) => void;
	}

	let { options, value, prefix, labelledby, label, row = false, onpick }: Props = $props();
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
			data-testid="{prefix}-{option.value}-radio"
		>
			<span class="picker__text" data-label={option.label}>{option.label}</span>
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

	/*
	 * РЯД ПЕРЕНОСИТЬСЯ, А НЕ ОБРІЗАЄ.
	 *
	 * Доти сегменти були рівні й мали право стиснутися до нуля (`flex: 1 1 0`,
	 * `min-width: 0`), а сам перемикач — `overflow: hidden`. Тобто довгий
	 * підпис не переносився й не зменшувався, а просто зникав за краєм: у
	 * бічній картці табла «Максимальне» обрізалося до «Максимальн», у вікні
	 * комірки «Свій розмір» ламався на два рядки всередині свого сегмента.
	 *
	 * Тепер сегмент не вужчий за свій підпис, а ряд, у який підписи не
	 * вміщаються, переходить на наступний рядок. Межі між сегментами —
	 * проміжком у пів точки на тлі кольору межі, а не рамкою кожного: рамка
	 * «ліворуч» на першому сегменті другого рядка стояла б біля самого краю.
	 */
	.picker--row {
		flex-flow: row wrap;
		gap: 1px;
		background: var(--border);
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
		min-width: max-content;
		justify-content: center;
		padding: 0 var(--gap-sm);
		border-top: 0;
		background: var(--bg-surface-raised);
	}

	/*
	 * ШИРИНА ЖИРНОГО ЗАРЕЗЕРВОВАНА НАПЕРЕД.
	 *
	 * Обраний сегмент пишеться жирним, а жирне ширше. Без запасу вибір сам
	 * міняв ширину сегментів — ряд стрибав під пальцем рівно в мить натискання,
	 * і вміщений підпис після вибору міг перестати вміщатися. Невидима жирна
	 * копія підпису нульової висоти задає ширину завжди, обраний він чи ні;
	 * `/ ""` ховає її від читача екрана, щоб слово не звучало двічі.
	 */
	.picker__text {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
	}

	.picker__text::after {
		content: attr(data-label) / '';
		block-size: 0;
		overflow: hidden;
		visibility: hidden;
		font-weight: 600;
		pointer-events: none;
		user-select: none;
	}

	.picker__item:first-child {
		border-top: 0;
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

	/* У ряду смуга йде знизу: збоку вона накладалася б на межу сусіда. */
	.picker--row .picker__item[aria-checked='true'] {
		box-shadow: inset 0 -3px 0 var(--accent);
	}
</style>
