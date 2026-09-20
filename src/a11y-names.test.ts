// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * У КОЖНОГО КЕРУВАННЯ Є ІМʼЯ — І ЦЕ ШУКАЄТЬСЯ СТАТИЧНО
 * (ACCESSIBILITY-v9 § 10.6, `A11Y-STATIC-ICON-LABEL`, HIGH).
 *
 * ## Чому статично, а не axe над сторінкою
 *
 * Половина керування тут живе в діалогах і гілках `{#if}`: вікно треку, вікно
 * тригера, панель адміністратора, підказка про оновлення. Щоб axe їх побачив,
 * сторінку треба довести до того стану, у якому вони показані, — тобто написати
 * сценарій на кожну гілку. Розмітка ж лежить у файлі цілком, і прочитати її
 * можна без браузера взагалі.
 *
 * ## Що означає «немає імені»
 *
 * Кнопка з самою лише іконкою для читалки — це «кнопка». Не «пауза», не
 * «наступний», не «закрити»: просто кнопка, і таких на сторінці приймача
 * десяток. Те саме з повзунком: `<input type="range">` без імені озвучується як
 * «повзунок», і людина з читалкою не дізнається, це гучність чи перемотка.
 *
 * ## Що вважається імʼям
 *
 * `aria-label`, `aria-labelledby`, `title`, видимий текст усередині, а для полів
 * — ще й `<label>`: і той, що обгортає поле, і той, що вказує на нього через
 * `for`. Обидві форми тут ужито, тож перевірка мусить знати обидві — інакше
 * вона червоніла б на правильній розмітці, і це закінчилося б її вимкненням.
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
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

const files = walk('src').filter((file) => file.endsWith('.svelte'));

/** Імʼя, дане атрибутом, — однакове для будь-якого елемента. */
const NAMED_BY_ATTR = /aria-label[=\s]|aria-labelledby=|\btitle=/;

const lineOf = (text: string, at: number): number => text.slice(0, at).split('\n').length;

/** Текст елемента без тегів і без блоків `{#if}`/`{:else}`/`{/if}`. */
function visibleText(body: string): string {
	return body
		.replace(/<[^>]*>/g, ' ')
		.replace(/\{[#:/][^}]*\}/g, ' ')
		.trim();
}

interface Finding {
	where: string;
	what: string;
}

const buttonsWithoutName: Finding[] = [];
const fieldsWithoutName: Finding[] = [];

for (const file of files) {
	const text = readFileSync(file, 'utf8');

	// ─── Кнопки ───────────────────────────────────────────────────────────
	for (const open of text.matchAll(/<button\b/g)) {
		const gt = text.indexOf('>', open.index);
		const close = text.indexOf('</button>', gt);
		if (gt === -1 || close === -1) continue;

		const attrs = text.slice(open.index, gt);
		const body = text.slice(gt + 1, close);
		if (NAMED_BY_ATTR.test(attrs) || visibleText(body).length > 0) continue;

		buttonsWithoutName.push({ where: `${file}:${lineOf(text, open.index)}`, what: 'кнопка' });
	}

	// ─── Поля ─────────────────────────────────────────────────────────────

	/*
	 * Значення `for` беруться як НАПИСАНО: і `for="remote-volume"`, і
	 * `for={id}`. Порівнювати їх із `id` поля можна саме в такому вигляді —
	 * розв'язувати вираз ніхто не просить, а збіг тексту тут означає рівно те,
	 * що треба: обидві сторони посилаються на одне й те саме.
	 */
	const labelFor = new Set(
		[...text.matchAll(/<label[^>]*\bfor=(?:"([^"]+)"|\{([^}]+)\})/g)].map((m) =>
			(m[1] ?? m[2]).trim()
		)
	);

	for (const open of text.matchAll(/<(input|textarea|select)\b/g)) {
		const gt = text.indexOf('>', open.index);
		if (gt === -1) continue;
		const attrs = text.slice(open.index, gt);

		// Приховане поле не має інтерфейсу, тож і читати його нікому.
		if (/type="hidden"/.test(attrs)) continue;
		if (NAMED_BY_ATTR.test(attrs)) continue;

		// `<label>`, що вказує через `for` — або `id="x"`, або скорочення `{id}`.
		const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? /\{(\w+)\}/.exec(attrs)?.[1];
		if (id && (labelFor.has(id) || labelFor.has(`${id}`))) continue;

		// `<label>`, що ОБГОРТАЄ поле: останній відкритий тег перед ним не
		// закритий. Саме так записані перемикачі й пара «повзунок + підпис».
		const before = text.slice(0, open.index);
		const lastOpen = before.lastIndexOf('<label');
		const lastClose = before.lastIndexOf('</label>');
		if (lastOpen > lastClose) continue;

		fieldsWithoutName.push({
			where: `${file}:${lineOf(text, open.index)}`,
			what: /type="(\w+)"/.exec(attrs)?.[1] ?? 'text'
		});
	}
}

describe('імена керування в розмітці (ACCESSIBILITY-v9 § 10.6)', () => {
	it('перевірка жива: компоненти й кнопки знайдено', () => {
		expect(files.length, 'жодного .svelte — сканер шукає не там').toBeGreaterThan(20);
		const buttons = files
			.map((file) => [...readFileSync(file, 'utf8').matchAll(/<button\b/g)].length)
			.reduce((sum, count) => sum + count, 0);
		expect(buttons, 'жодної кнопки — розбір розмітки зламався').toBeGreaterThan(40);
	});

	it('кнопка-іконка має імʼя', () => {
		const list = buttonsWithoutName.map((f) => `${f.where} — ${f.what}`);
		expect(list, `для читалки це просто «кнопка»:\n${list.join('\n')}`).toEqual([]);
	});

	it('поле має імʼя', () => {
		const list = fieldsWithoutName.map((f) => `${f.where} — <input type="${f.what}">`);
		expect(
			list,
			`поле без підпису: читалка озвучить лише тип елемента:\n${list.join('\n')}`
		).toEqual([]);
	});
});
