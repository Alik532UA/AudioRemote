// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ОЧІКУВАННЯ КВИТАНЦІЇ ПЕРЕЖИВАЄ СИНХРОННИЙ КОЛБЕК.
 *
 * `onValue` має право покликати колбек ОДРАЗУ, всередині самого виклику, — так
 * він робить, коли значення вже лежить у кеші SDK. Код, написаний з думкою
 * «спершу підпишемося, потім колись покличуть», у цю мить звертається до
 * власної підписки, якої ще немає.
 *
 * Сьогодні цей шлях не спрацьовує: вузол квитанції щойно створений і в кеші
 * його нема. Тобто перевірка стереже ПАСТКУ, а не поточний дефект — і саме
 * тому вона тут потрібна: сам по собі цей шлях ніколи не з'явиться в прогоні.
 *
 * Впало б це в колбеку бази, де на виняток ніхто не чекає, а зовні виглядало б
 * як «пульт не дочекався квитанції».
 */

type Listener = (snapshot: { val: () => unknown }) => void;

/** Коли SDK кличе колбек: одразу чи пізніше. */
let callback: 'sync' | 'later' = 'later';
let pending: Listener | null = null;
const unsubscribe = vi.fn();
const ack = { ok: true };

vi.mock('./firebase', () => ({
	connect: () => Promise.resolve({ db: {}, uid: 'хтось' })
}));

vi.mock('firebase/database', () => ({
	ref: (_db: unknown, path: string) => ({ path }),
	onValue: (_node: unknown, listener: Listener) => {
		if (callback === 'sync') listener({ val: () => ack });
		else pending = listener;
		return unsubscribe;
	}
}));

const { waitForAck } = await import('./commands');

beforeEach(() => {
	vi.useFakeTimers();
	callback = 'later';
	pending = null;
	unsubscribe.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('очікування квитанції (commands.ts)', () => {
	it('перевірка жива: квитанція, що приїхала пізніше, доходить нагору', async () => {
		const waiting = waitForAck('boards/хеш', 'кмд1');
		await vi.advanceTimersByTimeAsync(0);
		pending?.({ val: () => ack });

		await expect(waiting).resolves.toEqual(ack);
		expect(unsubscribe, 'підписка лишилася висіти після відповіді').toHaveBeenCalledTimes(1);
	});

	it('квитанція з кешу не валить очікування', async () => {
		callback = 'sync';
		await expect(waitForAck('boards/хеш', 'кмд1')).resolves.toEqual(ack);
	});

	it('підписка знімається й тоді, коли колбек покликали синхронно', async () => {
		// Інакше вона лишилася б назавжди рівно в тому випадку, який тут і лікують.
		callback = 'sync';
		await waitForAck('boards/хеш', 'кмд1');

		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('мовчання приймача стає відповіддю «квитанції немає»', async () => {
		const waiting = waitForAck('boards/хеш', 'кмд1');
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(60_000);

		await expect(waiting).resolves.toBeNull();
		expect(vi.getTimerCount(), 'таймер квитанції пережив свою потребу').toBe(0);
	});
});
