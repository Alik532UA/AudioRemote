// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * МЕЖА ЧАСУ ПОШУКУ ДОШКИ ПРИБИРАЄ ЗА СОБОЮ.
 *
 * `Promise.race` не скасовує програвшого — він лише перестає його слухати.
 * Таймер, який лишився, нічого не ламає видимо: race підписаний на обидва
 * проміси, тож пізнє відхилення перехоплене й у консоль не потрапляє. Саме
 * тому дефект такого роду не помічають — його треба ЗАМІРЯТИ.
 *
 * Тут його й заміряно: `vi.getTimerCount()` після вдалої відповіді.
 *
 * ## Чому база підставна
 *
 * Справжня вимагала б емулятора й хвилини на прогін (`npm run check:rules`), а
 * питання тут не про базу зовсім: перевіряється, що робить ЦЕЙ модуль після
 * того, як відповідь прийшла.
 */

const exists = vi.fn();

vi.mock('./firebase', () => ({
	connect: () => Promise.resolve({ db: {}, uid: 'хтось' })
}));

vi.mock('firebase/database', () => ({
	ref: (_db: unknown, path: string) => ({ path }),
	get: () => exists()
}));

const { boardExists, BoardLookupTimeout } = await import('./board');

beforeEach(() => {
	vi.useFakeTimers();
	exists.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('межа часу пошуку дошки (board.ts)', () => {
	it('перевірка жива: відповідь бази доходить нагору', async () => {
		exists.mockResolvedValue({ exists: () => true });
		await expect(boardExists('хеш')).resolves.toBe(true);
	});

	it('таймер гаситься, коли база відповіла вчасно', async () => {
		exists.mockResolvedValue({ exists: () => true });
		await boardExists('хеш');

		expect(
			vi.getTimerCount(),
			'таймер пережив свою потребу: кожна спроба пароля лишає ще один на десять секунд'
		).toBe(0);
	});

	it('таймер гаситься й тоді, коли база відмовила', async () => {
		// Невдача — найімовірніший шлях саме тут: пароль підбирають з форми.
		exists.mockRejectedValue(new Error('база не в гуморі'));
		await expect(boardExists('хеш')).rejects.toThrow('база не в гуморі');

		expect(vi.getTimerCount()).toBe(0);
	});

	it('мовчання бази стає окремою помилкою, а не вічним очікуванням', async () => {
		exists.mockReturnValue(new Promise(() => undefined));
		const lookup = boardExists('хеш');
		const caught = expect(lookup).rejects.toBeInstanceOf(BoardLookupTimeout);

		await vi.advanceTimersByTimeAsync(10_000);
		await caught;
	});
});
