// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DeckLog from './DeckLog.svelte';
import type { BoardTrack } from '$lib/board/editor';
import { deckLog } from '$lib/services/deckLog.svelte';
import { colorOf } from '$lib/config/trackColors';

/**
 * ЗАПИС ПРО ТРЕК — ТОГО Ж КОЛЬОРУ, ЩО Й ТРЕК.
 *
 * Колір треку ставлять саме для того, щоб трек знаходили оком. Журнал
 * аудіодошки доти малював усі рядки нейтрально, і той самий «Бумбокс — Безодня»,
 * червоний у списку, у журналі доводилося читати словами. Журнал табла при
 * цьому вже фарбував свої рядки кольором віджета — тобто два однакові за
 * змістом місця виглядали по-різному.
 *
 * Перевіряється тут, а не в браузері: у браузерному наборі треків немає й бути
 * не може — `showDirectoryPicker()` Playwright не драйвить.
 */

const track = (id: string, color: string | null): BoardTrack => ({
	id,
	path: `${id}.mp3`,
	title: id,
	fileName: id,
	color,
	icon: null,
	hotkey: null,
	visibility: 'all' as BoardTrack['visibility'],
	plays: 1,
	gapSec: 0,
	trigger: null
});

let app: ReturnType<typeof mount> | null = null;

function open(tracks: BoardTrack[]): HTMLElement {
	const host = document.createElement('div');
	document.body.append(host);
	app = mount(DeckLog, { target: host, props: { tracks } });
	flushSync();
	return host;
}

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	deckLog.clear();
	document.body.innerHTML = '';
});

describe('колір запису в журналі аудіодошки', () => {
	it('запис про кольоровий трек несе колір треку', () => {
		const host = open([track('червоний', 'ruby')]);
		deckLog.started('червоний', 'self');
		flushSync();

		const row = host.querySelector<HTMLElement>('[data-testid="deck-note-0-row"]');
		expect(row?.style.getPropertyValue('--row-color')).toBe(colorOf('ruby'));
	});

	it('запис про трек без кольору лишається нейтральним', () => {
		const host = open([track('сірий', null)]);
		deckLog.started('сірий', 'self');
		flushSync();

		const row = host.querySelector<HTMLElement>('[data-testid="deck-note-0-row"]');
		expect(row?.style.getPropertyValue('--row-color')).toBe('');
	});

	it('запис не про трек (пульт прийшов) лишається нейтральним', () => {
		const host = open([track('червоний', 'ruby')]);
		deckLog.saw({});
		deckLog.saw({ 'хтось/1': { role: 'remote', at: 1 } } as never);
		flushSync();

		for (const row of host.querySelectorAll<HTMLElement>('[data-testid$="-row"]')) {
			expect(row.style.getPropertyValue('--row-color')).toBe('');
		}
	});
});

describe('шапка журналу', () => {
	/*
	 * Обидві дії шапки — одного роду: значок із підписом у підказці. Доти
	 * «Очистити» було текстовою кнопкою, стрілка — значком, і стояли вони
	 * стовпчиком через глобальне `.head__side { flex-direction: column }`, чиє
	 * ім'я класу цей блок ділив. Геометрію jsdom не міряє, тож тут стережеться
	 * причина: блок дій не носить імені, яке має глобальне правило.
	 */
	it('дії шапки не носять глобального імені класу картки дошки', () => {
		const host = open([track('червоний', 'ruby')]);
		deckLog.started('червоний', 'self');
		flushSync();

		const clear = host.querySelector('[data-testid="deck-log-clear-btn"]');
		const fold = host.querySelector('[data-testid="deck-log-fold-btn"]');
		expect(clear?.parentElement).toBe(fold?.parentElement);
		expect(clear?.parentElement?.classList.contains('head__side')).toBe(false);
	});

	it('«Очистити» має підпис для читача екрана й для підказки', () => {
		const host = open([track('червоний', 'ruby')]);
		deckLog.started('червоний', 'self');
		flushSync();

		const clear = host.querySelector<HTMLElement>('[data-testid="deck-log-clear-btn"]');
		expect(clear?.getAttribute('aria-label')).toBeTruthy();
		expect(clear?.title).toBe(clear?.getAttribute('aria-label'));
	});
});

describe('формат часу в журналі деки', () => {
	it('час запису виводиться у 24-годинниковому форматі без AM/PM', () => {
		const host = open([track('червоний', 'ruby')]);
		const afternoon = new Date(2026, 8, 23, 15, 42, 5).getTime();
		const originalNow = Date.now;
		Date.now = () => afternoon;
		try {
			deckLog.started('червоний', 'self');
			flushSync();

			const time = host.querySelector<HTMLElement>('[data-testid="deck-note-0-row"] .log__time');
			expect(time?.textContent?.trim()).toMatch(/^15:42:05$/);
			expect(time?.textContent).not.toMatch(/AM|PM/i);
		} finally {
			Date.now = originalNow;
		}
	});

	it('toLocaleTimeString викликається з hour12: false', () => {
		open([track('червоний', 'ruby')]);
		const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
		try {
			deckLog.started('червоний', 'self');
			flushSync();

			expect(spy).toHaveBeenCalled();
			const options = spy.mock.calls[0]?.[1];
			expect(options?.hour12).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});
