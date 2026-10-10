// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TrackDialog from './TrackDialog.svelte';
import { emptyTrigger } from '$lib/triggers/trigger';
import type { BoardEditor, BoardTrack } from '$lib/board/editor';

let app: ReturnType<typeof mount> | null = null;

const createMockTrack = (): BoardTrack => ({
	id: 't1',
	path: 'audio/bell.mp3',
	title: 'Дзвоник',
	fileName: 'bell',
	color: null,
	icon: null,
	hotkey: null,
	visibility: 'all',
	plays: 1,
	gapSec: 0,
	trigger: null
});

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

beforeEach(() => {
	HTMLDialogElement.prototype.showModal = vi.fn();
	HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('TrackDialog', () => {
	it('відкриває редактор розкладу при натисканні кнопки розкладу', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const track = createMockTrack();
		const controller = createMockController();

		app = mount(TrackDialog, {
			target: host,
			props: { track, controller, onclose: () => {} }
		});
		flushSync();

		const scheduleBtn = host.querySelector<HTMLButtonElement>('[data-testid="open-schedule-btn"]');
		expect(scheduleBtn).not.toBeNull();

		// Відкриваємо розклад
		scheduleBtn?.click();
		flushSync();

		// Перевіряємо що TriggerEditor змонтувався в режимі розкладу без падінь
		const scheduleEditor = host.querySelector('[data-testid="schedule-next-status"]');
		expect(scheduleEditor).not.toBeNull();
	});

	it('відкриває редактор API при натисканні кнопки API', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const track = createMockTrack();
		const controller = createMockController();

		app = mount(TrackDialog, {
			target: host,
			props: { track, controller, onclose: () => {} }
		});
		flushSync();

		const apiBtn = host.querySelector<HTMLButtonElement>('[data-testid="open-trigger-btn"]');
		expect(apiBtn).not.toBeNull();

		// Відкриваємо API
		apiBtn?.click();
		flushSync();

		// Перевіряємо що TriggerEditor змонтувався в режимі API без падінь
		const urlInput = host.querySelector('[data-testid="trigger-url"]');
		expect(urlInput).not.toBeNull();
	});
});
