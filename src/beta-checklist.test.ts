// @vitest-environment node
// Перевірка читає дані й джерела — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { walk, read } from './gates/fs';
import {
	ALL_CHECKS,
	BETA_TABS,
	BETA_UNCOVERED_ROUTES,
	LEVELS,
	tidOf,
	type BetaCheck
} from '$lib/beta/checks';
import { builtinFor } from '$lib/hotkeys/hotkeys';

/**
 * ЧЕКЛИСТ, ЯКИЙ НЕ ВМІЄ ЗБРЕХАТИ (BETA-CHECKLIST-v9 § 5).
 *
 * Найдорожча пастка чеклистів — не помилка в пункті, а ВІДСТАВАННЯ: код
 * змінився, пункт лишився, і людина ставить «перевірено» на тому, чого вже
 * немає. Правило в документі помічає це тоді, коли документ хтось перечитає;
 * інваріант — на кожному прогоні.
 *
 * Тут перевіряється рівно те, що можна перевірити машиною: сторінка має
 * вкладку, «натисніть» має ціль, `covered` має файл тесту, який існує. Чи
 * ПРАВДА написана в пункті — не перевіряє ніхто, і саме тому пункти пишуться
 * після читання коду.
 */

/** Сторінки на диску: `src/routes/menu/+page.svelte` → `/menu`, корінь → `/`. */
function routesOnDisk(): string[] {
	const out: string[] = [];
	const visit = (dir: string, path: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) visit(`${dir}/${entry.name}`, `${path}/${entry.name}`);
			else if (entry.name === '+page.svelte') out.push(path === '' ? '/' : path);
		}
	};
	visit('src/routes', '');
	return out.sort();
}

/**
 * Наказовий спосіб, а не корінь слова.
 *
 * Пункти пишуться наказом («Натисніть…»), а інфінітив трапляється в описі
 * наслідку — «на телефоні їх нема чим натиснути». Груба форма `/натисн/`
 * вимагала б локатора й там, тобто змушувала б переписувати ПРАВИЛЬНИЙ текст
 * заради перевірки; а перевірка, яка бореться з мовою, закінчується вимкненням.
 */
const CLICK = /натисніть/i;
const CYRILLIC = /[Ѐ-ӿ]/;
/** Апостроф проєкту — модифікатор U+02BC. Два різні ламають пошук по чеклисту. */
const APOSTROPHE = 'ʼ';
const OTHER_APOSTROPHES = /['’`´]/;

/**
 * Локатори так, як їх збирає БРАУЗЕР, а не як вони лежать у файлі.
 *
 * Дві речі, без яких перевірка бракує ПРАВИЛЬНІ назви — а закінчується це її
 * вимкненням, не правкою:
 *
 * 1. Динамічна частина стає підстановкою. Інакше `theme-system` вважався б
 *    вигаданим: у джерелі стоїть `data-testid="theme-{option.value ?? 'system'}"`,
 *    і рядка `theme-system` немає ніде.
 * 2. Локатор буває СКЛАДЕНИЙ ІЗ ДВОХ ФАЙЛІВ: `<Blocker testid="info-offline-hint" />`
 *    в одному, `data-testid={testid}` в іншому — і знову жодного файлу з
 *    готовим рядком. Тому імена, віддані компонентам пропом `testid`, беруться
 *    як окремі локатори — але лише тоді, коли бодай один компонент справді
 *    ставить атрибут голим виразом. Інакше перевірка приймала б вигадані назви
 *    просто за те, що вони десь згадані.
 */
function locatorPatterns(): RegExp[] {
	const files = walk('src')
		.filter((file) => file.endsWith('.svelte'))
		.map(read);

	const written = files.flatMap((text) =>
		[...text.matchAll(/data-testid=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
			(match) => match[1] ?? match[2]
		)
	);

	const passesBare = files.some((text) => /data-testid=\{\s*[A-Za-z_$][\w$]*\s*\}/.test(text));
	const given = passesBare
		? files.flatMap((text) => [...text.matchAll(/\btestid="([^"{}]+)"/g)].map((match) => match[1]))
		: [];

	return [...written, ...given].map(
		(name) =>
			new RegExp(
				`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]*\\?\}?/g, '.+')}$`
			)
	);
}

/** Чи знає застосунок таку клавішу вбудованою дією. */
const handlesKey = (code: string): boolean =>
	builtinFor({
		code,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		repeat: false,
		target: null
	} as unknown as KeyboardEvent) !== null;

const named = (checks: BetaCheck[], why: (check: BetaCheck) => string) =>
	checks.map((check) => `${check.id}: ${why(check)}`);

describe('чеклист бета-тесту (BETA-CHECKLIST-v9 § 5)', () => {
	it('перевірка жива: вкладки й пункти прочитано', () => {
		expect(BETA_TABS.length, 'вкладок немає — далі все зелене дарма').toBeGreaterThan(3);
		expect(ALL_CHECKS.length, 'пунктів немає').toBeGreaterThan(30);
	});

	it('перевірка жива: сторінки на диску знайдено', () => {
		const routes = routesOnDisk();
		expect(routes, 'сканер не бачить маршрутів').toContain('/player');
		expect(routes, 'сторінки чеклиста немає на диску').toContain('/beta-test-checklists');
	});

	it('кожна сторінка заявлена рівно однією вкладкою (§ 5.1)', () => {
		const claimed = new Map<string, string[]>();
		for (const tab of BETA_TABS) {
			for (const route of tab.routes) claimed.set(route, [...(claimed.get(route) ?? []), tab.id]);
		}

		const uncovered = routesOnDisk().filter(
			(route) => !claimed.has(route) && !BETA_UNCOVERED_ROUTES.includes(route)
		);
		expect(uncovered, 'сторінка є, а перевіряти її нічим').toEqual([]);

		const twice = [...claimed].filter(([, tabs]) => tabs.length > 1).map(([route]) => route);
		expect(twice, 'сторінку заявили дві вкладки — пункти розповзуться').toEqual([]);

		const ghost = [...claimed.keys()].filter((route) => !routesOnDisk().includes(route));
		expect(ghost, 'вкладка накриває сторінку, якої немає').toEqual([]);

		const staleSkip = BETA_UNCOVERED_ROUTES.filter((route) => !routesOnDisk().includes(route));
		expect(staleSkip, 'виняток пережив свою сторінку').toEqual([]);
	});

	it('covered називає файл тесту, і файл існує (§ 5.2)', () => {
		const covered = ALL_CHECKS.filter((check) => check.coverage === 'covered');
		const nameless = named(
			covered.filter((check) => !check.test),
			() => 'сказано «покрито», а чим — ні'
		);
		expect(nameless, 'твердження про покриття гниє швидше за сам чеклист').toEqual([]);

		const missing = named(
			covered.filter((check) => check.test && !existsSync(check.test)),
			(check) => `${check.test} — такого файлу немає`
		);
		expect(missing).toEqual([]);

		const extra = named(
			ALL_CHECKS.filter((check) => check.coverage !== 'covered' && check.test),
			(check) => `рівень ${check.coverage}, а тест названий — одне з двох неправда`
		);
		expect(extra).toEqual([]);
	});

	it('пункт, що просить натиснути, називає локатор або клавішу (§ 5.3)', () => {
		const naked = named(
			ALL_CHECKS.filter((check) => CLICK.test(check.text.uk) && !check.testid && !check.key),
			() => 'неперевірний за побудовою'
		);
		expect(naked).toEqual([]);

		const both = named(
			ALL_CHECKS.filter((check) => check.testid && check.key),
			() => 'і локатор, і клавіша — незрозуміло, що саме тиснуть'
		);
		expect(both).toEqual([]);
	});

	it('названий локатор справді є в розмітці (§ 5.3)', () => {
		const patterns = locatorPatterns();
		expect(patterns.length, 'локаторів не знайдено — перевірка дивиться не туди').toBeGreaterThan(
			100
		);

		const invented = named(
			ALL_CHECKS.filter(
				(check) => check.testid && !patterns.some((pattern) => pattern.test(check.testid as string))
			),
			(check) => `${check.testid} — такого елемента в розмітці немає`
		);
		expect(invented, 'пункт посилається на те, чого немає').toEqual([]);
	});

	it('названу клавішу застосунок справді обробляє (§ 5.3)', () => {
		const unknown = named(
			ALL_CHECKS.filter((check) => check.key && !handlesKey(check.key)),
			(check) => `${check.key} — вбудованої дії на цю клавішу немає`
		);
		expect(unknown).toEqual([]);
	});

	it('id унікальні, форми {вкладка}_{номер}, і локатор із них виходить чистий (§ 2.2)', () => {
		const ids = ALL_CHECKS.map((check) => check.id);
		expect(ids.length - new Set(ids).size, 'два пункти з одним id — прогрес переплутається').toBe(
			0
		);

		for (const tab of BETA_TABS) {
			const wrong = tab.checks
				.filter((check) => !new RegExp(`^${tab.id}_\\d+$`).test(check.id))
				.map((check) => check.id);
			expect(wrong, `вкладка ${tab.id}: id не своєї форми`).toEqual([]);
		}

		// Підкреслення в локаторах заборонені конвенцією проєкту.
		const dirty = ids.filter((id) => tidOf(id).includes('_'));
		expect(dirty, 'локатор із такого id конвенції не пройде').toEqual([]);
	});

	it('тексти непорожні двома мовами, і мови не переплутані (§ 5.4)', () => {
		const empty = named(
			ALL_CHECKS.filter(
				(check) =>
					!check.text.uk.trim() ||
					!check.text.en.trim() ||
					!check.category.uk.trim() ||
					!check.category.en.trim()
			),
			() => 'порожній текст або категорія'
		);
		expect(empty).toEqual([]);

		// Забутий переклад тип не бачить: англійський рядок із кирилицею — це
		// скопійований український, а не переклад.
		const notTranslated = named(
			ALL_CHECKS.filter(
				(check) => CYRILLIC.test(check.text.en) || CYRILLIC.test(check.category.en)
			),
			() => 'в англійському тексті кирилиця'
		);
		expect(notTranslated).toEqual([]);

		const notUkrainian = named(
			ALL_CHECKS.filter((check) => !CYRILLIC.test(check.text.uk)),
			() => 'в українському тексті немає кирилиці'
		);
		expect(notUkrainian).toEqual([]);
	});

	it('в українському тексті один вид апострофа (§ 5.4)', () => {
		/*
		 * Два різні апострофи ламають пошук по чеклисту — а шукати в ньому
		 * доводиться щоразу, коли зі звіту треба знайти пункт за словом.
		 */
		const mixed = named(
			ALL_CHECKS.filter(
				(check) =>
					OTHER_APOSTROPHES.test(check.text.uk) || OTHER_APOSTROPHES.test(check.category.uk)
			),
			() => `не той апостроф — у чеклисті вживається лише «${APOSTROPHE}»`
		);
		expect(mixed).toEqual([]);
	});

	it('текст не починається з номера й не називає внутрішнього (§ 2.1)', () => {
		const numbered = named(
			ALL_CHECKS.filter((check) => /^\s*\d/.test(check.text.uk) || /^\s*\d/.test(check.text.en)),
			() => 'номер малює сторінка з позиції, а не текст'
		);
		expect(numbered).toEqual([]);

		// Людина, яка згодилася потикати застосунок, не знає, що таке локатор.
		const internal = named(
			ALL_CHECKS.filter((check) =>
				/data-testid|\$state|\.ts\b|localStorage|RTDB/i.test(check.text.uk)
			),
			() => 'внутрішня назва в тексті для людини'
		);
		expect(internal).toEqual([]);
	});

	it('у кожній вкладці є робота для людини і є межа (§ 2.3, § 5.4)', () => {
		for (const tab of BETA_TABS) {
			const manual = tab.checks.filter((check) => check.coverage === 'manual');
			expect(
				manual.length,
				`вкладка ${tab.id}: усе покрито машиною — час людини марнується`
			).toBeGreaterThan(0);

			const edges = tab.checks.filter((check) => check.negative);
			expect(edges.length, `вкладка ${tab.id}: немає пункта «не мусить»`).toBeGreaterThan(0);
		}
	});

	it('у вкладці covered не переважає manual (§ 3.4)', () => {
		for (const tab of BETA_TABS) {
			const count = (level: BetaCheck['coverage']) =>
				tab.checks.filter((check) => check.coverage === level).length;
			expect(
				count('covered'),
				`вкладка ${tab.id}: контрольна група більша за роботу`
			).toBeLessThanOrEqual(count('manual'));
		}
	});

	it('рівень пункта — один із трьох, і порядок показу сталий (§ 3)', () => {
		const wrong = ALL_CHECKS.filter((check) => !LEVELS.includes(check.coverage)).map(
			(check) => check.id
		);
		expect(wrong).toEqual([]);
		expect([...LEVELS], 'людина витрачається спершу там, де машини немає').toEqual([
			'manual',
			'testable',
			'covered'
		]);
	});

	it('версія позначки береться з єдиного джерела, а не вписана (§ 8.5)', () => {
		const report = read('src/lib/beta/report.ts');
		expect(report, 'версія мусить приходити від збірки').toContain('__APP_VERSION__');
		expect(/VERSION\s*[:=]\s*['"]\d/.test(report), 'версія вписана літералом').toBe(false);
	});

	it('сторінки чеклиста немає в жодному меню (§ 4)', () => {
		/*
		 * Її дають посиланням тому, хто згодився допомогти. Посилання з меню
		 * зробило б із неї розділ застосунку — і привело б туди тих, хто прийшов
		 * запускати музику.
		 */
		const linked = walk('src')
			.filter((file) => file.endsWith('.svelte') && !file.includes('beta-test-checklists'))
			.filter((file) => read(file).includes('beta-test-checklists'));
		expect(linked, 'на службову сторінку веде посилання').toEqual([]);
	});
});
