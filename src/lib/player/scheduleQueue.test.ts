import { describe, expect, it } from 'vitest';
import { ScheduleQueue } from './scheduleQueue.svelte';

describe('ScheduleQueue', () => {
	it('додає трек у чергу та замінює старий', () => {
		const queue = new ScheduleQueue();
		queue.set('t1');
		expect(queue.queued?.trackId).toBe('t1');

		queue.set('t2');
		expect(queue.queued?.trackId).toBe('t2');
	});

	it('скасовує чергу', () => {
		const queue = new ScheduleQueue();
		queue.set('t1');
		queue.cancel();
		expect(queue.queued).toBeNull();
	});

	it('pop віддає трек, якщо минуло менше 2 хв', () => {
		const queue = new ScheduleQueue();
		queue.set('t1');
		expect(queue.pop()).toBe('t1');
		expect(queue.queued).toBeNull();
	});

	it('pop скидає трек, якщо минуло понад 2 хв', () => {
		const queue = new ScheduleQueue();
		queue.set('t1');
		if (queue.queued) {
			queue.queued.at = Date.now() - 130_000;
		}
		expect(queue.pop()).toBeNull();
	});

	it('checkTimeout скидає прострочений трек', () => {
		const queue = new ScheduleQueue();
		queue.set('t1');
		if (queue.queued) {
			queue.queued.at = Date.now() - 130_000;
		}
		queue.checkTimeout();
		expect(queue.queued).toBeNull();
	});
});
