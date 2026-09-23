// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import PanelGrid from './PanelGrid.svelte';
import { starterPanel } from '$lib/panel/starter';
import { controlOf } from '$lib/panel/layout';
import { readFileSync } from 'node:fs';

class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

/**
 * ПІДСВІЧУВАННЯ Й ПРИТІНЕННЯ ВІДЖЕТІВ НА ІНФОДОШЦІ.
 * - Активний віджет позначається як `.cell--recent`, а активна кнопка як `.key--hot`.
 * - Усі інші віджети сітки стають на 50% прозорими (.grid:has(.cell--recent) .cell:not(.cell--recent)).
 * - Усередині активного віджета інші кнопки також стають на 50% прозорими (.cell--recent:has(.key--hot) .key:not(.key--hot)).
 * - Перехід прозорості плавний (300ms ease), а в режимі prefers-reduced-motion вимикається.
 */

function renderGrid(props: Partial<ComponentProps<typeof PanelGrid>> = {}) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(PanelGrid, {
		target: host,
		props: {
			panel: starterPanel(),
			levels: {},
			flags: {},
			press: () => {},
			...props
		}
	});
	flushSync();
	return { host, app };
}

describe('PanelGrid — підсвічування та притінення інших віджетів', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('у спокої жодна клітинка не підсвічена і не притінена', () => {
		const { host, app } = renderGrid();
		expect(host.querySelectorAll('.cell--recent').length).toBe(0);
		expect(host.querySelectorAll('.grid:has(.cell--recent) .cell:not(.cell--recent)').length).toBe(
			0
		);
		unmount(app);
	});

	it('при підсвічуванні однієї клітинки всі інші клітинки сітки підпадають під селектор притінення', () => {
		const { host, app } = renderGrid({ recent: '0' });

		const recentCells = host.querySelectorAll('.cell--recent');
		expect(recentCells.length).toBe(1);

		const dimmedCells = host.querySelectorAll('.grid:has(.cell--recent) .cell:not(.cell--recent)');
		expect(dimmedCells.length).toBeGreaterThan(0);

		for (const cell of dimmedCells) {
			expect(cell.classList.contains('cell--recent')).toBe(false);
		}

		unmount(app);
	});

	it('при натисканні конкретної кнопки інші кнопки того ж віджета підпадають під притінення', () => {
		const { host, app } = renderGrid({ recent: '0', hot: `${controlOf('0', 'press', 0)}#1` });

		const hotKey = host.querySelector('.key--hot');
		expect(hotKey).not.toBeNull();

		const dimmedKeys = host.querySelectorAll('.cell--recent:has(.key--hot) .key:not(.key--hot)');
		expect(dimmedKeys.length).toBeGreaterThan(0);

		for (const key of dimmedKeys) {
			expect(key.classList.contains('key--hot')).toBe(false);
		}

		unmount(app);
	});

	it('правила 50% прозорості та плавного переходу визначені в base.css і глушаться для reduced-motion', () => {
		const css = readFileSync('src/lib/css/base/base.css', 'utf8');

		expect(css).toContain('.grid:has(.cell--recent) .cell:not(.cell--recent)');
		expect(css).toContain('.cell--recent:has(.key--hot) .key:not(.key--hot)');
		expect(css).toContain('opacity: 0.5;');
		expect(css).toContain('transition: opacity 300ms ease;');

		expect(css).toMatch(
			/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.grid\s+\.cell,\s*\n\s*\.grid\s+\.key\s*\{[\s\S]*?transition:\s*none;/
		);
	});
});
