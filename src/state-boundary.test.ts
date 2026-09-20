// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * `$state` НЕ ПЕРЕТИНАЄ МЕЖУ СЕРІАЛІЗАЦІЇ БЕЗ ЗНІМКА
 * (SVELTE-CORE-v9 § 1.6, `SC-SNAPSHOT-BOUNDARY`, HIGH).
 *
 * ## Що саме ламається
 *
 * `$state` — це Proxy. Усередині Svelte це непомітно, а на межі, де обʼєкт
 * віддають комусь чужому, проявляється трьома різними способами:
 *
 *  1. `structuredClone` на проксі кидає `DataCloneError`. Тобто запис у
 *     IndexedDB або `postMessage` падає не там, де його писали, і повідомлення
 *     браузера про наш код не каже нічого.
 *  2. Той, хто ЗБЕРІГАЄ отриманий обʼєкт (SDK бази, опитувач із таймером),
 *     лишається з посиланням, яке міняється під ним. Порівняння «чи змінилося»
 *     тоді читає нове значення з обох боків і не бачить змін ніколи.
 *  3. `JSON.stringify` проксі не ламає — і саме тому місце легко пропустити:
 *     воно працює доти, доки той самий текст не починають брати зі знімка
 *     деінде, і два шляхи розходяться мовчки.
 *
 * ## Чому це знайшлося тут
 *
 * На момент постановки гейта таких місць було два, обидва — список треків:
 * `player/controller.svelte.ts` віддавав `JSON.stringify(this.entries)` в канал
 * адміністратора, а `remote/editor.svelte.ts` — у команду `tracks`. Той самий
 * список ішов ще й в опитувач тригерів, який тримає його МІЖ ТАКТАМИ ТАЙМЕРА:
 * випадок 2 у чистому вигляді.
 *
 * ## Межа перевірки
 *
 * Перевірка текстова, і це названо прямо: вона бачить `JSON.stringify(x)`,
 * `structuredClone(x)` і `postMessage(x)`, де `x` — імʼя, оголошене через
 * `$state` у ТОМУ Ж файлі (або метод, що його віддає). Знімок, схований за
 * викликом функції з іншого модуля, вона не простежить — для цього потрібен
 * граф типів, а не регулярка. Це не робить її марною: обидва справжні випадки
 * були саме такої форми, і вона червоніє на кожному наступному.
 *
 * Зворотний експеримент (AI-AGENT-PITFALLS-v9 § 1.1): з поверненим
 * `JSON.stringify(this.entries)` в обох файлах гейт падає з переліком із двох
 * рядків; зі знімками — зелений.
 */

const ROOT = 'src';

/** Виклики, після яких обʼєкт уже не наш: його або копіюють, або зберігають. */
const BOUNDARY = /\b(JSON\.stringify|structuredClone|postMessage)\s*\(/g;

function sources(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) sources(full, out);
		else if (/\.(svelte|svelte\.ts)$/.test(entry) && !/\.(spec|test)\.ts$/.test(entry))
			out.push(full);
	}
	return out;
}

/**
 * Імена полів і змінних, оголошених через `$state` у цьому файлі.
 *
 * `$state.snapshot` тут НЕ рахується оголошенням — це вже знімок, тобто
 * звичайні обʼєкти. Без цього винятку правильно написане місце
 * (`const tracks = $state.snapshot(...)`) само ставало б порушенням, і гейт
 * вимагав би прибрати саме те, заради чого існує. `$state.raw` лишається
 * оголошенням: проксі там немає лише на верхньому рівні.
 */
function stateNames(text: string): string[] {
	const names = new Set<string>();
	for (const match of text.matchAll(
		/(?:^|[\s;{(])([A-Za-z_$][\w$]*)\s*=\s*\$state(?!\.snapshot)\b/gm
	)) {
		names.add(match[1]);
	}
	return [...names];
}

/**
 * Аргумент виклику — текст до парної дужки.
 *
 * Рахувати дужки доводиться саме тому, що аргумент буває складений:
 * `JSON.stringify({ rev: this.rev, tracks: this.entries })`. Обрізання по
 * першій `)` побачило б у ньому порожнечу.
 */
function argumentOf(text: string, openAt: number): string {
	let depth = 0;
	for (let at = openAt; at < text.length; at += 1) {
		const char = text[at];
		if (char === '(') depth += 1;
		else if (char === ')') {
			depth -= 1;
			if (depth === 0) return text.slice(openAt + 1, at);
		}
	}
	return text.slice(openAt + 1);
}

const files = sources(ROOT);

const offenders: string[] = [];
for (const file of files) {
	const text = readFileSync(file, 'utf8');
	const names = stateNames(text);
	if (names.length === 0) continue;

	for (const call of text.matchAll(BOUNDARY)) {
		const openAt = call.index + call[0].length - 1;
		const argument = argumentOf(text, openAt);
		if (argument.includes('$state.snapshot')) continue;

		const crossing = names.filter((name) =>
			new RegExp(`(^|[^\\w$.])(this\\.)?${name}\\b`).test(argument)
		);
		if (crossing.length === 0) continue;

		const line = text.slice(0, call.index).split('\n').length;
		offenders.push(`${file.split(sep).join('/')}:${line} — ${call[1]}(… ${crossing.join(', ')} …)`);
	}
}

describe('межа серіалізації $state (SVELTE-CORE-v9 § 1.6)', () => {
	it('перевірка жива: файли з рунами знайдені', () => {
		/*
		 * Межа не нуль: звужений `include` або перейменована тека дали б порожній
		 * перелік, і гейт лишився б зеленим саме тоді, коли перестав дивитися
		 * (AI-AGENT-PITFALLS-v9 § 1.3).
		 */
		const withState = files.filter((file) => stateNames(readFileSync(file, 'utf8')).length > 0);
		expect(withState.length, 'жодного файлу з $state — перевіряти нема що').toBeGreaterThan(10);
	});

	it('перевірка жива: межові виклики в проєкті взагалі є', () => {
		/*
		 * Своя копія регулярки без `g`: `test()` на глобальній посуває
		 * `lastIndex`, і той самий перелік дав би різну відповідь через раз —
		 * зелений гейт, який нічого не міряє.
		 */
		const once = new RegExp(BOUNDARY.source);
		const calls = files.filter((file) => once.test(readFileSync(file, 'utf8')));
		expect(calls.length, 'жодного JSON.stringify — розбір зламався').toBeGreaterThan(0);
	});

	it('проксі не їде в серіалізацію без $state.snapshot', () => {
		expect(
			offenders,
			'обʼєкт зі $state перетинає межу без знімка: той, хто його збереже, ' +
				'лишиться з посиланням, що міняється під ним, а structuredClone просто кине'
		).toEqual([]);
	});
});
