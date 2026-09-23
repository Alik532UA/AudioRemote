// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { panelLog, formatNotice } from './panelLog.svelte';
import type { PanelNotice } from '$lib/panel/apply';

describe('panelLog — журнал табла та остання дія для шапки', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		panelLog.forget();
	});

	afterEach(() => {
		panelLog.forget();
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	it('початковий стан: recentAction порожній', () => {
		expect(panelLog.recentAction).toBeNull();
		expect(panelLog.entries).toHaveLength(0);
	});

	it('asked() виставляє recentAction і скидає його через 3 секунди', () => {
		const notice: PanelNotice = {
			cell: '0',
			caption: 'Світло',
			label: 'Зал',
			move: null,
			from: null,
			to: null
		};
		panelLog.asked(notice, 'cmd-1', false, 'Марія');

		expect(panelLog.recentAction).toBe('Марія · Світло — Зал');

		vi.advanceTimersByTime(2999);
		expect(panelLog.recentAction).toBe('Марія · Світло — Зал');

		vi.advanceTimersByTime(1);
		expect(panelLog.recentAction).toBeNull();
	});

	it('formatNotice коректно форматує повзунки та перемикачі', () => {
		const slider: PanelNotice = {
			cell: '1',
			caption: 'Гучність',
			label: null,
			move: null,
			from: 50,
			to: 60
		};
		expect(formatNotice(slider)).toBe('Гучність · було 50 — стало 60');

		const toggle: PanelNotice = {
			cell: '2',
			caption: 'Дим',
			label: null,
			move: 'on',
			from: null,
			to: null
		};
		expect(formatNotice(toggle)).toBe('Дим — увімкнено');
	});

	it('forget() скидає recentAction та таймер', () => {
		const notice: PanelNotice = {
			cell: '0',
			caption: 'Тест',
			label: 'Кнопка',
			move: null,
			from: null,
			to: null
		};
		panelLog.asked(notice, 'cmd-1', false, '');
		expect(panelLog.recentAction).toBe('Тест — Кнопка');

		panelLog.forget();
		expect(panelLog.recentAction).toBeNull();
	});
});
