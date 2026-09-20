// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { logCrashes, type CrashTarget } from './crashLog';

/**
 * ПЕРЕХОПЛЮВАЧ ПИШЕ В ЖУРНАЛ І НЕ ЛАМАЄТЬСЯ САМ.
 *
 * ## Чому ціль підставна, а не `window`
 *
 * Перевіряти треба ДВІ речі, і жодну з них справжнє вікно не показує краще:
 * що записалося (у житті це `localStorage`, якого в прогоні без DOM немає) і
 * що слухачі знялися. Підставна ціль відповідає на обидва без jsdom — а події
 * `unhandledrejection` jsdom однаково не піднімає сам.
 *
 * ## Межа перевірки
 *
 * Тут не перевіряється, що браузер справді шле ці дві події на виняток із
 * обробника — це його обов'язок за специфікацією, і підмінити його однаково
 * нічим. Перевіряється рішення модуля: що саме він запише й коли промовчить.
 */

/** Ціль, яка тримає слухачів у собі й уміє їх покликати. */
function fakeTarget() {
	const listeners = new Map<string, Set<(event: Event) => void>>();

	const target: CrashTarget = {
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)?.add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		}
	};

	return {
		target,
		count: (type: string) => listeners.get(type)?.size ?? 0,
		/** Підняти подію так, як її підняв би браузер. */
		raise(type: string, fields: Record<string, unknown>) {
			const event = Object.assign({ type }, fields) as unknown as Event;
			for (const listener of listeners.get(type) ?? []) listener(event);
		}
	};
}

function watched() {
	const steps: string[] = [];
	const fake = fakeTarget();
	const stop = logCrashes(fake.target, (step) => steps.push(step));
	return { ...fake, steps, stop };
}

describe('перехоплювач помилок (ERROR-HANDLING-v9 § 2.3)', () => {
	it('перевірка жива: слухачі стали на обидві події', () => {
		const { count } = watched();
		expect(count('error'), 'слухача виняткової ситуації немає — далі все дарма').toBe(1);
		expect(count('unhandledrejection')).toBe(1);
	});

	it('виняток поза межею потрапляє в журнал', () => {
		const { raise, steps } = watched();
		raise('error', {
			error: new TypeError('x is not a function'),
			filename: 'https://example.test/_app/immutable/chunks/D4q2.js',
			lineno: 12
		});

		expect(steps).toEqual(['crash TypeError: x is not a function @D4q2.js:12']);
	});

	it('відмова проміса, яку ніхто не перехопив, теж', () => {
		const { raise, steps } = watched();
		raise('unhandledrejection', { reason: new Error('база не відповіла') });

		expect(steps).toEqual(['unhandled Error: база не відповіла']);
	});

	it('кидають не лише Error — рядок теж записується', () => {
		// `throw 'щось'` і відмова проміса будь-яким значенням законні обидва.
		const { raise, steps } = watched();
		raise('unhandledrejection', { reason: 'просто рядок' });

		expect(steps).toEqual(['unhandled просто рядок']);
	});

	it('повтор не з’їдає журнал', () => {
		/*
		 * Виняток із таймера приходить десятки разів на секунду. Без цього
		 * тридцять записів журналу стають тридцятьма копіями одного рядка —
		 * тобто зникають кроки, заради яких журнал і ведеться.
		 */
		const { raise, steps } = watched();
		const failure = { error: new Error('той самий'), filename: 'a.js', lineno: 1 };
		for (let time = 0; time < 50; time++) raise('error', failure);

		expect(steps).toHaveLength(1);
	});

	it('після іншої помилки той самий рядок пишеться знову', () => {
		// Памʼять про повтор — ПРО ОСТАННІЙ рядок, а не про всі бачені: інакше
		// помилка, що чергується з іншою, зникла б з журналу назавжди.
		const { raise, steps } = watched();
		raise('error', { error: new Error('перша'), filename: 'a.js', lineno: 1 });
		raise('error', { error: new Error('друга'), filename: 'a.js', lineno: 2 });
		raise('error', { error: new Error('перша'), filename: 'a.js', lineno: 1 });

		expect(steps).toHaveLength(3);
	});

	it('довгий опис обрізається', () => {
		const { raise, steps } = watched();
		raise('unhandledrejection', { reason: 'я'.repeat(500) });

		expect(
			steps[0].length,
			'довге чуже повідомлення витіснить кроки з журналу'
		).toBeLessThanOrEqual(140);
	});

	it('опис, який не складається, не валить перехоплювач', () => {
		/*
		 * Перехоплювач помилок, який падає сам, лишає після себе менше, ніж його
		 * відсутність: виняток із слухача `error` піднімає ще один `error`.
		 */
		const { raise, steps } = watched();
		const hostile = {
			toString() {
				throw new Error('і тут теж');
			}
		};

		expect(() => raise('unhandledrejection', { reason: hostile })).not.toThrow();
		expect(steps).toEqual([]);
	});

	it('зняття прибирає обидва слухачі', () => {
		// Сторінки тут міняються без перезавантаження: слухач, якого не зняли,
		// записав би ту саму помилку стільки разів, скільки разів заходили.
		const { count, stop } = watched();
		stop();

		expect(count('error')).toBe(0);
		expect(count('unhandledrejection')).toBe(0);
	});
});
