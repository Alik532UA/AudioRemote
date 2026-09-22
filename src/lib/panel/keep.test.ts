// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepPanel, panelFromText, panelToText, recallPanel } from './keep';
import {
	MAX_BUTTONS,
	MAX_CAPTION,
	MAX_PANEL_COLS,
	MAX_PANEL_ROWS,
	PANEL_COLS,
	PANEL_ROWS,
	type Panel
} from '$lib/net/panelTypes';

/**
 * ФАЙЛ ПАНЕЛІ — ЧУЖИЙ ВХІД, І ПЕРЕВІРЯЄТЬСЯ ЯК ЧУЖИЙ.
 *
 * `keep.ts` сам це й проголошує: «звідси НЕ виходить нічого, чого не прийняли б
 * правила бази». Доти цю обіцянку не перевіряло ніщо — 167 рядків розбору
 * стороннього JSON без жодного опису.
 *
 * Ціна невиконаної обіцянки названа там же і не в розбитій панелі: поле, яке
 * правило не приймає, відкидає ВЕСЬ запис (`$other: false`), тож підроблений
 * файл дав би не «віджет без кольору», а панель, яка зникла.
 *
 * Тому перевірки нижче написані від зіпсутого файлу: кожна питає, що станеться,
 * якщо в полі буде не те. Щасливий шлях потрібен рівно для того, щоб довести,
 * що розбір узагалі щось пропускає.
 */

const cell = (extra: Record<string, unknown> = {}) => ({
	kind: 'buttons',
	caption: 'Завіса',
	buttons: [{ label: 'вище' }],
	...extra
});

const fileWith = (cells: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
	JSON.stringify({ kind: 'audioremote.panel', rev: 7, ...extra, cells });

/**
 * СХОВИЩЕ ДОВОДИТЬСЯ ПІДСТАВЛЯТИ, І НЕ ЧЕРЕЗ ІЗОЛЯЦІЮ.
 *
 * `storage.ts` ходить у `window.localStorage`. Під jsdom його там НЕМАЄ у
 * робочому вигляді: node 22+ кладе на глобальний обʼєкт власний
 * `localStorage`, а без `--localstorage-file` це заглушка, у якої немає навіть
 * `removeItem` (той самий рядок «`--localstorage-file` was provided without a
 * valid path», що друкується на кожному прогоні). Звернення падає з
 * `is not a function`, тобто зовсім не так, як у браузері.
 *
 * Тому тут своє сховище на `Map` — і це заразом те, чого канон і просить
 * (CODE-QUALITY-v9 § 3.2): перевірка не залежить від того, що лишив по собі
 * сусідній опис.
 */
function memoryStorage(): Storage {
	const box = new Map<string, string>();
	return {
		get length() {
			return box.size;
		},
		key: (index: number) => [...box.keys()][index] ?? null,
		getItem: (key: string) => box.get(key) ?? null,
		setItem: (key: string, value: string) => void box.set(key, String(value)),
		removeItem: (key: string) => void box.delete(key),
		clear: () => box.clear()
	};
}

/** Префікс той самий, що в `storage.ts`. */
const mirror = (boardKey: string) => `audioremote_panel.${boardKey}`;

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('панель із файлу (CLOUD-DATABASE-v9 § 4)', () => {
	it('перевірка жива: ціла панель проходить і лишається собою', () => {
		const panel = panelFromText(fileWith({ '0': cell({ color: 'ruby' }) }));
		expect(panel, 'ціла панель не пройшла — далі все зелене дарма').not.toBeNull();
		expect(panel?.cells['0']).toMatchObject({
			kind: 'buttons',
			caption: 'Завіса',
			color: 'ruby'
		});
		expect(panel?.rev).toBe(7);
	});

	it('не JSON і не обʼєкт — це не панель', () => {
		expect(panelFromText('')).toBeNull();
		expect(panelFromText('{зламано')).toBeNull();
		expect(panelFromText('null')).toBeNull();
		expect(panelFromText('"панель"')).toBeNull();
		expect(panelFromText('[1,2,3]')).toBeNull();
	});

	it('панель без жодної цілої комірки — теж не панель', () => {
		expect(panelFromText(fileWith({}))).toBeNull();
		expect(panelFromText(fileWith({ '0': { kind: 'нізвідки' } }))).toBeNull();
		expect(panelFromText(fileWith({ '0': 'просто рядок' }))).toBeNull();
	});

	it('колір поза формою правила бази не доїжджає до панелі', () => {
		const panel = panelFromText(fileWith({ '0': cell({ color: '#ff0000' }) }));
		expect(panel?.cells['0'].color).toBeUndefined();
	});

	it('колір кнопки перевіряється так само, як колір віджета', () => {
		const panel = panelFromText(
			fileWith({ '0': cell({ buttons: [{ label: 'вище', color: 'Rose' }] }) })
		);
		expect(panel?.cells['0'].buttons?.[0]).toEqual({ label: 'вище' });
	});

	it('підпис довший за межу вкорочується, а не відкидає комірку', () => {
		const panel = panelFromText(fileWith({ '0': cell({ caption: 'я'.repeat(200) }) }));
		expect(panel?.cells['0'].caption).toHaveLength(MAX_CAPTION);
	});

	it('кнопок береться не більше межі, а безпідписні зникають', () => {
		const many = Array.from({ length: 12 }, (_, index) => ({ label: `к${index}` }));
		const panel = panelFromText(fileWith({ '0': cell({ buttons: many }) }));
		expect(panel?.cells['0'].buttons).toHaveLength(MAX_BUTTONS);

		const holed = panelFromText(
			fileWith({ '0': cell({ buttons: [{ label: '' }, { note: 'без підпису' }, { label: 'є' }] }) })
		);
		expect(holed?.cells['0'].buttons).toEqual([{ label: 'є' }]);
	});

	it('комірка за межею сітки не береться взагалі', () => {
		// Правило бази знає номери 0…47; 48 у ньому вже немає.
		const panel = panelFromText(fileWith({ '0': cell(), '48': cell(), '999': cell() }));
		expect(Object.keys(panel?.cells ?? {})).toEqual(['0']);
	});

	it('розмір сітки береться з файлу, але лише цілий і в межах', () => {
		const big = panelFromText(fileWith({ '0': cell() }, { rows: MAX_PANEL_ROWS, cols: 4 }));
		expect(big).toMatchObject({ rows: MAX_PANEL_ROWS, cols: 4 });

		// Половина розміру — не розмір: обидва числа або типова сітка.
		const half = panelFromText(fileWith({ '0': cell() }, { cols: 4 }));
		expect(half).toMatchObject({ rows: PANEL_ROWS, cols: PANEL_COLS });

		const over = panelFromText(fileWith({ '0': cell() }, { rows: 99, cols: MAX_PANEL_COLS + 1 }));
		expect(over).toMatchObject({ rows: PANEL_ROWS, cols: PANEL_COLS });
	});

	it('крок повзунка поза межами зникає, а не їде в базу', () => {
		const panel = panelFromText(
			fileWith({ '0': { kind: 'slider', caption: 'гучність', step: 900 } })
		);
		expect(panel?.cells['0'].step).toBeUndefined();
	});

	it('номер редакції зі сміття стає нулем', () => {
		const panel = panelFromText(fileWith({ '0': cell() }, { rev: 'учора' }));
		expect(panel?.rev).toBe(0);
	});

	it('те, що записали, читається назад без втрат', () => {
		const panel = panelFromText(
			fileWith({ '0': cell({ color: 'teal', sheet: 'світло', important: true, vertical: true }) })
		) as Panel;
		expect(panelFromText(panelToText(panel))).toEqual(panel);
	});
});

describe('дзеркало панелі в браузері', () => {
	it('перевірка жива: покладене повертається', () => {
		const panel = panelFromText(fileWith({ '0': cell() })) as Panel;
		keepPanel('ключ', panel);
		expect(recallPanel('ключ')).toEqual(panel);
	});

	it('копії немає — і нема чого відновлювати', () => {
		expect(recallPanel('чужий-ключ')).toBeNull();
	});

	it('дзеркало теж чужий вхід: зіпсуте сховище не дає зіпсутої панелі', () => {
		localStorage.setItem(mirror('ключ'), '{"cells":{"0":{"kind":"нізвідки"}}}');
		expect(recallPanel('ключ')).toBeNull();

		localStorage.setItem(mirror('ключ'), 'не json');
		expect(recallPanel('ключ')).toBeNull();
	});

	it('дзеркала різних дошок не змішуються', () => {
		const first = panelFromText(fileWith({ '0': cell({ caption: 'перша' }) })) as Panel;
		const second = panelFromText(fileWith({ '0': cell({ caption: 'друга' }) })) as Panel;
		keepPanel('а', first);
		keepPanel('б', second);
		expect(recallPanel('а')?.cells['0'].caption).toBe('перша');
		expect(recallPanel('б')?.cells['0'].caption).toBe('друга');
	});
});
