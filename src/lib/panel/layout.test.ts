import { describe, expect, it } from 'vitest';
import { fits, layoutPanel, spanOf } from './layout';
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
		expect(placed).toEqual([{ cell: '0', row: 0, col: 0, rows: 3, cols: 1, vertical: true }]);
		// Зайнято 0, 3, 6 — решта вільна.
		expect(free).not.toContain('3');
		expect(free).not.toContain('6');
		expect(free).toContain('1');
		expect(free.length).toBe(12);
	});

	it('рядком віджет іде вправо по ряду', () => {
		const { placed } = layoutPanel(panelOf({ '0': buttons(3, false) }));
		expect(placed[0]).toMatchObject({ rows: 1, cols: 3, vertical: false });
	});

	it('за край сітки не виходить — повертається сам', () => {
		// Три кнопки рядком з середнього стовпця не влазять: лишилося два.
		// Замість зникнення віджет стає стовпчиком, бо там місце є.
		const { placed } = layoutPanel(panelOf({ '1': buttons(3, false) }));
		expect(placed[0]).toMatchObject({ cell: '1', rows: 3, cols: 1, vertical: true });
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
		expect(fits(panel, '1', 3, true)).toBe(true);
		// Клітинка 3 під першим віджетом.
		expect(fits(panel, '3', 1, true)).toBe(false);
	});

	it('за край — ні', () => {
		expect(fits(panelOf({}), '2', 3, false)).toBe(false);
		expect(fits(panelOf({}), '12', 3, true)).toBe(false);
	});

	it('сам віджет своєму ж повороту не заважає', () => {
		// Без цього змінити поворот на місці було б неможливо ніколи: віджет
		// натикався б на власні клітинки.
		expect(fits(panel, '0', 3, false, '0')).toBe(true);
	});
});
