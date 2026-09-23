// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import InfoHead from './InfoHead.svelte';
import { panelLog } from '$lib/services/panelLog.svelte';
import type { PanelNotice } from '$lib/panel/apply';

function renderHead(
	props = { name: 'Головна', id: 'TEST1', helpers: '2 помічники', names: ['Марія'] }
) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(InfoHead, {
		target: host,
		props
	});
	flushSync();
	const title = () => host.querySelector('[data-testid="board-role-title"]') as HTMLElement;
	return { host, app, title };
}

describe('InfoHead — шапка табла', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		panelLog.forget();
	});

	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
		panelLog.forget();
	});

	it('за замовчуванням показує «Табло»', () => {
		const { app, title } = renderHead();
		expect(title().textContent).toBe('Табло');
		unmount(app);
	});

	it('завжди показує «Табло» і не змінюється від дій у журналі', () => {
		const { app, title } = renderHead();
		expect(title().textContent).toBe('Табло');

		const notice: PanelNotice = {
			cell: '0',
			caption: 'Світло',
			label: 'Зал',
			move: null,
			from: null,
			to: null
		};

		panelLog.asked(notice, 'cmd-1', false, 'Марія');
		flushSync();

		expect(title().textContent).toBe('Табло');
		unmount(app);
	});
});
