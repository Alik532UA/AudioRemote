import { describe, expect, it } from 'vitest';
import { createUpdateSchedule, MIN_GAP_MS, type UpdateHost } from './updateCheck';

/** Ведучий годинник і лічильник запитів: у тесті мережі немає, а рішення є. */
function host(overrides: Partial<UpdateHost> = {}) {
	const state = { at: 1_000_000, online: true, asked: 0 };
	const base: UpdateHost = {
		now: () => state.at,
		online: () => state.online,
		update: () => {
			state.asked += 1;
		}
	};
	return { state, host: { ...base, ...overrides } };
}

describe('коли питати про оновлення', () => {
	it('перший раз питає одразу', () => {
		const { state, host: h } = host();
		const schedule = createUpdateSchedule(h);

		expect(schedule.tick()).toBe(true);
		expect(state.asked).toBe(1);
	});

	it('повернення до вкладки не дає двох запитів підряд', () => {
		/*
		 * Заради цього проміжок і потрібен: `visibilitychange` і `focus`
		 * приходять обидва, і без нього одне переключення вікна б'є двічі.
		 */
		const { state, host: h } = host();
		const schedule = createUpdateSchedule(h);

		schedule.tick();
		expect(schedule.tick()).toBe(false);
		expect(state.asked).toBe(1);
	});

	it('після проміжку питає знову', () => {
		const { state, host: h } = host();
		const schedule = createUpdateSchedule(h);

		schedule.tick();
		state.at += MIN_GAP_MS + 1;

		expect(schedule.tick()).toBe(true);
		expect(state.asked).toBe(2);
	});

	it('офлайн не питає взагалі', () => {
		const { state, host: h } = host();
		const schedule = createUpdateSchedule(h);

		state.online = false;
		expect(schedule.tick()).toBe(false);
		expect(state.asked).toBe(0);
	});

	it('офлайн не витрачає проміжок: щойно мережа є — питає', () => {
		// Інакше спроба без мережі «з'їдала» б хвилину мовчання після себе.
		const { state, host: h } = host();
		const schedule = createUpdateSchedule(h);

		state.online = false;
		schedule.tick();

		state.online = true;
		expect(schedule.tick()).toBe(true);
		expect(state.asked).toBe(1);
	});
});
