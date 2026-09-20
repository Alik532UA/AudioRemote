// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ЖИВА ПІДПИСКА, ЯКУ НІХТО НЕ КЛИЧЕ, І СЛУХАЧ, ЯКОГО НІХТО НЕ ЗНІМАЄ
 * (SVELTE-CORE-v9 § 3.2.1 `SC-SUBSCRIPTION-WIRED`, § 2.2.2 `SC-LISTENER-CLEANUP`).
 *
 * ## Чому це один файл
 *
 * Обидві помилки — про підключення, і обидві компілятор вважає нормою.
 * Публічна функція без викликів для нього законна; `addEventListener` без пари
 * — теж.
 *
 * ## Що вони коштують тут
 *
 * Підписка, яку не викликали, виглядає як відсутня функція, а не як забутий
 * рядок: «пульт не бачить, що трек змінився» читається як поломка мережі, і
 * шукати починають у базі. Усе, чим цей застосунок живе, приходить саме
 * підписками — бібліотека, стан, команди, присутність, канал адміністратора.
 *
 * Слухач, якого не зняли, коштує ще дорожче через одну особливість проєкту:
 * сторінка приймача відкривається й закривається без перезавантаження, а
 * контролер ставить підписки на кожне відкриття. Три відкриття — і кожна
 * команда з пульта виконується тричі. Саме тому контролер тримає перелік
 * прибирань, а не покладається на пам'ять.
 *
 * ## Межа перевірки
 *
 * Перевірка текстова й бачить ФАЙЛ, а не потік виконання: модуль, який додає
 * слухача, мусить містити і зняття. Модуль, який навмисно тримає слухача до
 * кінця життя вкладки, називається тут поіменно — інакше виняток мовчазно
 * поширився б на всі.
 */

const IGNORED_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dev-dist']);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (IGNORED_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full.split('\\').join('/'));
	}
	return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const isTest = (file: string): boolean => /\.(test|spec)\.ts$/.test(file);

const sources = walk('src').filter((file) => /\.(ts|svelte)$/.test(file) && !isTest(file));

// ─── Підписки мережевого шару ─────────────────────────────────────────────

/** Мережевий шар: тут живуть усі підписки на базу. */
const NET = sources.filter((file) => file.startsWith('src/lib/net/'));

const subscriptions = NET.flatMap((file) =>
	[...read(file).matchAll(/export (?:async )?function (watch[A-Z]\w*)/g)].map((m) => ({
		file,
		name: m[1]
	}))
);

describe('живі підписки досяжні (SVELTE-CORE-v9 § 3.2.1)', () => {
	it('перевірка жива: підписки в мережевому шарі знайдено', () => {
		expect(subscriptions.length, 'жодної підписки — сканер шукає не там').toBeGreaterThan(3);
	});

	it('кожну підписку хтось кличе поза мережевим шаром', () => {
		/*
		 * КЛИЧЕ — ЦЕ КОНТРОЛЕР АБО ЕКРАН, а не сусідній модуль того ж шару й не
		 * власна перевірка. Підписка, до якої доходить лише тест, так само
		 * недосяжна для людини — саме те, що треба ловити.
		 *
		 * Шукається ВИКЛИК з дужкою, а не назва: коментарі поруч називають ці
		 * функції, і перевірка на просту назву лишалася б зеленою, якби код
		 * прибрали, а пояснення — ні.
		 */
		const callers = sources
			.filter((file) => !file.startsWith('src/lib/net/'))
			.map(read)
			.join('\n');

		const orphans = subscriptions
			.filter(({ name }) => !callers.includes(`${name}(`))
			.map(({ file, name }) => `${name} (${file})`);

		expect(
			orphans,
			`підписка без жодного виклику — екран її не отримає: ${orphans.join(', ')}`
		).toEqual([]);
	});
});

// ─── Слухачі знімаються ───────────────────────────────────────────────────

/**
 * Модулі, які тримають слухача до кінця життя вкладки — навмисно.
 *
 * Перелік поіменний: без нього виняток розповзся б на всі файли, а разом із ним
 * зникла б і перевірка.
 */
const KEEPS_LISTENER: Readonly<Record<string, string>> = {
	// Порожній, і це замір, а не заготовка: на сьогодні кожен модуль, який
	// ставить слухача чи таймер, знімає його сам. Перелік лишається тому, що
	// законний виняток тут можливий — але мусить бути названий.
};

const ADDS = /addEventListener\(|setInterval\(|\.observe\(/;
const REMOVES =
	/removeEventListener\(|clearInterval\(|\.disconnect\(|\.unobserve\(|AbortController/;

describe('слухачі знімаються (SVELTE-CORE-v9 § 2.2.2)', () => {
	const adding = sources.filter((file) => ADDS.test(read(file)));

	it('перевірка жива: модулі зі слухачами знайдено', () => {
		expect(adding.length, 'жодного addEventListener — сканер шукає не там').toBeGreaterThan(3);
	});

	it('модуль, що ставить слухача, містить і зняття', () => {
		const leaking = adding
			.filter((file) => !REMOVES.test(read(file)))
			.filter((file) => !(file in KEEPS_LISTENER))
			.map((file) => file);

		expect(
			leaking,
			'слухач переживе перехід на іншу сторінку, і після трьох відкриттів ' +
				`кожна дія виконається тричі:\n${leaking.join('\n')}`
		).toEqual([]);
	});

	it('у переліку винятків немає файлів, які вже прибирають за собою', () => {
		// Прострочений виняток приховає наступний витік у тому самому файлі.
		const stale = Object.keys(KEEPS_LISTENER).filter(
			(file) => !adding.includes(file) || REMOVES.test(read(file))
		);
		expect(stale, `виняток більше не потрібен: ${stale.join(', ')}`).toEqual([]);
	});
});
