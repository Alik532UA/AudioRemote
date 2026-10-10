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
});
