// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TriggerEditor from './TriggerEditor.svelte';
import { emptyTrigger, type TrackTrigger } from '$lib/triggers/trigger';
import type { BoardEditor } from '$lib/board/editor';

let app: ReturnType<typeof mount> | null = null;

const createMockController = (trigger = emptyTrigger()): BoardEditor => ({
	entries: [],
	keyLabels: {},
	setTitle: () => {},
	setColor: () => {},
	setIcon: () => {},
	setHotkey: () => {},
	setVisibility: () => {},
	setRepeat: () => {},
	setTrigger: () => {},
	triggerFor: () => trigger,
	move: () => {}
});

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('TriggerEditor', () => {
	it('монтується успішно для порожнього тригера', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const controller = createMockController(emptyTrigger());
		expect(() => {
			app = mount(TriggerEditor, { target: host, props: { trackId: 't1', controller } });
			flushSync();
		}).not.toThrow();
	});

	it('монтується коли triggerFor повертає тригер без headers або blocks', () => {
		const host = document.createElement('div');
		document.body.append(host);
		// Припустимо, тригер з бази або старого формату без headers
		const rawTrigger = {
			on: false,
			url: '',
			everySec: 30,
			path: '',
			test: 'truthy',
			value: '',
			onChange: true
		} as unknown as TrackTrigger;
		const controller = createMockController(rawTrigger);
		expect(() => {
			app = mount(TriggerEditor, { target: host, props: { trackId: 't1', controller } });
			flushSync();
		}).not.toThrow();
	});

	it('показує "Розклад вимкнено" якщо розклад не активовано тумблером', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const trigger: TrackTrigger = {
			...emptyTrigger('schedule'),
			on: false,
			blocks: [{ id: 'b1', days: [0], times: ['09:00'] }]
		};
		const controller = createMockController(trigger);
		app = mount(TriggerEditor, {
			target: host,
			props: { trackId: 't1', controller, initialMode: 'schedule' }
		});
		flushSync();

		const status = host.querySelector('[data-testid="schedule-next-status"]');
		expect(status?.textContent).toContain('Розклад вимкнено');
	});

	it('активує розклад при виборі шкільного пресету', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const controller = createMockController(emptyTrigger('schedule'));
		app = mount(TriggerEditor, {
			target: host,
			props: { trackId: 't1', controller, initialMode: 'schedule' }
		});
		flushSync();

		const presetBtn = host.querySelector<HTMLButtonElement>(
			'[data-testid="schedule-preset-start-btn"]'
		);
		presetBtn?.click();
		flushSync();

		const toggle = host.querySelector<HTMLButtonElement>(
			'[data-testid="trigger-schedule-on-toggle"]'
		);
		expect(toggle?.getAttribute('aria-checked')).toBe('true');
	});
});
