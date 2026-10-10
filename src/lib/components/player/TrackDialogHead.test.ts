// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TrackDialogHead from './TrackDialogHead.svelte';

let app: ReturnType<typeof mount> | null = null;

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('TrackDialogHead', () => {
	it('має кнопки для перемикання розкладу та API', () => {
		const host = document.createElement('div');
		document.body.append(host);
		const ontoggle = vi.fn();
		const onclose = vi.fn();

		app = mount(TrackDialogHead, {
			target: host,
			props: {
				path: 'test/sound.mp3',
				triggerOpen: true,
				activeTriggerMode: 'schedule',
				ontoggletrigger: ontoggle,
				onclose
			}
		});
		flushSync();

		const scheduleBtn = host.querySelector<HTMLButtonElement>('[data-testid="open-schedule-btn"]');
		const apiBtn = host.querySelector<HTMLButtonElement>('[data-testid="open-trigger-btn"]');
		const closeBtn = host.querySelector<HTMLButtonElement>('[data-testid="track-modal-close-btn"]');

		expect(scheduleBtn).not.toBeNull();
		expect(apiBtn).not.toBeNull();
		expect(scheduleBtn?.classList.contains('btn--primary')).toBe(true);
		expect(apiBtn?.classList.contains('btn--primary')).toBe(false);

		scheduleBtn?.click();
		expect(ontoggle).toHaveBeenCalledWith('schedule');

		apiBtn?.click();
		expect(ontoggle).toHaveBeenCalledWith('api');

		closeBtn?.click();
		expect(onclose).toHaveBeenCalled();
	});
});
