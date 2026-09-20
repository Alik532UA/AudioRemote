// @vitest-environment node
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * БАЗОВИЙ НАБІР ESLINT УВІМКНЕНИЙ — і це перевіряється, а не мається на увазі
 * (CODE-QUALITY-v9 § 6.4.1, `CQ-ESLINT-BASELINE`, CRITICAL).
 *
 * ## Навіщо гейт над самим лінтером
 *
 * Зелений `npm run lint` доводить рівно те, що правила, які діють, не порушені.
 * Про правила, яких у конфігу немає, він мовчить — і виглядає це однаково.
 * Тут це було не гіпотезою: заради однієї глобальної `__APP_VERSION__` на весь
 * проєкт стояло `no-undef: 'off'`, тобто клас «звернення до неоголошеного
 * імені» не перевірявся ніде. Тепер глобальна оголошена, правило увімкнене, а
 * цей файл стереже, щоб наступне таке ім'я не повернуло вимкнення.
 *
 * ## Чому читається ЗІБРАНИЙ конфіг, а не текст файлу
 *
 * `calculateConfigForFile` віддає те, що справді діє на файл. Правило може
 * зникнути не з нашого рядка, а зі зміни пресету (`svelte.configs.recommended`
 * між мажорами плагіна), і в тексті `eslint.config.js` цього не видно взагалі.
 *
 * ## Чому зразок — саме `.svelte`
 *
 * Правила `svelte/*` живуть у блоці для цього розширення; на `.ts` їх у
 * зібраному конфігу немає, і перевірка на `.ts` була б зеленою з тієї ж
 * причини, з якої вона потрібна.
 *
 * Зворотний експеримент (AI-AGENT-PITFALLS-v9 § 1.1): `svelte/no-at-html-tags`,
 * тимчасово повернуте в `off`, валить цей файл одним рядком; повернуто —
 * зелено.
 */
const BASELINE = [
	'no-undef',
	'no-eval',
	'no-implied-eval',
	'no-new-func',
	'no-script-url',
	'no-restricted-imports',
	'@typescript-eslint/no-explicit-any',
	'@typescript-eslint/no-unused-vars',
	'@typescript-eslint/ban-ts-comment',
	'svelte/no-at-html-tags',
	'svelte/require-each-key',
	'svelte/prefer-svelte-reactivity',
	'svelte/no-navigation-without-resolve'
] as const;

/** Звичайна сторінка проєкту: жодних власних винятків у конфігу вона не має. */
const SAMPLE = 'src/routes/menu/+page.svelte';

const levelOf = (entry: unknown): string | number | undefined =>
	Array.isArray(entry) ? (entry[0] as string | number) : (entry as string | number);

describe('базовий набір ESLint (CODE-QUALITY-v9 § 6.4.1)', () => {
	/*
	 * Node API замість `npx eslint --print-config`: з Node 22+ запуск `.cmd` без
	 * `shell: true` падає з EINVAL, а `shell: true` дає DEP0190. Через API це той
	 * самий зібраний конфіг, тільки без підпроцесу.
	 */
	let rules: Record<string, unknown>;

	beforeAll(async () => {
		const config = (await new ESLint().calculateConfigForFile(SAMPLE)) as {
			rules: Record<string, unknown>;
		};
		rules = config.rules;
		// 30 с, а не типові 5: розвʼязання конфігу тягне пресети svelte й
		// typescript-eslint, і під паралельним прогоном типового ліміту не
		// вистачає — гейт червонів би без жодного порушення.
	}, 30_000);

	it.each(BASELINE)('%s не вимкнене', (rule) => {
		const level = levelOf(rules[rule]);
		expect(
			level,
			'правила немає в зібраному конфігу — звіт lint не покриває цей клас порушень'
		).toBeDefined();
		expect(level, 'правило вимкнене — зелений lint нічого не доводить').not.toBe('off');
		expect(level, 'правило вимкнене — зелений lint нічого не доводить').not.toBe(0);
	});
});

/**
 * БОРГ ESLINT — ЧИСЛО, ЯКЕ ЗВІРЯЄТЬСЯ НА РІВНІСТЬ
 * (CODE-QUALITY-v9 § 6.4.1, `CQ-ESLINT-DEBT-LEDGER`).
 *
 * Перевірка вище каже, що правило не `off`. Скільки саме порушень воно зараз
 * дає, вона не каже нічого — а це і є борг. Тут він порожній: на момент коміту
 * прогін дає нуль попереджень і нуль помилок, і саме нуль записаний числом.
 *
 * Рівність, а не «не більше», навмисно: «не більше» ловить зростання й
 * пропускає застарівання — виправили три місця, число лишилося старим, і
 * наступний читач бачить борг, якого немає (AI-AGENT-PITFALLS-v9 § 5.5).
 */
const DEBT: Readonly<Record<string, number>> = {};

describe('борг ESLint (CODE-QUALITY-v9 § 6.4.1)', () => {
	let counts: Record<string, number>;
	let errors: number;
	let linted: number;

	beforeAll(async () => {
		const results = await new ESLint().lintFiles(['.']);
		counts = {};
		errors = 0;
		linted = results.length;
		for (const result of results) {
			for (const message of result.messages) {
				const rule = message.ruleId ?? '(без правила)';
				counts[rule] = (counts[rule] ?? 0) + 1;
				if (message.severity === 2) errors++;
			}
		}
		// 120 с: повний прохід із перевіркою типів на цій машині займає близько
		// 40 с, і плаваючий таймаут дав би червоний гейт там, де порушення немає.
	}, 120_000);

	it('перевірка жива: lint узяв джерела проєкту', () => {
		/*
		 * Межа не нуль. `> 0` ловить лише повністю мертвий прохід, а гейт так само
		 * міряє порожнечу, коли `ignores` почав ховати майже все: один узятий файл
		 * дасть нуль попереджень, мапа боргу зійдеться, і це прочитається як
		 * «боргу немає». 80 — при заміряних 152 файлах на момент коміту.
		 */
		expect(linted, 'ESLint не взяв жодного файлу — гейт міряє порожнечу').toBeGreaterThan(80);
	});

	it('помилок немає', () => {
		expect(errors).toBe(0);
	});

	it('немає попередження без записаного числа', () => {
		const unlisted = Object.keys(counts).filter((rule) => !(rule in DEBT));
		expect(
			unlisted,
			`правило дає попередження, а числа для нього немає:\n${unlisted.join('\n')}`
		).toEqual([]);
	});

	it.each(Object.keys(DEBT))('%s: борг не зріс і число не застаріло', (rule) => {
		expect(counts[rule] ?? 0).toBe(DEBT[rule]);
	});
});
