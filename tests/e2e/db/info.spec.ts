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
	 * ДРУГА ПАНЕЛЬ ПОВНОЦІННА Й НА ЕКРАНІ, а не за горизонтальною прокруткою.
	 *
	 * Доти ряд панелей крутився вбік своєю власною смужкою: щоб побачити
	 * другого помічника, треба було знайти мишею саме її. Тепер зайва панель
	 * переходить рядком нижче, а сторінка росте вниз.
	 */
	const spread = await board.evaluate(() => {
		const row = document.querySelector('[data-testid="info-wall-list"]');
		if (!row) return null;

		const boxes = [...row.children].map((kid) => kid.getBoundingClientRect());
		return {
			widths: boxes.map((box) => Math.round(box.width)),
			spill: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});

	expect(spread?.spill, 'панелі поїхали вбік замість переносу').toBeLessThanOrEqual(0);
	expect(new Set(spread?.widths).size, `панелі різної ширини: ${spread?.widths}`).toBe(1);

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

test('на найгучнішому режимі прохання із зали фарбує тло табла', async ({ browser }) => {
	/*
	 * СПАЛАХ ПЕРЕВІРЯЄТЬСЯ ПІКСЕЛЕМ, А НЕ АТРИБУТОМ — і це головне тут.
	 *
	 * Він уже ламався двічі, і обидва рази однаково: атрибут стояв, інлайновий
	 * стиль стояв, перевірка над станом була б зелена — а колір вікна не
	 * мінявся, бо фарба лягала на елемент, якого на екрані не видно. Тому тут
	 * питається саме обчислене тло сторінки.
	 */
	const desk = await browser.newContext();
	const hall = await browser.newContext();
	const board = await desk.newPage();
	const helper = await hall.newPage();

	const id = await createInfoBoard(board);
	await board.getByTestId('info-start-edit-btn').click();
	await board.getByTestId('info-fill-btn').click();
	await board.getByTestId('info-edit-btn').click();

	// Найгучніший режим: тло на весь екран. Типовий — найтихіший, і він мовчить.
	await board.getByTestId('info-attention-page-radio').click();

	await joinAsHelper(helper, id, 'Оля');
	await expect(board.getByTestId('info-wall-list')).toBeVisible(ACROSS);

	const paint = () => board.evaluate(() => getComputedStyle(document.body).backgroundColor);
	const quiet = await paint();

	await helper.locator('[data-testid^="panel-press-"]').first().click();
	await expect
		.poll(paint, { message: 'тло табла не змінилося на прохання із зали', timeout: 10_000 })
		.not.toBe(quiet);

	// Спалах ГАСНЕ сам: смуга, яка лишилася б горіти, читається як поломка.
	await expect.poll(paint, { message: 'спалах не згас', timeout: 10_000 }).toBe(quiet);

	await desk.close();
	await hall.close();
});

test('три колонки стола стоять посередині, а не туляться до лівого краю', async ({ browser }) => {
	/*
	 * ВІЛЬНЕ МІСЦЕ ОБАБІЧ — ЦЕ І Є ПИТАННЯ, і відповісти на нього може лише
	 * браузер: розкладка тут складається з чужих правил, яких сторінка не
	 * бачить.
	 *
	 * Ряд мав `justify-content: center` і все одно стояв ліворуч. Винен був не
	 * ряд, а `.stack` на журналі: він несе `margin-inline: auto`, а автоматичний
	 * відступ у гнучкому ряду з'їдає ВСЕ вільне місце ще до того, як його
	 * ділить `justify-content`. Заміряно на 1440: ліворуч лишалося 0, праворуч
	 * 112. Жоден гейт цього не бачив — усі вони дивляться на джерела, а не на
	 * піксель.
	 */
	const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const board = await desk.newPage();

	await createInfoBoard(board);
	await board.getByTestId('info-start-edit-btn').click();
	await board.getByTestId('info-fill-btn').click();
	await board.getByTestId('info-edit-btn').click();
	await expect(board.getByTestId('info-wall-list')).toBeVisible(ACROSS);

	const room = await board.evaluate(() => {
		const desk = document.querySelector('.desk');
		if (!desk) return null;

		const kids = [...desk.children].map((kid) => kid.getBoundingClientRect());
		const box = desk.getBoundingClientRect();
		const top = kids.filter((kid) => Math.abs(kid.y - kids[0].y) < 1);

		return {
			columns: top.length,
			left: Math.round(Math.min(...top.map((kid) => kid.x)) - box.x),
			right: Math.round(box.right - Math.max(...top.map((kid) => kid.right))),
			spill: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});

	// Усі три в одному рядку — інакше питання про «ліворуч і праворуч» не про що.
	expect(room?.columns, 'колонки не стали в один ряд').toBe(3);
	expect(
		Math.abs((room?.left ?? 0) - (room?.right ?? 0)),
		`ряд зсунуто: ліворуч ${room?.left}, праворуч ${room?.right}`
	).toBeLessThanOrEqual(2);

	// І заразом: стіл не виїжджає вбік. Горизонтальна прокрутка тут — поломка.
	expect(room?.spill, 'сторінка поїхала вбік').toBeLessThanOrEqual(0);

	await desk.close();
});

test('інфодошку зі списку «Мої дошки» можна відкрити знову', async ({ browser }) => {
	/*
	 * ПОВЕРНУТИСЯ НА СВОЮ ДОШКУ — і це не про зручність.
	 *
	 * Дошка живе в сеансі вкладки, тобто закриття вкладки її закриває; список
	 * «Мої дошки» — єдиний шлях назад, і для інфодошки він не працював зовсім.
	 * Список вів на `/info` правильно (вид він рахує зі збереженого запису), а
	 * сама сторінка бачила дошку вже без виду, читала її як аудіо й чесно
	 * відправляла назад у меню. З боку людини — «кнопка не працює».
	 *
	 * Аудіодошка при цьому відкривалася, бо для неї «вид втрачено» і «вид
	 * аудіо» — те саме значення. Тобто половина списку працювала, і саме тому
	 * вада прожила стільки: екран, на якому щось не так, виглядав як робочий.
	 *
	 * Опис іде людським шляхом: із дошки в меню, зі списку — назад.
	 */
	const desk = await browser.newContext();
	const board = await desk.newPage();

	const id = await createInfoBoard(board);

	await board.goto('./menu');
	const mine = board.getByTestId('my-boards');
	await expect(mine, 'створена дошка не потрапила до списку').toContainText(id, ACROSS);

	await mine.getByRole('button', { name: new RegExp(id) }).click();

	await expect(board, 'інфодошка зі списку не відкрилася').toHaveURL(/\/info(\?|$)/, ACROSS);
	await expect(board.getByTestId('info-screen-section')).toBeVisible(ACROSS);
	// І це та сама дошка, а не якась інша з того ж списку.
	await expect(board.getByTestId('board-head')).toContainText(id);

	await desk.close();
});

test('натискання за пультом видно в залі, а не лише в залі — за пультом', async ({ browser }) => {
	/*
	 * ЗВ'ЯЗОК БУВ ОДНОБІЧНИЙ. Прохання із зали світилося на таблі — це
	 * працювало з першого дня. Зроблене за самим пультом до зали не доїжджало
	 * ніяк: помічник бачив лише наслідок, і то не завжди — кнопка наслідку не
	 * лишає взагалі, тобто натискання за пультом для зали просто не існувало.
	 *
	 * Перевірити це можна лише двома контекстами: ані юніт, ані статичний гейт
	 * не бачать, що саме приїхало на ДРУГИЙ екран.
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

	// Свіжий помічник НЕ блимає чужим минулим: вузол стану живе між виставами.
	await expect(helper.locator('.cell--recent'), 'блимнуло на порожньому місці').toHaveCount(0);

	await board.locator('[data-testid^="panel-press-"]').first().click();
	await expect(
		helper.locator('.cell--recent'),
		'натискання за пультом до зали не доїхало'
	).toHaveCount(1, ACROSS);

	/*
	 * І В ЖУРНАЛІ ЗАЛИ ВОНО НАЗВАНЕ ПРАВИЛЬНО. Перелік полів руками в
	 * `publishPanelState` уже з'їв був підпис і сторону: натискання доїжджало,
	 * а журнал у залі відповідав «помічник» на те, що зробили за пультом.
	 */
	await expect(
		helper.getByTestId('info-remote-log-section'),
		'журнал у залі назвав чужою рукою те, що зробили за пультом'
	).toContainText('табло', ACROSS);

	// І в інший бік — щоб виправлення однієї сторони не зламало другу.
	await helper.locator('[data-testid^="panel-press-"]').nth(1).click();
	await expect(
		board.getByTestId('info-wall-list').locator('.cell--recent'),
		'прохання із зали перестало світитися за пультом'
	).toHaveCount(1, ACROSS);

	await desk.close();
	await hall.close();
});

test('сповіщення в залі не зсуває панель під пальцем', async ({ browser }) => {
	/*
	 * ПАНЕЛЬ НЕ МАЄ ПРАВА ЇХАТИ. Сповіщення стояли в потоці над панеллю, і поява
	 * кожного зсувала кнопки вниз рівно на свою висоту — у ту саму мить, коли
	 * помічник дивиться на екран найуважніше: щойно попросив і чекає відповіді.
	 * Зникнення смуги через кілька секунд зсувало їх назад, так само раптово.
	 *
	 * Опис міряє САМЕ ЦЕ — координату сітки до й після, — а не наявність смуги:
	 * смуга була на місці й доти.
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
	const grid = helper.getByTestId('panel-list');
	await expect(grid).toBeVisible(ACROSS);

	const where = async () => Math.round((await grid.boundingBox())?.y ?? -1);
	const quiet = await where();
	expect(quiet, 'сітки немає на екрані — міряти нема чого').toBeGreaterThan(0);

	await helper.locator('[data-testid^="panel-press-"]').first().click();
	await expect(board.getByTestId('panel-verdict-done-btn')).toBeEnabled(ACROSS);
	await board.getByTestId('panel-verdict-done-btn').click();

	const strip = helper.getByTestId('info-verdict-text');
	await expect(strip, 'відповідь не долетіла в зал').toBeVisible(ACROSS);
	expect(await where(), 'панель з\u0027їхала від появи сповіщення').toBe(quiet);

	// І смуга справді НАД сторінкою, а не поруч: вона накриває те, що під нею.
	const over = await helper.evaluate(() => {
		const note = document.querySelector('[data-testid="info-verdict-text"]');
		if (!note) return null;
		const box = note.getBoundingClientRect();
		return getComputedStyle(note.parentElement as HTMLElement).position === 'fixed' && box.y > 0;
	});
	expect(over, 'сповіщення лишилося в потоці сторінки').toBe(true);

	await desk.close();
	await hall.close();
});

test('складальник уміщається в екран, а «Готово» стоїть при сітці', async ({ browser }) => {
	/*
	 * СКЛАДАЛЬНИК — ЦЕ ОДИН ЕКРАН, а не сувій. Доти його колонка несла три
	 * абзаци пояснення над самою сіткою, і на звичайному моніторі сітка — те
	 * єдине, задля чого сюди заходять — не вміщалася: доводилося прокручувати
	 * сторінку, щоб побачити нижній ряд місць. Сусідня колонка в цьому режимі
	 * при цьому стояла майже порожня.
	 *
	 * А кнопка виходу жила саме в тій сусідній колонці: між натисканням і
	 * наслідком око проходило через увесь екран.
	 */
	const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const board = await desk.newPage();

	await createInfoBoard(board);
	await board.getByTestId('info-start-edit-btn').click();
	await board.getByTestId('info-fill-btn').click();
	await expect(board.getByTestId('panel-editor-list')).toBeVisible(ACROSS);

	// «Готово» — усередині складальника, а не в картці керування екраном.
	await expect(
		board.getByTestId('info-editor-section').getByTestId('info-edit-btn'),
		'вихід зі складання стоїть не при сітці'
	).toBeVisible();

	// Підказка переїхала в бічну колонку й згортається.
	await expect(board.getByTestId('panel-help-section')).toBeVisible();
	await board.getByTestId('panel-help-fold-btn').click();
	await expect(board.getByTestId('panel-help-fold-btn')).toHaveAttribute('aria-expanded', 'false');

	const spill = await board.evaluate(
		() => document.documentElement.scrollHeight - document.documentElement.clientHeight
	);
	expect(spill, `складальник не вмістився: ${spill} точок за екраном`).toBeLessThanOrEqual(0);

	// І вихід справді виходить.
	await board.getByTestId('info-editor-section').getByTestId('info-edit-btn').click();
	await expect(board.getByTestId('info-wall-list')).toBeVisible(ACROSS);

	await desk.close();
});
