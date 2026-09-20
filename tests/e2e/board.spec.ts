import { expect, test, type Page } from '@playwright/test';
import { uk } from '../../src/lib/i18n/uk';

/*
 * ТЕКСТ БЕРЕТЬСЯ ЗІ СЛОВНИКА, А НЕ З ГОЛОВИ.
 *
 * Вписаний рядок ламався б від кожної правки формулювання — і ламався б
 * червоним, тобто виглядав би як поломка застосунку. А головне: мову тут
 * вирішує браузер, і Playwright типово дає `en-US`, тож перша редакція цих
 * описів чесно шукала українське «на звʼязку» на англійському екрані.
 *
 * Мова закріплена в `playwright.config.ts` (`locale: 'uk-UA'`) — тим самим
 * шляхом, яким її обирає людина, тобто через `navigator.language`.
 */

/**
 * ДВІ РОЛІ, ДВА БРАУЗЕРИ, ОДНА БАЗА.
 *
 * ## Що тут перевіряється й чому саме браузером
 *
 * Половина цього застосунку — це домовленість між ДВОМА пристроями через базу:
 * присутність, журнал команд, квитанції, пароль у самій адресі дошки. Жодна з
 * цих речей не існує всередині одного процесу, тож юніт над нею перевіряє
 * щонайбільше свою половину — і саме тому тут уже двічі ламалося те, що
 * виглядало справним: поле, назване в коді інакше, ніж у правилі, відкидало
 * ВЕСЬ запис бібліотеки, а пульт писав «на плеєрі ще не обрано папку».
 *
 * Тут обидві ролі — справжні сторінки в РІЗНИХ контекстах браузера (тобто з
 * різними профілями, різними анонімними `uid`), а між ними справжня база в
 * емуляторі зі справжніми правилами.
 *
 * ## Чому папки немає й це не заважає
 *
 * Бібліотека живе на диску приймача, а `showDirectoryPicker()` Playwright
 * драйвити не вміє — такої команди немає ні в API, ні в CDP. Але все, що
 * перевіряється нижче, папки не потребує: дошка створюється, присутність
 * зʼявляється, команди ходять і квитуються ще до того, як обрано хоч один
 * трек. Відсутність папки навіть корисна — саме вона робить стан пульта
 * однозначним.
 *
 * Те, для чого папка таки потрібна (реальне відтворення, гонка запусків), у
 * наборі немає, і в `PROJECT-CONTEXT.md` § 4 сказано, чого для цього бракує.
 *
 * ## Чому dev-сервер, а не `build/`
 *
 * Конфіг Firebase запікається у збірку. Збірка, яка дивиться в емулятор, — це
 * другий артефакт, і в CI, де змінні вказують на бойову базу, переплутати їх
 * означало б писати пробними дошками у справжню базу школи. Dev-сервер бере
 * конфіг із `.env.development`, де емулятор прописаний назавжди й нічого
 * іншого бути не може. Артефактні перевірки (політика, базовий шлях, 404)
 * лишаються там, де й були, — над `build/` у `shell.spec.ts`.
 */

/** Пароль довгий навмисно: короткий дає попередження, яке заважає читати екран. */
const PASSWORD = 'пароль-для-проби-достатньо-довгий';

/** Створити дошку справжнім плеєром і повернути її ідентифікатор. */
async function createBoard(player: Page, name = 'Проба'): Promise<string> {
	await player.goto('./create');
	await expect(player.getByTestId('board-id')).toBeVisible();

	const id = (await player.getByTestId('board-id').innerText()).trim();
	await player.getByTestId('board-name').fill(name);
	await player.getByTestId('board-password').fill(PASSWORD);
	await player.getByTestId('create-submit').click();

	// Плеєр відкрився — отже `ensureBoard` уже записав дошку в базу.
	await expect(player.getByTestId('pick-folder')).toBeVisible();
	return id;
}

/** Під'єднатися пультом до наявної дошки. */
async function joinAsRemote(remote: Page, id: string, password = PASSWORD): Promise<void> {
	await remote.goto('./connect');
	await remote.getByTestId('connect-id').fill(id);
	await remote.locator('input[type="password"]').fill(password);
	await remote.getByTestId('connect-submit').click();
}

test('пульт бачить плеєр, а плеєр — пульт', async ({ browser }) => {
	/*
	 * Присутність тримається на `onDisconnect` — обіцянці, яку виконує СЕРВЕР,
	 * коли сокет обривається. Усередині одного процесу її не перевірити взагалі:
	 * немає другої сторони, яка побачила б результат.
	 */
	const board = await browser.newContext();
	const guest = await browser.newContext();
	const player = await board.newPage();
	const remote = await guest.newPage();

	const id = await createBoard(player);
	await joinAsRemote(remote, id);

	await expect(remote.getByTestId('link-state'), 'пульт не побачив плеєра').toHaveText(
		uk['remote.online']
	);
	await expect(player.getByTestId('board-head'), 'плеєр не порахував пульт').toContainText(
		uk['player.listeners'].replace('{count}', '1')
	);

	await board.close();
	await guest.close();
});

test('чужий пароль не відкриває дошку', async ({ browser }) => {
	/*
	 * ГОЛОВНИЙ ОПИС ПРО БЕЗПЕКУ, І ПЕРЕВІРИТИ ЙОГО МОЖНА ЛИШЕ ТУТ.
	 *
	 * Пароль не звіряється ніде: він ВХОДИТЬ В АДРЕСУ дошки, бо шлях — це хеш
	 * від пари (ідентифікатор, пароль). Інший пароль дає інший шлях, за яким
	 * нічого немає. Юніт над `boardPath` доводить, що хеші різні; що за чужим
	 * хешем справді НІЧОГО не віддається — доводить лише жива база з живими
	 * правилами.
	 */
	const board = await browser.newContext();
	const guest = await browser.newContext();
	const player = await board.newPage();
	const stranger = await guest.newPage();

	const id = await createBoard(player);
	await joinAsRemote(stranger, id, 'зовсім-інший-пароль-теж-довгий');

	await expect(
		stranger.getByTestId('connect-error'),
		'чужий пароль пустили на дошку'
	).toBeVisible();
	await expect(stranger).toHaveURL(/\/connect/);

	await board.close();
	await guest.close();
});

test('команда з пульта долітає до плеєра', async ({ browser }) => {
	/*
	 * Кругообіг цілком і на ЖИВОМУ приймачі: пульт дописує команду → приймач її
	 * читає й виконує → оголошує новий стан → стан приїжджає назад. Чотири
	 * записи в базу під різними правилами й двома різними `uid`, і жоден із них
	 * не існує всередині одного процесу.
	 *
	 * ЧОМУ САМЕ ГУЧНІСТЬ. Решта команд без папки вимкнені навмисно, і це
	 * правильно: «стоп» без треку не має сенсу, тож кнопка `disabled`. Гучність
	 * же не потребує ні треку, ні дозволу на звук — тобто перевіряє рівно канал.
	 *
	 * І перевіряється не «пульт не показав помилки», а ЕКРАН ПЛЕЄРА: тільки він
	 * доводить, що команда справді виконалася на тому боці, а не загубилася в
	 * базі з виглядом успіху.
	 */
	const board = await browser.newContext();
	const guest = await browser.newContext();
	const player = await board.newPage();
	const remote = await guest.newPage();

	const id = await createBoard(player);
	await joinAsRemote(remote, id);
	await expect(remote.getByTestId('link-state')).toHaveText(uk['remote.online']);

	// Заразом видно, чому обрано гучність: усе інше без папки недоступне.
	await expect(
		remote.getByTestId('cmd-stop'),
		'кнопка без треку мусить бути вимкнена'
	).toBeDisabled();

	await remote.getByTestId('cmd-volume').fill('35');

	await expect(
		player.getByTestId('player-volume'),
		'команда не долетіла: гучність на плеєрі не змінилася'
	).toHaveValue('35', { timeout: 20_000 });
	await expect(remote.getByTestId('remote-trouble'), 'пульт поскаржився').toBeHidden();

	await board.close();
	await guest.close();
});

test('пульт помічає, що плеєр пішов', async ({ browser }) => {
	/*
	 * Зворотний бік присутності, і зламатися він може окремо: `onDisconnect`
	 * ставиться ОДИН раз при вході, а спрацьовує на сервері вже після обриву.
	 * Забути його — це не «нічого не станеться», а «дошка назавжди виглядає
	 * живою», і пульт тоді мовчки шле команди в нікуди.
	 */
	const board = await browser.newContext();
	const guest = await browser.newContext();
	const player = await board.newPage();
	const remote = await guest.newPage();

	const id = await createBoard(player);
	await joinAsRemote(remote, id);
	await expect(remote.getByTestId('link-state')).toHaveText(uk['remote.online']);

	await board.close();

	await expect(remote.getByTestId('link-state'), 'дошка лишилася «живою» без плеєра').toHaveText(
		uk['remote.offline'],
		{ timeout: 30_000 }
	);

	await guest.close();
});
