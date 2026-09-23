// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PanelLog from './PanelLog.svelte';
import type { LogEntry } from '$lib/services/panelLog.svelte';

/**
 * 24-ГОДИННИКОВИЙ ФОРМАТ ЧАСУ В ЖУРНАЛІ ТАБЛА.
 *
 * `toLocaleTimeString` без `hour12: false` в англомовних локалях браузера
 * або системи показує AM/PM («03:42:05 PM»). Для табла потрібен чіткий
 * 24-годинниковий формат («15:42:05»).
 */

function renderLog(notices: LogEntry[]) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(PanelLog, {
		target: host,
		props: { notices }
	});
	flushSync();
	return { host, app };
}

describe('PanelLog — формат часу в журналі табла', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('toLocaleTimeString викликається з hour12: false', () => {
		const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
		try {
			const afternoon = new Date(2026, 8, 23, 15, 42, 5).getTime();
			const notices: LogEntry[] = [
				{
					id: '1',
					at: afternoon,
					own: true,
					desk: true,
					who: 'Оператор',
					notice: {
						cell: '0',
						caption: 'Світло',
						label: 'Увімкнути',
						move: null,
						from: null,
						to: null
					}
				}
			];
			const { app } = renderLog(notices);
			expect(spy).toHaveBeenCalled();
			const options = spy.mock.calls[0]?.[1];
			expect(options?.hour12).toBe(false);
			unmount(app);
		} finally {
			spy.mockRestore();
		}
	});

	it('запис у другій половині дня не містить AM/PM', () => {
		const afternoon = new Date(2026, 8, 23, 15, 42, 5).getTime();
		const notices: LogEntry[] = [
			{
				id: '1',
				at: afternoon,
				own: true,
				desk: true,
				who: 'Оператор',
				notice: {
					cell: '0',
					caption: 'Світло',
					label: 'Увімкнути',
					move: null,
					from: null,
					to: null
				}
			}
		];
		const { host, app } = renderLog(notices);
		const time = host.querySelector<HTMLElement>('.log__time');
		expect(time?.textContent?.trim()).toMatch(/^15:42:05$/);
		expect(time?.textContent).not.toMatch(/AM|PM/i);
		unmount(app);
	});
});
