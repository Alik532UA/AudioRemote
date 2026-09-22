import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import type { AxeResults, TagValue } from 'axe-core';
import { A11Y_BASELINE, A11Y_KNOWN, type A11yState } from './a11y-baseline';
import { PAGES, RENDERED, settled, WALK } from './pages';

/**
 * МАШИННО-ВИЯВНІ ПОРУШЕННЯ WCAG НАД ЗІБРАНИМ САЙТОМ
 * (ACCESSIBILITY-v9 § 10, `GATE-A11Y-AXE`).
 *
 * ## Що це додає до того, що вже є
 *
 * У проєкті вже стоять дві статичні перевірки доступності: `a11y-names.test.ts`
 * шукає кнопку-іконку без імені по джерелах, `contrast.test.ts` рахує контраст
 * токенів у обох темах. Обидві дивляться на ДЖЕРЕЛА й тому бачать лише те, що
 * в них названо поіменно.
 *
 * axe дивиться на ДЕРЕВО ДОСТУПНОСТІ живої сторінки й ловить інший клас: поле
 * без підпису, заголовки, що стрибають через рівень, `aria-*` на ролі, яка їх
 * не приймає, дубльований `id`, орієнтир без імені. Нічого з цього в джерелах
 * не видно взагалі — воно виникає зі складання розмітки.
 *
 * Перший же прогін це й довів: `.btn--danger` у темній темі давала 4.40 при
 * потрібних 4.5. Статичний гейт контрасту цього не бачив, бо тло кнопки —
 * напівпрозоре, а він умів лише суцільні кольори (виправлено там же).
 *
 * ## Межа методу, яку треба знати
 *
 * axe ловить приблизно третину проблем доступності. Порядок фокуса,
 * осмисленість підпису, логічність заголовків, працездатність пастки фокуса —
 * не бачить. ЗЕЛЕНИЙ axe НЕ ОЗНАЧАЄ, ЩО СТОРІНКА ДОСТУПНА; він означає, що
 * немає машинно-виявних порушень. Ручний прохід клавіатурою лишається
 * обов'язковим (§ 11).
 *
 * ## Чому обидві теми
 *
 * Контраст axe рахує по ЖИВИХ обчислених кольорах, тобто по тій темі, у якій
 * відкрито сторінку. Тем тут дві, і пара, що проходить в одній, у другій може
 * не проходити — саме так і було з кнопкою відмови. Світла тема типова, темну
 * доводиться просити окремо через сховище: інлайн-скрипт у `app.html` читає
 * його до першого кадру.
 *
 * ## Чому стани, а не тільки адреси
 *
 * `axe.run()` бачить те, що на екрані ЗАРАЗ. Модалки, відкриті меню й стани
 * помилок у вимір «одразу після `goto()`» не потрапляють ніколи (§ 10.2), тож
 * вікно налаштувань відкривається окремим описом.
 *
 * ## Чому ядро axe ВСТАВЛЯЄТЬСЯ В СТОРІНКУ, а не імпортується в node
 *
 * Обгортка `@axe-core/playwright` тягне саме ядро в процес воркера. Стояла
 * вона тут рівно один прогін: на типовій кількості воркерів V8 падав із
 * `Zone Allocation failed — process out of memory` ще до першої перевірки, і
 * забирав із собою СУСІДНІ описи, які axe не торкаються. Виглядає це як
 * зламаний набір, а не як брак пам'яті, — тобто найдорожчий різновид
 * червоного.
 *
 * Тут ядро лише ЧИТАЄТЬСЯ рядком (це дешево) і віддається сторінці через
 * `addInitScript`, тобто розбирає його той, хто для цього й зроблений, —
 * браузер. Заразом це знімає питання політики безпеки: `addInitScript` іде
 * каналом налагодження, а не тегом `<script>`, який CSP цього сайту
 * заблокував би.
 */

// Межа часу опису — на весь обхід сторінок; чому саме так, сказано в `pages.ts`.
test.describe.configure({ timeout: WALK });

const require = createRequire(import.meta.url);
/** Стиснуте ядро: воно вдесятеро менше за розгорнуте, а звіт той самий. */
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const TAGS: TagValue[] = ['wcag2a', 'wcag2aa', 'wcag22aa'];

declare global {
	interface Window {
		axe: typeof import('axe-core');
	}
}

/** Покласти ядро axe в кожен документ, який відкриє ця сторінка. */
async function armAxe(page: Page): Promise<void> {
	await page.addInitScript({ content: AXE_SOURCE });
}

/**
 * Прогнати axe й повернути претензії до стану — списком, а не падінням.
 *
 * Саме списком, бо описів тут по одному на тему: падіння на першій же сторінці
 * сховало б решту, і виправляти довелося б по одній за прогін.
 */
async function audit(page: Page, state: A11yState): Promise<string[]> {
	const results: AxeResults = await page.evaluate(
		(tags) => window.axe.run(document, { runOnly: tags }),
		TAGS
	);
	const found = results.violations;

	const detail = found
		.map(
			(violation) =>
				`      ${violation.id} (${violation.impact}) ×${violation.nodes.length}: ` +
				violation.nodes.map((node) => node.target.join(' ')).join(' | ')
		)
		.join('\n');

	const problems: string[] = [];

	/*
	 * ТИПИ ЗВІРЯЮТЬСЯ НА РІВНІСТЬ, і окремо від кількості. Поява нового `id` у
	 * межах ліміту означала б, що одне порушення виправили, а інше приїхало на
	 * його місце — і число про це не сказало б нічого.
	 */
	const ids = [...new Set(found.map((violation) => violation.id))].sort();
	const known = [...A11Y_KNOWN[state]];
	if (ids.join(',') !== known.join(',')) {
		problems.push(`${state}: типи порушень [${ids}] замість [${known}]\n${detail}`);
	}

	if (found.length > A11Y_BASELINE[state]) {
		problems.push(
			`${state}: ${found.length} порушень проти бази ${A11Y_BASELINE[state]}\n${detail}`
		);
	}

	/*
	 * БАЗА, ЯКА ВІДСТАЛА ВІД КОДУ, — ТАКА САМА ПРОБЛЕМА, ЯК ЗАВИЩЕНА. Вона
	 * мовчки тримає місце під наступне порушення, і воно проходить як «у межах
	 * ліміту». Тому опис просить опустити число тим самим комітом, що його
	 * заслужив.
	 */
	if (found.length < A11Y_BASELINE[state]) {
		problems.push(
			`${state}: порушень уже ${found.length} проти бази ${A11Y_BASELINE[state]} — опустити число в a11y-baseline.ts`
		);
	}

	return problems;
}

/** Попросити темну тему до першого кадру — так само, як це робить людина. */
async function preferDark(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('audioremote_theme', 'dark');
		} catch {
			/* приватний режим — опис однаково побачить те, що намальовано */
		}
	});
}

test('світла тема: жодна сторінка не має машинно-виявних порушень', async ({ page }) => {
	await armAxe(page);

	const problems: string[] = [];
	for (const [state, path] of Object.entries(PAGES)) {
		await page.goto(path);
		/*
		 * НЕ «`main` зʼявився», А «РОЗКЛАДКА СТАЛА». Стилі маршруту приїжджають
		 * окремим файлом, і поки він у дорозі, розмітка вже є, а кольори ще
		 * типові — axe тоді бачить контраст, якого на екрані не буває жодної
		 * миті. Заміряно: приблизно один повний прогін із трьох червонів на
		 * `settings` двома кнопками мови, а окремо ця ж перевірка зелена щоразу.
		 */
		await settled(page);
		problems.push(...(await audit(page, state as A11yState)));
	}
	expect(problems, `axe у світлій темі:\n${problems.join('\n')}`).toEqual([]);
});

test('темна тема: жодна сторінка не має машинно-виявних порушень', async ({ page }) => {
	await preferDark(page);
	await armAxe(page);

	const problems: string[] = [];
	for (const [state, path] of Object.entries(PAGES)) {
		await page.goto(path);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', RENDERED);
		problems.push(...(await audit(page, state as A11yState)));
	}
	expect(problems, `axe у темній темі:\n${problems.join('\n')}`).toEqual([]);
});

test('відкрите вікно налаштувань теж міряється', async ({ page }) => {
	/*
	 * Вікно — найімовірніше місце порушення й найменш імовірне місце, де його
	 * помітять: у стані «одразу після `goto()`» його немає, а відкривають його
	 * рідше, ніж дивляться на сторінку.
	 *
	 * Темна тема тут навмисно: саме в ній стояла кнопка відмови, і живе вона
	 * саме в цьому вікні.
	 */
	await preferDark(page);
	await armAxe(page);
	await page.goto('./menu');
	await page.getByTestId('go-settings').first().click();
	await expect(page.getByTestId('settings-modal')).toBeVisible(RENDERED);

	const problems = await audit(page, 'settingsModal');
	expect(problems, `axe у відкритому вікні:\n${problems.join('\n')}`).toEqual([]);
});
