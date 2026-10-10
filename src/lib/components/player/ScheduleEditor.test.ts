// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ScheduleEditor from './ScheduleEditor.svelte';
import { emptyBlock, type ScheduleBlock } from '$lib/triggers/schedule';

let app: ReturnType<typeof mount> | null = null;

function render(blocks: ScheduleBlock[]): { host: HTMLElement; currentBlocks: ScheduleBlock[] } {
	const host = document.createElement('div');
	document.body.append(host);
	app = mount(ScheduleEditor, { target: host, props: { blocks } });
	flushSync();
	return { host, currentBlocks: blocks };
}

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('ScheduleEditor', () => {
	it('показує дні тижня та дозволяє перемикати дні', () => {
		const block = emptyBlock();
		block.days = [0, 1]; // Пн, Вт
		block.times = ['08:30'];

		const { host } = render([block]);
		const monBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-block-0-day-0-btn"]'
		);
		const wedBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-block-0-day-2-btn"]'
		);

		expect(monBtn?.getAttribute('aria-checked')).toBe('true');
		expect(wedBtn?.getAttribute('aria-checked')).toBe('false');

		wedBtn?.click();
		flushSync();
		expect(wedBtn?.getAttribute('aria-checked')).toBe('true');
	});

	it('додає часові точки через введення тексту', () => {
		const block = emptyBlock();
		block.times = [];

		const { host } = render([block]);
		const input = host.querySelector<HTMLInputElement>(
			'[data-testid="schedule-block-0-time-input"]'
		);
		const addBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-block-0-add-time-btn"]'
		);

		if (input) input.value = '09:00, 10:15 11:30';
		input?.dispatchEvent(new Event('input'));
		addBtn?.click();
		flushSync();

		const chips = host.querySelectorAll('[data-testid$="-item"]');
		expect(chips.length).toBe(3);
	});

	it('додає новий блок розкладу', () => {
		const block = emptyBlock();
		const { host } = render([block]);

		const addBlockBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-add-block-btn"]'
		);
		addBlockBtn?.click();
		flushSync();

		const cards = host.querySelectorAll('[data-testid^="schedule-block-"]');
		expect(cards.length).toBeGreaterThanOrEqual(2);
	});

	it('застосовує пресет "тільки початок уроків"', () => {
		const { host } = render([emptyBlock()]);
		const presetStartBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-preset-start-btn"]'
		);
		expect(presetStartBtn).not.toBeNull();
		presetStartBtn?.click();
		flushSync();

		const cards = host.querySelectorAll('[data-testid$="-card"]');
		expect(cards.length).toBe(3);

		// Перевірка часу першого блоку (09:00, 09:45, 10:30)
		const firstBlockChips = cards[0].querySelectorAll('[data-testid$="-item"]');
		expect(firstBlockChips.length).toBe(3);
		expect(cards[0].textContent).toContain('09:00');
		expect(cards[0].textContent).toContain('09:45');
		expect(cards[0].textContent).toContain('10:30');
	});

	it('застосовує пресет "тільки кінець уроків"', () => {
		const { host } = render([emptyBlock()]);
		const presetEndBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-preset-end-btn"]'
		);
		expect(presetEndBtn).not.toBeNull();
		presetEndBtn?.click();
		flushSync();

		const cards = host.querySelectorAll('[data-testid$="-card"]');
		expect(cards.length).toBe(3);

		// Перевірка часу першого блоку (09:40, 10:25, 11:10)
		expect(cards[0].textContent).toContain('09:40');
		expect(cards[0].textContent).toContain('10:25');
		expect(cards[0].textContent).toContain('11:10');
	});

	it('застосовує пресет "і початок і кінець уроків"', () => {
		const { host } = render([emptyBlock()]);
		const presetBothBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-preset-both-btn"]'
		);
		expect(presetBothBtn).not.toBeNull();
		presetBothBtn?.click();
		flushSync();

		const cards = host.querySelectorAll('[data-testid$="-card"]');
		expect(cards.length).toBe(3);

		// Перевірка часу першого блоку (6 точок)
		const firstBlockChips = cards[0].querySelectorAll('[data-testid$="-item"]');
		expect(firstBlockChips.length).toBe(6);
		expect(cards[0].textContent).toContain('09:00');
		expect(cards[0].textContent).toContain('09:40');
		expect(cards[0].textContent).toContain('11:10');
	});
});
