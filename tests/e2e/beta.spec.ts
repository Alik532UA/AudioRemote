import { expect, test, type Page } from '@playwright/test';
import { ALL_CHECKS, BETA_TABS } from '../../src/lib/beta/checks';
import { RENDERED } from './pages';

/**
 * САМА СТОРІНКА ЧЕКЛИСТА (BETA-CHECKLIST-v9 § 5.7).
 *
 * Інваріанти дивляться на ДАНІ: чи має вкладка сторінку, чи існує названий
 * тест, чи назвали локатор. Між ними й людиною є діра розміром зі сторінку —
 * чи взагалі працює те, заради чого все це написано. Інструмент перевірки,
 * якого ніхто не перевіряє, — найгірший вид зеленого прогону: людина витрачає
 * вечір, а позначки не збереглися.
 *
 * Чотири сценарії, і кожен закриває крок, на якому робота тестувальника
 * зникає МОВЧКИ.
 */

const PAGE = './beta-test-checklists';
/** Локатори виводяться з даних, а не вписані: перейменований пункт валить набір. */
const tid = (id: string) => id.split('_').join('-');
const [firstTab, secondTab] = BETA_TABS;
const firstCheck = firstTab.checks[0];

const progress = (page: Page) => page.getByTestId('beta-progress-value');

test('позначка переживає перезавантаження', async ({ page }) => {
	await page.goto(PAGE);
	const vote = page.getByTestId(`beta-vote-${tid(firstCheck.id)}-ok-btn`);
	await expect(vote).toBeVisible(RENDERED);

	await vote.click();
	await expect(vote).toHaveAttribute('aria-pressed', 'true');

	await page.reload();
	await expect(
		page.getByTestId(`beta-vote-${tid(firstCheck.id)}-ok-btn`),
		'вечір роботи зник при перезавантаженні'
	).toHaveAttribute('aria-pressed', 'true', RENDERED);
});

test('поступ росте на один, а повторне натискання його знімає', async ({ page }) => {
	await page.goto(PAGE);
	const vote = page.getByTestId(`beta-vote-${tid(firstCheck.id)}-ok-btn`);
	await expect(vote).toBeVisible(RENDERED);

	const total = ALL_CHECKS.length;
	await expect(progress(page)).toContainText(`0/${total}`);

	await vote.click();
	await expect(progress(page)).toContainText(`1/${total}`);

	// Повторне натискання того самого стану — це «я помилився», а не «ще раз».
	await vote.click();
	await expect(progress(page), 'повторне натискання не зняло позначку').toContainText(`0/${total}`);
});

test('перемикання вкладки міняє перелік і не губить позначене', async ({ page }) => {
	await page.goto(PAGE);
	const vote = page.getByTestId(`beta-vote-${tid(firstCheck.id)}-ok-btn`);
	await expect(vote).toBeVisible(RENDERED);
	await vote.click();

	await page.getByTestId(`beta-tab-${secondTab.id}-btn`).click();
	await expect(page.getByTestId(`beta-check-${tid(firstCheck.id)}-item`)).toHaveCount(0);
	await expect(page.getByTestId(`beta-check-${tid(secondTab.checks[0].id)}-item`)).toBeVisible();

	// Поступ вкладки, з якої пішли, мусить лишитися при ній.
	await expect(page.getByTestId(`beta-tab-${firstTab.id}-progress-text`)).toContainText(
		`1/${firstTab.checks.length}`
	);

	await page.getByTestId(`beta-tab-${firstTab.id}-btn`).click();
	await expect(vote).toHaveAttribute('aria-pressed', 'true');
});

test('відмова буфера обміну не зʼїдає звіт', async ({ page }) => {
	/*
	 * Буфер відмовляє буденно — вкладка не у фокусі, немає дозволу, не https, —
	 * і перша версія такої сторінки в цьому разі лише писала в лог: кнопка
	 * виглядала натиснутою, а звіту не було НІДЕ. Тобто вся робота зникала на
	 * останньому кроці.
	 *
	 * Тут відмова підставлена навмисно: у headless буфер однаково недоступний, і
	 * перевіряти треба саме запасний шлях.
	 */
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new Error('заборонено')) },
			configurable: true
		});
	});
	await page.goto(PAGE);

	const vote = page.getByTestId(`beta-vote-${tid(firstCheck.id)}-fail-btn`);
	await expect(vote).toBeVisible(RENDERED);
	await vote.click();
	await page.getByTestId('beta-report-btn').click();

	const report = page.getByTestId('beta-report-input');
	await expect(report, 'звіт зник разом із відмовою буфера').toBeVisible();
	await expect(report).toHaveValue(new RegExp(firstCheck.id));
	await expect(report, 'у звіті немає версії збірки').toHaveValue(/\d+\.\d+\.\d+/);
});

test('стирання позначок — у два кроки', async ({ page }) => {
	// Єдина незворотна дія сторінки, і стоїть вона поруч зі звітом, до якого
	// тягнуться щоразу: година роботи проти одного зайвого кліка.
	await page.goto(PAGE);
	const vote = page.getByTestId(`beta-vote-${tid(firstCheck.id)}-ok-btn`);
	await expect(vote).toBeVisible(RENDERED);
	await vote.click();

	const clear = page.getByTestId('beta-clear-btn');
	await clear.click();
	await expect(vote, 'перше натискання вже стерло').toHaveAttribute('aria-pressed', 'true');

	await clear.click();
	await expect(vote).toHaveAttribute('aria-pressed', 'false');
});
