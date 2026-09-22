import { largestFit } from './fit';

/**
 * ПІДПИСИ КНОПОК ВІДЖЕТА — ОДНИМ РОЗМІРОМ, НАЙБІЛЬШИМ, ЩО ВМІЩАЄТЬСЯ.
 *
 * Дія вішається на комірку віджета й підбирає розмір тексту для всіх її
 * кнопок разом. Разом — навмисно: кнопки однієї групи стоять стовпчиком поруч,
 * і коли «гучніше» написане великим, а «трохи гучніше» поруч дрібним, групу
 * читають як дві різні. Тому розмір один на віджет — найбільший, за якого не
 * вилазить ЖОДЕН підпис. Сусідні віджети при цьому незалежні: «увага» в
 * окремій комірці не мусить дрібнішати через довгу шкалу поруч.
 *
 * ## Коли перераховується
 *
 * Коли комірка змінила розмір (обертання телефона, вужче вікно, інша сітка) і
 * коли змінилися підписи. Розміру самої комірки текст не міняє: доріжки сітки
 * — `minmax(0, 1fr)`, тож спостерігач не зациклюється на власному результаті.
 *
 * ## Межі
 *
 * 11 точок знизу — нижче підпис уже не прочитати, і краще перенос, ніж
 * крапки. 26 зверху — щоб одне коротке слово в широкій кнопці не ставало
 * плакатом.
 *
 * ## ЧОМУ НЕ `requestAnimationFrame`
 *
 * Спершу перерахунок відкладався на кадр — і в прихованій вкладці не ставався
 * ніколи: кадрів у ній немає. Заміряно в панелі з `visibilityState: hidden`:
 * кадр за 800 мс не прийшов жодного разу, і розмір лишався запасним. А табло
 * саме й живе у фоні — на другому моніторі чи за іншим вікном; тому через
 * нього й існує вся система привертання уваги.
 *
 * Тому відкладається на мікрозадачу: вона виконується завжди, а вимір
 * (`scrollWidth`) сам змушує браузер розкласти сторінку, видима вона чи ні.
 * Кілька змін поспіль (розмір, підписи, шрифт) зливаються в один прохід.
 */

const MIN_PX = 11;
const MAX_PX = 26;

/**
 * Коефіцієнт зменшення розміру підписів від граничного (~18% запасу повітря,
 * щоб слова не впиралися в рамки кнопок).
 */
const SCALE = 0.82;

/** Чи вміщається вміст у кнопку. Пів точки допуску — субпіксельне округлення. */
const fitsIn = (key: HTMLElement) =>
	key.scrollWidth <= key.clientWidth + 0.5 && key.scrollHeight <= key.clientHeight + 0.5;

/**
 * @param labels — підписи віджета рядком; потрібні лише для того, щоб Svelte
 *   покликав `update`, коли людина перейменувала кнопку в складальнику.
 */
export function fitKeys(node: HTMLElement, labels: string) {
	void labels;
	let queued = false;
	let stopped = false;

	const run = () => {
		queued = false;
		if (stopped) return;
		const keys = [...node.querySelectorAll<HTMLElement>('button')];
		// Прихована комірка (чужий пульт) і комірка без кнопок — міряти нема чого.
		if (keys.length === 0 || node.clientWidth === 0) return;

		const size = largestFit(
			(px) => {
				node.style.setProperty('--key-size', `${px}px`);
				return keys.every(fitsIn);
			},
			MIN_PX,
			MAX_PX
		);
		const fitted = Math.max(MIN_PX, Math.round(size * SCALE * 2) / 2);
		node.style.setProperty('--key-size', `${fitted}px`);
	};

	const schedule = () => {
		if (queued) return;
		queued = true;
		queueMicrotask(run);
	};

	const watcher = new ResizeObserver(schedule);
	watcher.observe(node);
	/*
	 * Спостерігач розміру теж живе в кроках малювання, тож у прихованій вкладці
	 * мовчить. Заміряно: вікно звузили до ширини телефона, поки вкладка була
	 * прихована, — кнопки стали 61 точку завширшки, а підписи лишилися на 22 і
	 * вилазили всі п'ять. Повернення вкладки — окремий сигнал перерахувати.
	 */
	const onShow = () => {
		if (document.visibilityState === 'visible') schedule();
	};
	document.addEventListener('visibilitychange', onShow);
	// Шрифт, що доїхав пізніше, міняє ширину кожного слова.
	void document.fonts?.ready.then(schedule);
	schedule();

	return {
		update: schedule,
		destroy() {
			stopped = true;
			watcher.disconnect();
			document.removeEventListener('visibilitychange', onShow);
		}
	};
}
