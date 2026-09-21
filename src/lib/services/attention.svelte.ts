import { colorOf } from '$lib/config/trackColors';
import { readItem, writeItem } from './storage';

/**
 * ЯК ГУЧНО ТАБЛО ГУКАЄ ЗВУКОРЕЖИСЕРА.
 *
 * Помічник у залі натиснув — і далі все залежить від того, куди дивиться
 * людина за пультом. А дивиться вона на пульт, у зал або в ноти, тобто не на
 * екран. Підсвічена кнопка й рядок у журналі відповідають на питання «що саме
 * попросили» і не відповідають на «попросили ВЗАГАЛІ».
 *
 * ЦЕ РІШЕННЯ ПРО МОНІТОР, а не про зал. Вибирає його звукорежисер для власної
 * зручності, і залежить воно від одного: наскільки далеко від очей стоїть
 * екран із застосунком.
 *
 * | Де стоїть застосунок | Чого досить |
 * |---|---|
 * | головний монітор, просто перед очима | `min` — світиться сама кнопка |
 * | другий монітор збоку | `head` — смуга застосунку міняє колір |
 * | третій-четвертий, куди дивляться зрідка | `page` — тло на весь екран |
 *
 * Тому типовим лишається найтихіший режим: застосунок, який блимає на весь
 * екран без попиту, вимикають на другій виставі. І тому ж під вибором немає
 * підпису — написати цю таблицю за людину означало б вигадати їй розташування
 * моніторів (`components/panel/ScreenControls.svelte`).
 *
 * ## Важливий віджет — окремо від режимів
 *
 * `shout()` не питає режиму: віджет позначили важливим саме для того, щоб його
 * не проґавили, і тихий режим тут означав би «важливо, але не дуже». Міняється
 * ТІЛЬКИ ТЛО, на протилежне до теми. Спершу перемикалася тема цілком — і це
 * було зайве: текст, рамки й кнопки на мить ставали чужими, око встигало
 * прочитати це як «застосунок перемкнувся», а не як знак.
 */
export type AttentionMode = 'min' | 'head' | 'page';
export const ATTENTION_MODES: readonly AttentionMode[] = ['min', 'head', 'page'];

/** Що саме світиться зараз. `flip` — тло протилежної теми, решта — свій колір. */
export type AttentionLit = 'head' | 'page' | 'flip';

const MODE_KEY = 'attention.mode';
const COLOR_KEY = 'attention.color';

/** Помаранчевий — типовий колір тривоги, і він єдиний такий у заготовках. */
const DEFAULT_COLOR = 'coral';

/** Скільки триває спалах. Секунда — щоб упіймати боковим зором і не дратувати. */
const FLASH_MS = 1000;

const isMode = (value: unknown): value is AttentionMode =>
	typeof value === 'string' && (ATTENTION_MODES as readonly string[]).includes(value);

class AttentionState {
	mode = $state<AttentionMode>('min');
	/** Слуг заготовки. Кольори ті самі, що в треків і віджетів. */
	color = $state<string>(DEFAULT_COLOR);
	/** Що світиться просто зараз. `null` — нічого. */
	lit = $state<AttentionLit | null>(null);

	private timer: number | null = null;

	/** Колір спалаху в шістнадцятковому вигляді — для розмітки. */
	get hex(): string {
		return colorOf(this.color) ?? (colorOf(DEFAULT_COLOR) as string);
	}

	/**
	 * Прочитати вибір. Налаштування ЛОКАЛЬНЕ, а не в дошці: воно про те, як
	 * гукати людину біля ЦЬОГО екрана. Два табла в різних залах мають право на
	 * різну гучність, і перезаписувати один одного вони не повинні.
	 */
	init(): void {
		const mode = readItem(MODE_KEY);
		if (isMode(mode)) this.mode = mode;

		const color = readItem(COLOR_KEY);
		if (color && colorOf(color)) this.color = color;
	}

	choose(mode: AttentionMode): void {
		this.mode = mode;
		writeItem(MODE_KEY, mode);
	}

	paint(color: string): void {
		if (!colorOf(color)) return;
		this.color = color;
		writeItem(COLOR_KEY, color);
	}

	/** Прохання із зали. Тихий режим не робить нічого — і це не помилка. */
	ask(): void {
		if (this.mode === 'min') return;
		this.flash(this.mode);
	}

	/** Важливий віджет. Режиму не питає: він для того й позначений. */
	shout(): void {
		this.flash('flip');
	}

	/**
	 * Засвітити на секунду. Повторний спалах ПРОДОВЖУЄ попередній, а не додає
	 * другий такт: два прохання поспіль мусять дати одне рівне світло, а не
	 * мигання, від якого в залі відводять очі.
	 */
	private flash(lit: AttentionLit): void {
		if (typeof window === 'undefined') return;
		if (this.timer !== null) window.clearTimeout(this.timer);

		this.lit = lit;
		this.repaint(lit);

		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.lit = null;
			this.repaint(null);
		}, FLASH_MS);
	}

	/**
	 * Пофарбувати сторінку — ЗВІДСИ, а не з оболонки.
	 *
	 * Те саме рішення, що й у перемикача теми: стан, який видно на всьому вікні,
	 * сам і ставить атрибут. Оболонка, яка стежила б за ним ефектом, була б
	 * другим місцем, де вирішується, коли фарбу знімати, — а два таких місця
	 * розходяться саме на випадку «спалах поверх спалаху».
	 *
	 * Колір інлайном, а не змінною в таблиці: він приходить із заготовок
	 * (`trackColors`), і токена для нього немає за побудовою. Атрибут лишається
	 * для тих правил, яким треба знати про спалах, і для перевірок.
	 *
	 * Фарбується <html>, а не <body>. Тло сторінки оголошене саме на ньому — в
	 * інлайновому стилі `app.html`, щоб сторінка мала колір ще до того, як
	 * приїде застосунок. Фарба на `<body>` до полотна не доходить: заміряно —
	 * інлайновий стиль стояв, а колір вікна лишався тим самим.
	 *
	 * Смугу застосунку фарбує оболонка: це ЇЇ елемент, і лізти в нього звідси
	 * означало б знати про розмітку сторінки, якої цей орган не бачить.
	 */
	private repaint(lit: AttentionLit | null): void {
		const root = document.documentElement;

		if (lit === null) {
			root.removeAttribute('data-attention');
			root.style.removeProperty('background-color');
			return;
		}

		root.setAttribute('data-attention', lit);
		// `flip` фарбує таблиця стилів: там лежить і сам токен протилежного тла.
		// Свій колір туди не покласти — він приходить із заготовок, а не з токенів.
		if (lit === 'page') root.style.backgroundColor = this.hex;
		else root.style.removeProperty('background-color');
	}
}

export const attentionState = new AttentionState();
