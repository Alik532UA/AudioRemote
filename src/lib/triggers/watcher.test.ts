// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTrigger, type TrackTrigger } from './trigger';
import { triggerWatcher } from './watcher.svelte';

/**
 * ОПИТУВАЧ ПРОТИ СЕРВЕРА, ЯКИЙ МОВЧИТЬ.
 *
 * ## Що тут перевіряється й чому саме це
 *
 * `fetch` без межі часу її не має взагалі. Сервер, який прийняв зʼєднання й
 * замовк, тримає запит хвилинами — а такт іде далі й ставить наступний. Шість
 * зʼєднань на хост, сьоме в черзі, і за ніч опитування зупиняється саме собою.
 * На екрані при цьому стоїть остання вдала відповідь, тобто «все гаразд».
 *
 * Для цього застосунку це не абстракція: за тригером ходить сирена повітряної
 * тривоги, і «тихо перестало опитуватися» означає, що вона не пролунає.
 *
 * Три властивості, кожна зі своїм дефектом:
 *
 * 1. **У запиту є межа часу**, і вона дорівнює такту, але не більша за десять
 *    секунд. Зворотний експеримент: прибрати `signal:` — падає перший опис;
 *    зняти `Math.min(..., TIMEOUT_CAP_MS)` — падає другий.
 * 2. **Такт, що застав попередній запит у дорозі, пропускається.** Зворотний
 *    експеримент: прибрати перевірку `inFlight` — `fetch` кличеться двічі.
 * 3. **Відповідь, що прийшла після зміни налаштувань, не застосовується.**
 *    Зворотний експеримент: прибрати звірку `this.groups[key] !== group` —
 *    знятий тригер запускає трек.
 *
 * ## Чому підставний `fetch`, а не мережа
 *
 * Сервер, який приймає зʼєднання й мовчить, у тесті не підняти інакше: справжня
 * затримка коштувала б рівно тих секунд, що й межа.
 */

/** Адреса не резолвиться нікуди: запит однаково йде в підставний `fetch`. */
const URL_A = 'https://example.test/alerts';
const URL_B = 'https://example.test/other';

const trigger = (over: Partial<TrackTrigger> = {}): TrackTrigger => ({
	...emptyTrigger(),
	on: true,
	url: URL_A,
	...over
});

interface Call {
	url: string;
	init: RequestInit;
	/** Віддати відповідь цього запиту. */
	resolve: (body: unknown) => void;
	/** Обірвати цей запит так, як це робить межа часу. */
	timeout: () => void;
}

let calls: Call[] = [];
let fired: string[] = [];

beforeEach(() => {
	vi.useFakeTimers();
	calls = [];
	fired = [];
	triggerWatcher.onFire((trackId) => fired.push(trackId));

	vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
		return new Promise((resolve, reject) => {
			calls.push({
				url,
				init,
				resolve: (body) =>
					resolve({ ok: true, status: 200, json: async () => body } as unknown as Response),
				// Те саме, що кидає браузер по `AbortSignal.timeout`: DOMException
				// на імʼя `TimeoutError`. Опитувач розрізняє випадки саме за імʼям.
				timeout: () =>
					reject(
						Object.assign(new Error('The operation timed out.'), {
							name: 'TimeoutError'
						})
					)
			});
		});
	});
});

afterEach(() => {
	triggerWatcher.stop();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('межа часу запиту (SC-ABORT-SIGNAL, CI-THIRD-PARTY-OUTAGE)', () => {
	it('перевірка жива: увімкнений тригер справді породжує запит', () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger() }]);
		expect(calls.length, 'опитувач не сходив нікуди — далі все зелене дарма').toBe(1);
		expect(calls[0].url).toBe(URL_A);
	});

	it('запит несе сигнал скасування', () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger() }]);
		expect(calls[0].init.signal, 'запит без signal висітиме, скільки схоче сервер').toBeDefined();
	});

	it('межа дорівнює такту, доки такт не більший за десять секунд', async () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ everySec: 7 }) }]);
		calls[0].timeout();
		await vi.waitUntil(() => triggerWatcher.health.t1?.error);

		expect(triggerWatcher.health.t1.error).toEqual({ code: 'timeout', detail: '7' });
	});

	it('на довгому такті межа лишається десятьма секундами', async () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ everySec: 600 }) }]);
		calls[0].timeout();
		await vi.waitUntil(() => triggerWatcher.health.t1?.error);

		// Рішення «чи вмикати сирену», старше за десять секунд, нікому не
		// потрібне — і тримати під нього зʼєднання десять хвилин тим паче.
		expect(triggerWatcher.health.t1.error).toEqual({ code: 'timeout', detail: '10' });
	});

	it('обрив за часом не зупиняє опитування назавжди', async () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ everySec: 5 }) }]);
		calls[0].timeout();
		await vi.waitUntil(() => triggerWatcher.health.t1?.error);

		// Прапорець `inFlight` знімається в `finally`: без цього перша ж невдача
		// лишала б його піднятим, і наступний такт пропускався б уже назавжди.
		await vi.advanceTimersByTimeAsync(5000);
		expect(calls.length, 'після обриву опитування більше не відновилося').toBe(2);
	});
});

describe('запити не накладаються (watcher.svelte.ts, inFlight)', () => {
	it('такт, що застав попередній запит у дорозі, пропускається', async () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ everySec: 5 }) }]);
		expect(calls.length).toBe(1);

		// Перший запит не відповідає — саме той випадок, заради якого все це.
		await vi.advanceTimersByTimeAsync(5000);
		await vi.advanceTimersByTimeAsync(5000);

		expect(calls.length, 'запити накладаються — черга до хоста росте без межі').toBe(1);
	});

	it('після відповіді наступний такт питає знову', async () => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ everySec: 5 }) }]);
		calls[0].resolve({ active: true });
		await vi.waitUntil(() => triggerWatcher.health.t1);

		await vi.advanceTimersByTimeAsync(5000);
		expect(calls.length).toBe(2);
	});
});

describe('пізня відповідь не застосовується (watcher.svelte.ts)', () => {
	/**
	 * Перший такт не запускає НІЧОГО за побудовою: `shouldFire` на порожній
	 * памʼяті віддає `false`, бо «умова виконується від початку спостереження» —
	 * не подія. Тому кожен опис нижче спершу доводить перше опитування до
	 * відповіді: інакше він був би зеленим і без жодного захисту, тобто не
	 * перевіряв би нічого (TESTID-AND-NAMING-v9, CRITICAL про тест-заглушку).
	 */
	const primed = async (over: Partial<TrackTrigger> = {}) => {
		triggerWatcher.sync([{ id: 't1', trigger: trigger({ path: 'state', ...over }) }]);
		calls[0].resolve({ state: '' });
		await vi.waitUntil(() => triggerWatcher.health.t1);

		await vi.advanceTimersByTimeAsync(30_000);
		expect(calls.length, 'другого такту не було — далі перевіряти нема чого').toBe(2);
		return calls[1];
	};

	it('знятий тригер не запускає трек відповіддю, яка була в дорозі', async () => {
		const stale = await primed();

		// Людина прибрала тригер, поки запит ішов.
		triggerWatcher.sync([]);
		stale.resolve({ state: 'ALARM' });
		await vi.advanceTimersByTimeAsync(0);

		expect(fired, 'трек запущено за умовою, якої вже немає — а трек у залі чути').toEqual([]);
		expect(triggerWatcher.health.t1.value, 'стан знятого тригера ожив').not.toContain('ALARM');
	});

	it('змінена адреса не дістає стану від попередньої', async () => {
		const stale = await primed();

		triggerWatcher.sync([{ id: 't1', trigger: trigger({ path: 'state', url: URL_B }) }]);
		expect(calls.at(-1)?.url).toBe(URL_B);

		stale.resolve({ state: 'ALARM' });
		await vi.advanceTimersByTimeAsync(0);

		expect(fired, 'спрацювала умова за адресою, яку вже не питають').toEqual([]);
		expect(triggerWatcher.health.t1.value, 'відповідь старої адреси доїхала').not.toContain(
			'ALARM'
		);
	});
});
