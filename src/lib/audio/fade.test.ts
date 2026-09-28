// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fade, FADE_MS } from './fade';

/**
 * ПЕРЕХІД ГУЧНОСТІ — ЙОГО КІНЕЦЬ І ЙОГО СКАСУВАННЯ.
 *
 * Два твердження, від яких залежить, чи зупиниться звук у залі. Перше: перехід
 * ДОБІГАЄ, навіть коли кроки не приходять зовсім, — від кінця переходу
 * залежить `pause()`. Друге: скасований перехід свого «в кінці» НЕ робить —
 * інакше «стоп» і одразу «грати» за секунду знову зупиняли б щойно запущене.
 */

afterEach(() => {
	vi.useRealTimers();
});

describe('fade', () => {
	it('доходить до цілі й кличе «в кінці» рівно раз', () => {
		vi.useFakeTimers();
		const element = document.createElement('audio');
		element.volume = 0;
		const done = vi.fn();

		fade(element, 0.7, done);
		vi.advanceTimersByTime(FADE_MS / 2);
		expect(element.volume).toBeGreaterThan(0.2);
		expect(element.volume).toBeLessThan(0.5);

		vi.advanceTimersByTime(FADE_MS);
		expect(element.volume).toBeCloseTo(0.7, 5);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('добігає кінця, навіть коли жоден крок не прийшов', () => {
		/*
		 * Найгірший випадок гальмування: кроки не приходять зовсім, лишається
		 * лише одноразовий таймер кінця. Саме він гарантує `pause()` після «стоп».
		 */
		vi.useFakeTimers();
		const element = document.createElement('audio');
		element.volume = 1;
		const done = vi.fn();
		const interval = vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as never);

		fade(element, 0, done);
		vi.advanceTimersByTime(FADE_MS);

		expect(done, 'без кроків перехід не добіг').toHaveBeenCalledTimes(1);
		expect(element.volume).toBe(0);
		interval.mockRestore();
	});

	it('скасований перехід не кличе «в кінці» й лишає гучність, де була', () => {
		vi.useFakeTimers();
		const element = document.createElement('audio');
		element.volume = 1;
		const done = vi.fn();

		const cancel = fade(element, 0, done);
		vi.advanceTimersByTime(FADE_MS / 4);
		const at = element.volume;
		cancel();
		vi.advanceTimersByTime(FADE_MS * 2);

		expect(done, 'скасована пауза все одно зупинила звук').not.toHaveBeenCalled();
		expect(element.volume).toBe(at);
	});
});
