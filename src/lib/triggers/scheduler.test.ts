import { describe, expect, it } from 'vitest';
import { SchedulerWatcher } from './scheduler.svelte';
import type { TrackTrigger } from './trigger';

const scheduleTrigger = (days: number[], times: string[]): TrackTrigger => ({
	on: true,
	mode: 'schedule',
	url: '',
	everySec: 30,
	headers: {},
	path: '',
	test: 'truthy',
	value: '',
	onChange: true,
	blocks: [{ id: 'b1', days, times }]
});

describe('SchedulerWatcher', () => {
	it('спрацьовує на :00 секунді якщо час збігається', () => {
		const watcher = new SchedulerWatcher();
		const fired: string[] = [];
		watcher.onFire((id) => fired.push(id));

		watcher.sync([{ id: 't1', trigger: scheduleTrigger([0], ['09:00']) }]);

		// Понеділок 2026-09-21, 09:00:00
		const now = new Date(2026, 8, 21, 9, 0, 0);
		watcher.tick(now);

		expect(fired).toEqual(['t1']);
	});

	it('не спрацьовує двічі в ту саму хвилину', () => {
		const watcher = new SchedulerWatcher();
		const fired: string[] = [];
		watcher.onFire((id) => fired.push(id));

		watcher.sync([{ id: 't1', trigger: scheduleTrigger([0], ['09:00']) }]);

		const now1 = new Date(2026, 8, 21, 9, 0, 0);
		watcher.tick(now1);

		const now2 = new Date(2026, 8, 21, 9, 0, 0);
		watcher.tick(now2);

		expect(fired).toEqual(['t1']);
	});

	it('grace period: після сну <= 2 хв запускає трек', () => {
		const watcher = new SchedulerWatcher();
		const fired: string[] = [];
		const missed: string[] = [];
		watcher.onFire((id) => fired.push(id));
		watcher.onMissed((id, time) => missed.push(`${id}:${time}`));

		watcher.sync([{ id: 't1', trigger: scheduleTrigger([0], ['09:00']) }]);

		// Останній такт був о 08:58:00
		const before = new Date(2026, 8, 21, 8, 58, 0);
		watcher.tick(before);

		// Прокинувся о 09:01:30 (через 90 секунд після події <= 120s)
		const after = new Date(2026, 8, 21, 9, 1, 30);
		watcher.tick(after);

		expect(fired).toEqual(['t1']);
		expect(missed).toEqual([]);
	});

	it('grace period: після сну > 2 хв вважає подію пропущеною', () => {
		const watcher = new SchedulerWatcher();
		const fired: string[] = [];
		const missed: string[] = [];
		watcher.onFire((id) => fired.push(id));
		watcher.onMissed((id, time) => missed.push(`${id}:${time}`));

		watcher.sync([{ id: 't1', trigger: scheduleTrigger([0], ['09:00']) }]);

		// Останній такт був о 08:50:00
		const before = new Date(2026, 8, 21, 8, 50, 0);
		watcher.tick(before);

		// Прокинувся о 09:05:00 (через 5 хв після події > 120s)
		const after = new Date(2026, 8, 21, 9, 5, 0);
		watcher.tick(after);

		expect(fired).toEqual([]);
		expect(missed).toEqual(['t1:09:00']);
	});
});
