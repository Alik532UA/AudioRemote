// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../gates/storage';
import { ALL_CHECKS } from './checks';
import { betaMarks, reportText, trusted, VERSION, type Marks } from './marks.svelte';

/**
 * ПОЗНАЧКА — це чужа година роботи (BETA-CHECKLIST-v9 § 3.3, § 6, § 8.6).
 *
 * Три речі тут коштують дорожче за решту сторінки, і кожна ламається тихо:
 * повторне натискання, яке стирає замість підтвердити; позначка з чужої
 * збірки, яку порахували за свіжу; і прочитане зі сховища, яке вже не збігається
 * з чеклистом. Останнє дає поступ «40 / 37» — число, яке не означає нічого й не
 * має де виправитися.
 */

const known = new Set(ALL_CHECKS.map((check) => check.id));
const first = ALL_CHECKS[0].id;

beforeEach(() => {
	vi.stubGlobal('localStorage', memoryStorage());
	betaMarks.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('позначки чеклиста', () => {
	it('перевірка жива: у чеклисті є пункти, і версія не порожня', () => {
		expect(ALL_CHECKS.length).toBeGreaterThan(30);
		expect(VERSION, 'версія не приїхала зі збірки').toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('повторне натискання того самого стану знімає позначку', () => {
		betaMarks.vote(first, 'ok');
		expect(betaMarks.fresh(first)?.vote).toBe('ok');

		betaMarks.vote(first, 'ok');
		expect(betaMarks.fresh(first), 'помилковий клік мусить бути зворотним').toBeNull();
	});

	it('інший стан замінює позначку, а не знімає її', () => {
		betaMarks.vote(first, 'ok');
		betaMarks.vote(first, 'fail');
		expect(betaMarks.fresh(first)?.vote).toBe('fail');
	});

	it('на позначці з іншої версії повторне натискання ПЕРЕставляє її', () => {
		/*
		 * Інакше людина, яка підтверджує торішнє «працює», натомість його
		 * втрачає — тобто найзвичніша дія на новій збірці знищує роботу.
		 */
		betaMarks.marks = { [first]: { vote: 'ok', version: '0.0.1' } };
		expect(betaMarks.fresh(first), 'стара позначка не мусить рахуватися свіжою').toBeNull();
		expect(betaMarks.stale(first)).toBe(true);

		betaMarks.vote(first, 'ok');
		expect(betaMarks.fresh(first)?.version).toBe(VERSION);
	});

	it('поступ рахує лише позначки цієї збірки', () => {
		const [a, b] = ALL_CHECKS;
		betaMarks.marks = {
			[a.id]: { vote: 'ok', version: VERSION },
			[b.id]: { vote: 'ok', version: '0.0.1' }
		};
		expect(betaMarks.done, 'позначка з іншої збірки потрапила в поступ').toBe(1);
	});

	it('позначка переживає перезавантаження', () => {
		betaMarks.vote(first, 'weird');
		betaMarks.marks = {};
		betaMarks.load();
		expect(betaMarks.fresh(first)?.vote).toBe('weird');
	});
});

describe('прочитане зі сховища — недовірений ввід', () => {
	it('пункт, якого вже немає, у поступ не потрапляє', () => {
		const out = trusted(
			{ [first]: { vote: 'ok', version: VERSION }, ghost_9: { vote: 'ok', version: VERSION } },
			known
		);
		expect(Object.keys(out), 'видалений пункт дав би поступ більший за список').toEqual([first]);
	});

	it('позначка зіпсованої форми дорівнює відсутній', () => {
		const out = trusted(
			{
				[first]: { vote: 'maybe', version: VERSION },
				[ALL_CHECKS[1].id]: { vote: 'ok' },
				[ALL_CHECKS[2].id]: 'ok'
			},
			known
		);
		expect(out).toEqual({});
	});

	it('не обʼєкт у сховищі не валить сторінку', () => {
		expect(trusted('зіпсовано', known)).toEqual({});
		expect(trusted(null, known)).toEqual({});
	});
});

describe('звіт', () => {
	const marks: Marks = {
		[ALL_CHECKS[0].id]: { vote: 'ok', version: VERSION },
		[ALL_CHECKS[1].id]: { vote: 'fail', version: VERSION }
	};

	it('містить версію й лише позначені пункти', () => {
		const text = reportText(marks, 'uk');
		expect(text).toContain(VERSION);
		expect(text).toContain(ALL_CHECKS[0].id);
		expect(text).toContain(ALL_CHECKS[1].id);
		// Перелік недивленого зробив би звіт нечитним.
		expect(text).not.toContain(ALL_CHECKS[5].id);
	});

	it('поламане стоїть вище за робоче', () => {
		const text = reportText(marks, 'uk');
		expect(text.indexOf(ALL_CHECKS[1].id)).toBeLessThan(text.indexOf(ALL_CHECKS[0].id));
	});

	it('поламане в ПОКРИТОМУ місці називає тест, який цього не побачив', () => {
		const covered = ALL_CHECKS.find((check) => check.coverage === 'covered');
		expect(covered, 'у чеклисті немає покритих пунктів — перевіряти нічого').toBeDefined();

		const text = reportText({ [covered!.id]: { vote: 'fail', version: VERSION } }, 'uk');
		expect(text, 'звіт про дефект ТЕСТА мусить бути видно окремо').toContain(covered!.test);
	});

	it('порожній звіт так і каже', () => {
		expect(reportText({}, 'uk')).toContain('нічого не позначено');
	});
});
