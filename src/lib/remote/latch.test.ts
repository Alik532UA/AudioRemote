import { describe, expect, it } from 'vitest';
import { createLatch, SEEK_TOLERANCE_MS } from './latch';

const exact = (mine: number, incoming: number) => mine === incoming;

describe('засувка свого значення', () => {
	it('без наказу показує те, що прийшло', () => {
		const latch = createLatch(exact, 2000);
		expect(latch.show(42, 0)).toBe(42);
	});

	it('тримає своє, поки приходить старе', () => {
		/*
		 * Це і є та сама щілина: команда ще в дорозі, а оголошення зі старим
		 * значенням уже прилетіло. Доти повзунок відскакував саме тут.
		 */
		const latch = createLatch(exact, 2000);
		latch.set(70, 1000);

		expect(latch.show(35, 1050)).toBe(70);
		expect(latch.show(35, 1200)).toBe(70);
	});

	it('відпускає, щойно приймач підтвердив', () => {
		const latch = createLatch(exact, 2000);
		latch.set(70, 1000);

		expect(latch.show(70, 1300)).toBe(70);
		expect(latch.held).toBe(false);
		// Далі стан приймача головний — зокрема й зміни з іншого пульта.
		expect(latch.show(35, 1400)).toBe(35);
	});

	it('відпускає за часом, якщо підтвердження немає', () => {
		// Приймача закрили, мережа впала, гучність уперлася в межу. Повзунок, який
		// назавжди показує вигадку, гірший за стрибок.
		const latch = createLatch(exact, 2000);
		latch.set(70, 1000);

		expect(latch.show(35, 2999)).toBe(70);
		expect(latch.show(35, 3000)).toBe(35);
		expect(latch.held).toBe(false);
	});

	it('позиція підтверджується з допуском', () => {
		/*
		 * Точної рівності не буде ніколи: приймач перемотує до найближчого кадру,
		 * а трек тим часом грає далі.
		 */
		const near = (mine: number, incoming: number) => Math.abs(mine - incoming) <= SEEK_TOLERANCE_MS;
		const latch = createLatch(near, 3000);
		latch.set(60_000, 0);

		expect(latch.show(10_000, 100)).toBe(60_000);
		expect(latch.show(60_900, 400)).toBe(60_900);
		expect(latch.held).toBe(false);
	});
});
