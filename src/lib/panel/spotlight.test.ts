// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Spotlight, type SpotlightView } from './spotlight';

/**
 * ПІДСВІТКА ВІДПОВІДАЄ НА «ХТО», А НЕ НА «ХТОСЬ».
 *
 * Панелей на таблі стільки, скільки помічників, і сітка в них та сама. Копія
 * варта місця рівно доти, доки в ній світиться ЇЇ натискання — тому перевірки
 * тут переважно про те, що чуже НЕ світиться.
 *
 * Друга половина — про такт, що гасить підсвітку. Помилка в ньому тиха й
 * виглядає як блимання: два прохання на ту саму комірку за дві секунди, і
 * перший такт гасить підсвітку другого через секунду після її появи.
 */

const HOLD = 3000;

let view: SpotlightView;
let spot: Spotlight;

beforeEach(() => {
	vi.useFakeTimers();
	view = { recent: {}, hot: {} };
	spot = new Spotlight((next) => (view = next), HOLD);
});

afterEach(() => {
	spot.stop();
	vi.useRealTimers();
});

describe('підсвітка натискань', () => {
	it('світиться лише на названих місцях', () => {
		spot.press('3', 'cell3', ['b/1']);
		expect(view.recent).toEqual({ 'b/1': '3' });
		expect(view.hot['b/1'], 'орган не блимнув').toMatch(/^cell3#\d+$/);
		expect(view.recent['c/1'], 'засвітилося на чужій панелі').toBeUndefined();
	});

	it('дві вкладки одного автора світяться обидві', () => {
		// Команда несе `uid`, а не вкладку: розрізнити їх нічим.
		spot.press('3', 'cell3', ['b/1', 'b/2']);
		expect(Object.keys(view.recent)).toEqual(['b/1', 'b/2']);
	});

	it('гасне саме через витримку', () => {
		spot.press('3', 'cell3', ['b/1']);
		vi.advanceTimersByTime(HOLD - 1);
		expect(view.recent['b/1'], 'погасло раніше строку').toBe('3');

		vi.advanceTimersByTime(1);
		expect(view.recent['b/1']).toBeUndefined();
	});

	it('друге натискання тієї самої комірки не гасне від першого такту', () => {
		/*
		 * Головний опис файлу. Порівняння з коміркою замість лічильника дало б
		 * тут підсвітку, яка зникає через секунду після появи.
		 */
		spot.press('3', 'cell3', ['b/1']);
		vi.advanceTimersByTime(HOLD - 500);
		spot.press('3', 'cell3', ['b/1']);

		vi.advanceTimersByTime(500);
		expect(view.recent['b/1'], 'старий такт погасив нову підсвітку').toBe('3');

		vi.advanceTimersByTime(HOLD);
		expect(view.recent['b/1']).toBeUndefined();
	});

	it('номер такту росте — інакше спалах не повторюється', () => {
		// CSS вмикає такт на зміну значення; те саме значення підряд не блимає.
		spot.press('3', 'cell3', ['b/1']);
		const first = view.hot['b/1'];
		spot.press('3', 'cell3', ['b/1']);
		expect(view.hot['b/1']).not.toBe(first);
	});

	it('зупинка гасить усе й знімає такт', () => {
		spot.press('3', 'cell3', ['b/1']);
		spot.stop();
		vi.advanceTimersByTime(HOLD * 2);
		expect(view).toEqual({ recent: {}, hot: {} });
	});
});
