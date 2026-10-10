// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TrackTriggerMark from './TrackTriggerMark.svelte';
import type { TrackTrigger } from '$lib/triggers/trigger';

let app: ReturnType<typeof mount> | null = null;

function render(props: {
	trackId: string;
	trigger?: TrackTrigger | null;
	showTrigger: boolean;
	isQueued: boolean;
}): HTMLElement {
	const host = document.createElement('div');
	document.body.append(host);
	app = mount(TrackTriggerMark, { target: host, props });
	flushSync();
	return host;
}

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('TrackTriggerMark', () => {
	it('показує бейдж черги коли трек у черзі', () => {
		const host = render({
			trackId: 't1',
			trigger: null,
			showTrigger: false,
			isQueued: true
		});
		const badge = host.querySelector('[data-testid="track-queued-t1-badge"]');
		expect(badge).not.toBeNull();
	});

	it('показує значок розкладу для тригера у режимі schedule', () => {
		const host = render({
			trackId: 't1',
			trigger: {
				on: true,
				mode: 'schedule',
				url: '',
				everySec: 30,
				headers: {},
				path: '',
				test: 'truthy',
				value: '',
				onChange: true,
				blocks: [{ id: 'b1', days: [0], times: ['09:00'] }]
			},
			showTrigger: true,
			isQueued: false
		});
		const icon = host.querySelector('[data-testid="schedule-mark-t1-icon"]');
		expect(icon).not.toBeNull();
	});

	it('показує значок zap для тригера за API', () => {
		const host = render({
			trackId: 't1',
			trigger: {
				on: true,
				mode: 'api',
				url: 'https://example.com/api',
				everySec: 30,
				headers: {},
				path: '',
				test: 'truthy',
				value: '',
				onChange: true
			},
			showTrigger: true,
			isQueued: false
		});
		const icon = host.querySelector('[data-testid="trigger-mark-t1-icon"]');
		expect(icon).not.toBeNull();
	});
});
