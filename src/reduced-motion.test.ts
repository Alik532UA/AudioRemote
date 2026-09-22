// @vitest-environment node
// Перевірка лише читає файли — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { at, cssSources, type CssSource } from './gates/css';

/**
 * РУХ, ЯКОГО НЕ ПРОСИЛИ (UI-UX-v9 § 4, ACCESSIBILITY-v9 § 6).
 *
 * `prefers-reduced-motion: reduce` вмикають не через смак. Вестибулярні
 * розлади, мігрень із аурою, вестибулярна мігрень, синдром постійного
 * запаморочення — у всіх цих випадках рух на екрані дає симптом, а не
 * незручність. Система вже переказала цю просьбу браузеру; лишається її не
 * проігнорувати.
 *
 * ## Чому це не видно жодному іншому гейту
 *
 * Анімація без парного блоку — бездоганний CSS. `svelte-check` її не бачить,
 * `lint` не бачить, axe не бачить у принципі: він міряє сторінку в тому
 * режимі, у якому її відкрили, а прогін відкриває її зі звичайними
 * налаштуваннями. Побачити це може лише людина, у якої цей прапорець
 * увімкнений, — тобто рівно та, якій від цього гірше.
 *
 * Знайдено саме так, як описано: у проєкті дванадцять файлів із
 * `transition`/`animation` мали парний блок, а чотири — ні, і жоден прогін про
 * це не сказав. Один із чотирьох був стрибок кружка в палітрі кольорів вікна
 * треку (прибраний окремим комітом разом із самою копією палітри).
 *
 * ## Правило: ПО СЕЛЕКТОРУ, а не по файлу
 *
 * Спокуслива форма «у файлі є `@media (prefers-reduced-motion: reduce)`»
 * здається достатньою й не є нею: `base.css` має два таких блоки — для кнопок
 * і для кнопки закриття, — і рівно тому ніхто не помітив, що поле вводу
 * (`.input`) не вкрите жодним із них. Перевірка по файлу зеленіла б над цим
 * файлом вічно.
 *
 * Тому: кожен селектор, який оголошує `transition` чи `animation` ПОЗА блоком
 * зменшеного руху, мусить дослівно зустрітися серед селекторів якогось блоку
 * зменшеного руху В ТОМУ САМОМУ файлі. Дослівно — бо саме так це й пишуть:
 * блок-глушник повторює селектор і ставить `none`.
 *
 * ## Що свідомо НЕ перевіряється
 *
 * * чи справді глушник скидає потрібну властивість — він може ставити `none`
 *   лише `transition`, лишивши `animation`. Перевірка, що читала б значення,
 *   зажадала б розбирати каскад, а ціна помилки тут — хибне спрацювання, яке
 *   вимикає гейт (AI-AGENT-PITFALLS-v9 § 1.1);
 * * `transition: none` поза блоком — глушити нічого;
 * * порядок: глушник, що стоїть ВИЩЕ за оголошення, не спрацює через каскад.
 *   Усі чотири знайдені випадки були про відсутність, а не про порядок, тож
 *   правило, якого жоден дефект не підтвердив, лишається незаведеним.
 */

const sources = cssSources();

/** Селектори блоку зменшеного руху, розділені комою й нормалізовані. */
const parts = (selector: string): string[] =>
	selector
		.split(',')
		.map((one) => one.replace(/\s+/g, ' ').trim())
		.filter(Boolean);

const MOTION = /(?:transition|animation)\s*:\s*([^;}]*)/;
/** Найпростіший блок: селектор і тіло без вкладених фігурних дужок. */
const RULE = /([^{}@;]+)\{([^{}]*)\}/g;

/** Межі кожного `@media (prefers-reduced-motion: reduce)` у тексті. */
function quietRanges(css: string): [number, number][] {
	const ranges: [number, number][] = [];
	for (const media of css.matchAll(/@media[^{]*prefers-reduced-motion\s*:\s*reduce[^{]*\{/g)) {
		let depth = 1;
		let index = media.index + media[0].length;
		while (index < css.length && depth > 0) {
			if (css[index] === '{') depth++;
			else if (css[index] === '}') depth--;
			index++;
		}
		ranges.push([media.index + media[0].length, index - 1]);
	}
	return ranges;
}

interface Moving {
	/** Місце оголошення: `файл:рядок`. */
	where: string;
	selector: string;
}

/** Селектори з рухом і селектори, які його глушать, — окремо по кожному файлу. */
function census({ file, css }: CssSource): { moving: Moving[]; quiet: Set<string> } {
	const ranges = quietRanges(css);
	const inQuiet = (index: number) => ranges.some(([from, to]) => index >= from && index < to);

	const moving: Moving[] = [];
	const quiet = new Set<string>();

	for (const rule of css.matchAll(RULE)) {
		const declared = MOTION.exec(rule[2]);
		if (!declared) continue;

		if (inQuiet(rule.index)) {
			for (const one of parts(rule[1])) quiet.add(one);
			continue;
		}

		// `transition: none` поза блоком глушити нема чого.
		if (declared[1].trim() === 'none') continue;

		/*
		 * Місце рахується від САМОГО селектора, а не від початку збігу: перед
		 * ним лежить прогін пробілів аж до попередньої фігурної дужки, і в
		 * `.svelte` це весь зашитий пробілами скрипт — тобто звіт указував би на
		 * перший рядок файлу.
		 */
		const start = rule.index + rule[1].length - rule[1].trimStart().length;
		for (const one of parts(rule[1])) moving.push({ where: at(file, css, start), selector: one });
	}

	return { moving, quiet };
}

describe('рух, який можна вимкнути (UI-UX-v9 § 4)', () => {
	it('перевірка жива: рух у проєкті знайдено, і глушники теж', () => {
		const all = sources.map(census);
		const moving = all.reduce((sum, { moving: found }) => sum + found.length, 0);
		const quiet = all.reduce((sum, { quiet: found }) => sum + found.size, 0);

		expect(moving, 'жодного transition/animation — сканер шукає не там').toBeGreaterThan(15);
		expect(quiet, 'жодного блоку зменшеного руху — половина сканера мертва').toBeGreaterThan(10);
	});

	it('перевірка жива: неглушений селектор справді знаходиться', () => {
		/*
		 * Зворотний експеримент, вбудований у гейт. Без нього «порушень немає»
		 * означає або «їх немає», або «сканер розбирає CSS неправильно», і
		 * розрізнити ці два випадки в зеленому прогоні неможливо.
		 *
		 * Зразок навмисно повторює форму справжньої знахідки: у файлі Є блок
		 * зменшеного руху, але накриває він ІНШИЙ селектор — рівно те, на чому
		 * перевірка по файлу зеленіла б.
		 */
		const sample = [
			'.guarded { transition: opacity 1s; }',
			'.stray { transition: transform 1s; }',
			'@media (prefers-reduced-motion: reduce) { .guarded { transition: none; } }'
		].join('\n');

		const { moving, quiet } = census({ file: 'зразок.css', css: sample });
		expect(moving.map(({ selector }) => selector)).toEqual(['.guarded', '.stray']);
		expect([...quiet]).toEqual(['.guarded']);
	});

	it('кожен рух має парний блок зменшеного руху в тому самому файлі', () => {
		const naked = sources.flatMap((source) => {
			const { moving, quiet } = census(source);
			return moving
				.filter(({ selector }) => !quiet.has(selector))
				.map(({ where, selector }) => `${where}  ${selector}`);
		});

		expect(
			naked,
			`рух, який не вимикається при prefers-reduced-motion: reduce:\n${naked.join('\n')}`
		).toEqual([]);
	});
});
