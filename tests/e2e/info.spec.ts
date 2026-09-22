import { expect, test, type Page } from '@playwright/test';
import { ACROSS, PASSWORD } from './board';

/**
 * ПУЛЬТ ОДИН, ПАНЕЛЕЙ СТІЛЬКИ, СКІЛЬКИ ЛЮДЕЙ.
 *
 * Сітка в усіх панелях на таблі та сама — це не різні пульти, а різні ЕКРАНИ
 * одного. Копія існує заради єдиного: видно, ЧИЄ натискання світиться. Двоє
 * помічників тиснуть ту саму кнопку, і за звуковим пультом це дві різні події.
 *
 * Перевірити це можна лише браузером і лише в трьох контекстах одразу: табло й
 * двоє помічників. Ні юніт, ні жоден статичний гейт не бачать ні присутності,
 * ні того, у якій саме панелі спалахнула кнопка.
 */

/** Створити інфодошку справжнім таблом і повернути її ідентифікатор. */
async function createInfoBoard(board: Page): Promise<string> {
	await board.goto('./create?kind=info');
	await expect(board.getByTestId('board-id')).toBeVisible();

	const id = (await board.getByTestId('board-id').innerText()).trim();
	await board.getByTestId('board-name').fill('Проба');
	await board.getByTestId('board-password').fill(PASSWORD);
	await board.getByTestId('create-submit').click();

	await expect(board.getByTestId('info-screen-section')).toBeVisible(ACROSS);
	return id;
}

/** Підключити помічника, назвавшись. Підпис їде присутністю, тож він тут потрібен. */
async function joinAsHelper(helper: Page, id: string, name: string): Promise<void> {
	await helper.goto('./settings');
	await helper.getByTestId('settings-name-input').fill(name);
	await helper.getByTestId('settings-save').click();

	await helper.goto('./connect?kind=info');
	await helper.getByTestId('connect-id').fill(id);
	await helper.locator('input[type="password"]').fill(PASSWORD);
	await helper.getByTestId('connect-submit').click();
	await expect(helper, 'помічник не зайшов на дошку').toHaveURL(/\/info-remote/, ACROSS);
}

test('другий помічник — друга панель, і натискання світиться у СВОЇЙ', async ({ browser }) => {
	const desk = await browser.newContext();
	const first = await browser.newContext();
	const second = await browser.newContext();

	const board = await desk.newPage();
	const olya = await first.newPage();
	const ada = await second.newPage();

	const id = await createInfoBoard(board);

	/*
	 * Панель порожня, тож спершу складаємо типову. Вхід у складальник на
	 * порожній дошці — окрема кнопка посеред картки, а не та, що в керуванні
	 * екраном: на порожньому екрані та стоїть без предмета.
	 */
	await board.getByTestId('info-start-edit-btn').click();
	await board.getByTestId('info-fill-btn').click();
	await board.getByTestId('info-edit-btn').click();
	await expect(board.getByTestId('info-wall-list')).toBeVisible(ACROSS);

	await joinAsHelper(olya, id, 'Оля');
	const panels = board.getByTestId('info-wall-list').locator('> section');
	await expect(panels, 'перший помічник не дав панелі').toHaveCount(1, ACROSS);
	// Саме ЗАГОЛОВОК панелі: те саме імʼя стоїть ще й міткою в журналі, і
	// шукати його текстом означало б знайти обидва.
	await expect(panels.getByRole('heading', { name: 'Оля' })).toBeVisible(ACROSS);

	await joinAsHelper(ada, id, 'Ада');
	await expect(panels, 'другий помічник не дав другої панелі').toHaveCount(2, ACROSS);

	/*
	 * ГОЛОВНЕ МІСЦЕ ОПИСУ. Тисне ОДИН, а панелей дві — підсвітка мусить бути
	 * рівно в одній. Спільна підсвітка (як було доти) засвітила б обидві, і
	 * друга панель не була б варта місця на екрані.
	 */
	const cell = ada.locator('[data-testid^="panel-press-"]').first();
	await expect(cell).toBeVisible(ACROSS);
	await cell.click();

	await expect(panels.locator('.cell--recent'), 'засвітилося не в одній панелі').toHaveCount(
		1,
		ACROSS
	);
	await expect(
		panels.nth(1).locator('.cell--recent'),
		'засвітилося в панелі не того помічника'
	).toHaveCount(1);

	/*
	 * ПАНЕЛЬ НЕ ЗНИКАЄ ВІД ВІДКЛЮЧЕННЯ ОДРАЗУ: присутність зникає й від блимання
	 * Wi-Fi, а панель, що зникла, зсуває сусідні — на сітці, яку тиснуть
	 * наосліп. Тому місце спершу тьмяніє й лише потім звільняється.
	 */
	await first.close();
	await expect(panels, 'місце звільнилося одразу, без витримки').toHaveCount(2, {
		timeout: 5_000
	});

	await desk.close();
	await second.close();
});

test('відповідь дається із заголовка журналу й долітає в зал', async ({ browser }) => {
	/*
	 * Кнопки відповіді доти стояли всередині рядка журналу й на вузькому екрані
	 * налазили на його ж текст. Тепер вони в заголовку — значками, а підпис у
	 * `title`. Опис перевіряє не розкладку, а те, заради чого вони існують:
	 * відповідь мусить долетіти до того, хто просив.
	 */
	const desk = await browser.newContext();
	const hall = await browser.newContext();
	const board = await desk.newPage();
	const helper = await hall.newPage();

	const id = await createInfoBoard(board);
	await board.getByTestId('info-start-edit-btn').click();
	await board.getByTestId('info-fill-btn').click();
	await board.getByTestId('info-edit-btn').click();

	await joinAsHelper(helper, id, 'Оля');
	await expect(board.getByTestId('info-wall-list')).toBeVisible(ACROSS);

	// Доки нема про що питати, відповідати теж нема на що.
	await expect(board.getByTestId('panel-verdict-done-btn')).toBeDisabled();

	await helper.locator('[data-testid^="panel-press-"]').first().click();
	await expect(board.getByTestId('panel-verdict-done-btn')).toBeEnabled(ACROSS);
	await board.getByTestId('panel-verdict-done-btn').click();

	await expect(helper.getByTestId('info-verdict-text'), 'відповідь не долетіла в зал').toBeVisible(
		ACROSS
	);

	// Відповідь заразом гасить верхній рядок: удруге питати нема про що.
	await expect(board.getByTestId('panel-verdict-done-btn')).toBeDisabled();

	await desk.close();
	await hall.close();
});
