import { expect, test, type Page } from '@playwright/test';
import { RENDERED, ROUTES, WALK } from './pages';

/**
 * ОДИН ЛОКАТОР — ОДИН ЕЛЕМЕНТ НА ЗІБРАНІЙ СТОРІНЦІ (`GATE-TESTID-RUNTIME`).
 *
 * ## Чим це відрізняється від `src/testid.test.ts`
 *
 * Той гейт читає ДЖЕРЕЛА й ловить дублікат у межах одного файлу. Але сторінка
 * складається з багатьох компонентів, і кожен із них сам по собі бездоганний:
 * дублікат виникає рівно там, де два з них опиняються поруч — або де один
 * компонент намальований двічі (широка розкладка й вузька, вікно й картка).
 * У джерелах цього не видно ніде.
 *
 * ## Чому це не причепка
 *
 * Playwright у strict mode на другому збігу не бере перший, а ПАДАЄ. Тобто
 * дублікат — це не «трохи неточно», а опис, який більше не можна написати;
 * лікують його зазвичай `.first()`, і з цієї миті перевірка мовчки дивиться
 * на той з двох елементів, який трапився раніше в DOM.
 *
 * ## Чому разом із рахунком іде перелік
 *
 * Число саме по собі не лікується. Тому повідомлення називає локатор і
 * скільки його на сторінці — далі видно, який із двох компонентів зайвий.
 */

// Межа часу опису — на весь обхід сторінок; чому саме так, сказано в `pages.ts`.
test.describe.configure({ timeout: WALK });

/** Локатори, яких на сторінці більше одного, — з їхньою кількістю. */
async function duplicates(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const seen = new Map<string, number>();
		for (const element of document.querySelectorAll<HTMLElement>('[data-testid]')) {
			const id = element.dataset.testid ?? '';
			seen.set(id, (seen.get(id) ?? 0) + 1);
		}
		return [...seen]
			.filter(([, count]) => count > 1)
			.map(([id, count]) => `${id} ×${count}`)
			.sort();
	});
}

test('на жодній сторінці немає двох однакових локаторів', async ({ page }) => {
	const problems: string[] = [];
	let counted = 0;

	for (const path of ROUTES) {
		await page.goto(path);
		await expect(page.locator('main')).toBeVisible(RENDERED);

		counted += await page.evaluate(() => document.querySelectorAll('[data-testid]').length);
		problems.push(...(await duplicates(page)).map((entry) => `${path}: ${entry}`));
	}

	/*
	 * Без цього опис лишався б зеленим і тоді, коли локаторів на сторінках
	 * немає зовсім, — тобто коли перевіряти вже нічого.
	 */
	expect(counted, 'жодного data-testid не знайдено — перевірка мертва').toBeGreaterThan(20);

	expect(problems, `локатор указує на кілька елементів:\n${problems.join('\n')}`).toEqual([]);
});

test('у відкритому вікні теж по одному', async ({ page }) => {
	/*
	 * Вікно — найімовірніше місце дубліката: воно показує ті самі органи, що й
	 * сторінка під ним, а сторінка при цьому нікуди не дівається. І в стані
	 * «одразу після goto()» його немає.
	 */
	await page.goto('./menu');
	await page.getByTestId('go-settings').first().click();
	await expect(page.getByTestId('settings-modal')).toBeVisible();

	const problems = await duplicates(page);
	expect(problems, `у вікні локатор указує на кілька елементів:\n${problems.join('\n')}`).toEqual(
		[]
	);
});
