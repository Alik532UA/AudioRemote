import { describe, expect, it } from 'vitest';
import {
	controlOf,
	expansionFor,
	fitInPlace,
	fits,
	layoutPanel,
	moveTo,
	shapeOf,
	sheetsOf,
	sizeOf,
	spanOf
} from './layout';
import type { Panel, PanelCell } from '$lib/net/panelTypes';

/**
 * РОЗКЛАДКА — ЄДИНЕ МІСЦЕ, ДЕ ПАНЕЛЬ ПЕРЕТВОРЮЄТЬСЯ НА СІТКУ.
 *
 * Помилка тут не падає й не світиться: віджет просто стає не туди або зникає
 * зовсім, а людина в залі тисне порожнє місце й не розуміє, чому тихо. Тому
 * межі перевіряються числами, а не оком: край сітки, зайнятий сусід, поворот,
 * якого немає куди зробити.
 */

const buttons = (count: number, vertical?: boolean): PanelCell => ({
	kind: 'buttons',
	caption: 'x',
	buttons: Array.from({ length: count }, (_, index) => ({ label: `${index}` })),
	...(vertical === undefined ? {} : { vertical })
});

const panelOf = (cells: Record<string, PanelCell>): Panel => ({ rev: 1, cells });

describe('скільки місця просить віджет', () => {
	it('по клітинці на кнопку, повзунку — дві, перемикачу — одна', () => {
		expect(spanOf(buttons(3))).toBe(3);
		expect(spanOf({ kind: 'slider', caption: '' })).toBe(2);
		expect(spanOf({ kind: 'check', caption: '' })).toBe(1);
	});

	it('віджет без жодної кнопки однаково займає клітинку', () => {
		expect(spanOf({ kind: 'buttons', caption: '' })).toBe(1);
	});
});

describe('розкладка панелі', () => {
	it('стовпчиком віджет іде вниз по колонці', () => {
		const { placed, free } = layoutPanel(panelOf({ '0': buttons(3) }));
		expect(placed).toEqual([{ cell: '0', row: 0, col: 0, rows: 3, cols: 1 }]);
		// Зайнято 0, 3, 6 — решта вільна.
		expect(free).not.toContain('3');
		expect(free).not.toContain('6');
		expect(free).toContain('1');
		expect(free.length).toBe(12);
	});

	it('рядком віджет іде вправо по ряду', () => {
		const { placed } = layoutPanel(panelOf({ '0': buttons(3, false) }));
		expect(placed[0]).toMatchObject({ rows: 1, cols: 3 });
	});

	it('за край сітки не виходить — повертається сам', () => {
		// Три кнопки рядком з середнього стовпця не влазять: лишилося два.
		// Замість зникнення віджет стає стовпчиком, бо там місце є.
		const { placed } = layoutPanel(panelOf({ '1': buttons(3, false) }));
		expect(placed[0]).toMatchObject({ cell: '1', rows: 3, cols: 1 });
	});

	it('коли не влазить ні так, ні так — стає в саму клітинку, а не зникає', () => {
		// Стовпчиком з передостаннього ряду не влізе (треба три ряди, є два),
		// рядком з останнього стовпця теж (треба три, є один).
		const { placed } = layoutPanel(panelOf({ '11': buttons(3) }));
		expect(placed).toHaveLength(1);
		expect(placed[0]).toMatchObject({ cell: '11', rows: 1, cols: 1 });
	});

	it('сусід не затирається: другий віджет обходить зайняте', () => {
		const { placed } = layoutPanel(panelOf({ '0': buttons(3), '3': buttons(2) }));
		// Перший забрав 0, 3, 6. Другому якір уже зайнятий — його не видно.
		expect(placed.map((spot) => spot.cell)).toEqual(['0']);
	});

	it('порядок обходу — за номером якоря, тож розкладка однозначна', () => {
		// Ті самі два віджети в іншому порядку ключів дають ТУ САМУ картинку:
		// інакше на двох екранах панель виглядала б по-різному.
		const first = layoutPanel(panelOf({ '3': buttons(2), '0': buttons(3) }));
		const second = layoutPanel(panelOf({ '0': buttons(3), '3': buttons(2) }));
		expect(first.placed).toEqual(second.placed);
	});

	it('порожня панель — п’ятнадцять вільних клітинок', () => {
		const { placed, free } = layoutPanel(panelOf({}));
		expect(placed).toEqual([]);
		expect(free).toHaveLength(15);
	});
});

describe('чи стане віджет на місце', () => {
	const panel = panelOf({ '0': buttons(3) });

	it('вільне місце — так, зайняте — ні', () => {
		expect(fits(panel, '1', { rows: 3, cols: 1 })).toBe(true);
		// Клітинка 3 під першим віджетом.
		expect(fits(panel, '3', { rows: 1, cols: 1 })).toBe(false);
	});

	it('за край — ні', () => {
		expect(fits(panelOf({}), '2', { rows: 1, cols: 3 })).toBe(false);
		expect(fits(panelOf({}), '12', { rows: 3, cols: 1 })).toBe(false);
	});

	it('сам віджет своєму ж повороту не заважає', () => {
		// Без цього змінити поворот на місці було б неможливо ніколи: віджет
		// натикався б на власні клітинки.
		expect(fits(panel, '0', { rows: 1, cols: 3 }, '0')).toBe(true);
	});
});

describe('пересування віджета', () => {
	it('на вільне місце — переїжджає', () => {
		const cells = moveTo(panelOf({ '0': buttons(2) }), '0', '1');
		expect(cells && Object.keys(cells)).toEqual(['1']);
	});

	it('на зайняте — міняються місцями', () => {
		const panel = panelOf({ '0': buttons(2), '1': { kind: 'check', caption: 'c' } });
		const cells = moveTo(panel, '0', '1');
		expect(cells?.['1'].kind).toBe('buttons');
		expect(cells?.['0'].kind).toBe('check');
	});

	it('обмін, після якого другий не влазить, не відбувається зовсім', () => {
		// Перемикач стоїть в останньому ряду; група на три кнопки туди не стане
		// ні стовпчиком (треба три ряди, є один), ні рядком (сусіди зайняті).
		const panel = panelOf({
			'0': buttons(3),
			'12': { kind: 'check', caption: 'c' },
			'13': { kind: 'check', caption: 'd' },
			'14': { kind: 'check', caption: 'e' }
		});
		expect(moveTo(panel, '0', '12')).toBeNull();
	});

	it('на саме себе — нічого', () => {
		expect(moveTo(panelOf({ '0': buttons(2) }), '0', '0')).toBeNull();
	});

	it('порожню клітинку не пересунути', () => {
		expect(moveTo(panelOf({ '0': buttons(2) }), '5', '6')).toBeNull();
	});

	it('не влазить у своєму повороті — повертається сам', () => {
		// Ряд 3: стовпчиком треба три ряди, лишилося два. Рядком — три стовпці,
		// і всі вільні. Відмовити тут означало б вимагати спершу повернути.
		const cells = moveTo(panelOf({ '0': buttons(3) }), '0', '9');
		expect(cells && sizeOf(cells['9'])).toEqual({ rows: 1, cols: 3 });
	});

	it('не влазить у жодному повороті — не пересувається', () => {
		// Останній ряд, середній стовпець: стовпчиком немає рядів, рядком —
		// лише два стовпці з трьох потрібних.
		expect(moveTo(panelOf({ '0': buttons(3) }), '0', '13')).toBeNull();
	});
});

describe('свій розмір віджета', () => {
	it('названий прямо — той і беремо', () => {
		expect(sizeOf({ ...buttons(4), rows: 2, cols: 2 })).toEqual({ rows: 2, cols: 2 });
	});

	it('пів розміру не рахується: без обох чисел розмір виводиться з органів', () => {
		expect(sizeOf({ ...buttons(4), rows: 2 })).toEqual({ rows: 4, cols: 1 });
		expect(sizeOf({ ...buttons(4), cols: 2 })).toEqual({ rows: 4, cols: 1 });
	});

	it('розмір поза сіткою не береться', () => {
		expect(sizeOf({ ...buttons(2), rows: 10, cols: 1 })).toEqual({ rows: 2, cols: 1 });
		expect(sizeOf({ ...buttons(2), rows: 1, cols: 10 })).toEqual({ rows: 2, cols: 1 });
	});

	it('прямокутник займає всі свої клітинки', () => {
		const { placed, free } = layoutPanel(panelOf({ '0': { ...buttons(4), rows: 2, cols: 2 } }));
		expect(placed[0]).toMatchObject({ rows: 2, cols: 2 });
		// Зайнято 0, 1, 3, 4.
		for (const key of ['0', '1', '3', '4']) expect(free).not.toContain(key);
		expect(free).toContain('2');
	});
});

describe('у якій формі віджет стоїть', () => {
	it('типовий розмір читається назад як поворот, а не як «свій»', () => {
		// Інакше вікно віджета відкривалося б на «своєму розмірі» завжди, і
		// людина, яка просто додала кнопку, застрягла б у вчорашніх числах.
		expect(shapeOf(buttons(3))).toEqual({ shape: 'down', rows: 3, cols: 1 });
		expect(shapeOf(buttons(3, false))).toEqual({ shape: 'across', rows: 1, cols: 3 });
	});

	it('прямокутник, який не є жодним поворотом, — «свій»', () => {
		expect(shapeOf({ ...buttons(4), rows: 2, cols: 2 })).toEqual({
			shape: 'custom',
			rows: 2,
			cols: 2
		});
	});

	it('порожня комірка починає зі стовпчика', () => {
		expect(shapeOf(null)).toEqual({ shape: 'down', rows: 1, cols: 1 });
	});
});

describe('ім’я органа', () => {
	it('сусідні органи однієї комірки не збігаються', () => {
		expect(controlOf('3', 'bump', 10)).not.toBe(controlOf('3', 'bump', -10));
		expect(controlOf('3', 'press', 1)).not.toBe(controlOf('3', 'press', 2));
		expect(controlOf('3', 'toggle')).not.toBe(controlOf('4', 'toggle'));
	});

	it('те саме натискання дає те саме ім’я', () => {
		expect(controlOf('3', 'press', 0)).toBe(controlOf('3', 'press', 0));
	});

	it('сусідні номери не є префіксами один одного під роздільником', () => {
		// Підсвітка шукає `ім'я + '#'`: без цього `3|press|1` збігався б із
		// початком `3|press|11`, і спалахувала б чужа кнопка.
		expect(`${controlOf('3', 'press', 11)}#7`.startsWith(`${controlOf('3', 'press', 1)}#`)).toBe(
			false
		);
	});
});

describe('своя сітка дошки', () => {
	it('без розміру дошка лишається три на п’ять', () => {
		const { grid, free } = layoutPanel(panelOf({}));
		expect(grid).toEqual({ rows: 5, cols: 3 });
		expect(free).toHaveLength(15);
	});

	it('названий розмір міняє і кількість місць, і межі', () => {
		const wide: Panel = { rev: 1, rows: 2, cols: 6, cells: {} };
		const { grid, free } = layoutPanel(wide);
		expect(grid).toEqual({ rows: 2, cols: 6 });
		expect(free).toHaveLength(12);
	});

	it('у ширшій сітці віджет рядком улазить далі', () => {
		// Чотири кнопки рядком не стають у трьох стовпцях і повертаються
		// стовпчиком; у шести стовпцях вони лишаються рядком.
		const narrow = layoutPanel({ rev: 1, cells: { '0': buttons(4, false) } });
		expect(narrow.placed[0]).toMatchObject({ rows: 4, cols: 1 });

		const wide = layoutPanel({ rev: 1, rows: 5, cols: 6, cells: { '0': buttons(4, false) } });
		expect(wide.placed[0]).toMatchObject({ rows: 1, cols: 4 });
	});

	it('пів розміру не рахується: лишається типова сітка', () => {
		expect(layoutPanel({ rev: 1, cols: 6, cells: {} }).grid).toEqual({ rows: 5, cols: 3 });
	});

	it('комірка за межею зменшеної сітки не малюється, але й не гине', () => {
		// Віджет у комірці 14 при сітці 2×2 просто не видно: розкладка його не
		// бачить, а в даних він лишається — саме тому сюди й можна повернутися.
		const small: Panel = { rev: 1, rows: 2, cols: 2, cells: { '14': buttons(1) } };
		expect(layoutPanel(small).placed).toEqual([]);
		expect(small.cells['14']).toBeDefined();
	});
});

describe('пульти в залі', () => {
	const many = panelOf({
		'0': { ...buttons(1), sheet: 'світло' },
		'1': { ...buttons(1), sheet: 'завіса' },
		'2': buttons(1)
	});

	it('без вибору видно все — саме так панель і виглядала досі', () => {
		expect(layoutPanel(many).placed.map((spot) => spot.cell)).toEqual(['0', '1', '2']);
	});

	it('обраний пульт показує свої віджети Й СПІЛЬНІ', () => {
		// Спільний віджет (без назви) бачать усі: «стоп» потрібен кожному в залі.
		expect(layoutPanel(many, 'світло').placed.map((spot) => spot.cell)).toEqual(['0', '2']);
		expect(layoutPanel(many, 'завіса').placed.map((spot) => spot.cell)).toEqual(['1', '2']);
	});

	it('чужий віджет лишає по собі ВІЛЬНЕ місце, а не діру', () => {
		// Інакше помічник бачив би порожню клітинку, у яку не можна натиснути,
		// і не розумів би, чому вона мертва.
		expect(layoutPanel(many, 'світло').free).toContain('1');
	});

	it('назви пультів беруться з віджетів, без повторів і за абеткою', () => {
		expect(sheetsOf(many)).toEqual(['завіса', 'світло']);
		expect(sheetsOf(panelOf({ '0': buttons(1) }))).toEqual([]);
	});
});

describe('порятунок від тісноти (fitInPlace, expansionFor)', () => {
	it('fitInPlace повертає поворот, якщо він влазить', () => {
		// Комірка 12 (останній ряд 4, стовпець 0 при сітці 5×3): 3 рядки вниз не влазять, але 3 стовпці вправо — так.
		const panel = panelOf({});
		expect(fitInPlace(panel, '12', { rows: 3, cols: 1 })).toEqual({ rows: 1, cols: 3 });
	});

	it('fitInPlace зменшує розмір, якщо поворот теж не влазить', () => {
		// Комірка 14 (останній ряд, останній стовпець): 2×2 не влізе, зменшується до 1×1.
		const panel = panelOf({});
		expect(fitInPlace(panel, '14', { rows: 2, cols: 2 })).toEqual({ rows: 1, cols: 1 });
	});

	it('expansionFor пропонує розширення дошки, коли віджет виходить за край', () => {
		// Сітка 5×3. Комірка 2 (ряд 0, стовпець 2): віджет 1×2 випирає в 4-й стовпець.
		const panel = panelOf({});
		expect(expansionFor(panel, '2', { rows: 1, cols: 2 })).toEqual({ rows: 5, cols: 4 });
	});

	it('expansionFor повертає null, якщо віджет уже влазить або не може вміститися', () => {
		const panel = panelOf({});
		expect(expansionFor(panel, '0', { rows: 1, cols: 1 })).toBeNull();
	});
});
