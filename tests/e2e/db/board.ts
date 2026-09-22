import { expect, type Page } from '@playwright/test';

/**
 * СПІЛЬНЕ ДЛЯ ДОШКОВИХ ОПИСІВ І ДЛЯ ЇХНЬОГО ПРОГРІВУ.
 *
 * Окремим модулем, а не всередині `board.spec.ts`: сетап мусить пройти ТОЧНО
 * той самий шлях, що й описи, — інакше він грів би не те. Файл навмисно без
 * суфікса `.spec`/`.setup`, тож жоден раннер не візьме його за перевірку.
 */

/**
 * СКІЛЬКИ ЧЕКАТИ НА ТЕ, ЩО ЇДЕ ЧЕРЕЗ БАЗУ.
 *
 * Типові пʼять секунд Playwright розраховані на те, що міняється в тій самій
 * вкладці. Тут інакше: подія проходить сокет, базу, правила й другий сокет, а
 * прогін іде разом із рештою набору, тобто на зайнятій машині. Заміряно —
 * «пульт не побачив плеєра» падав приблизно раз на два повні прогони, і щоразу
 * присутність зʼявлялася, просто пізніше.
 *
 * Довше очікування нічого не послаблює: зламана присутність не зʼявиться ні за
 * пʼять секунд, ні за двадцять.
 */
export const ACROSS = { timeout: 20_000 };

/** Пароль довгий навмисно: короткий дає попередження, яке заважає читати екран. */
export const PASSWORD = 'пароль-для-проби-достатньо-довгий';

/** Створити дошку справжнім плеєром і повернути її ідентифікатор. */
export async function createBoard(player: Page, name = 'Проба'): Promise<string> {
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
export async function joinAsRemote(remote: Page, id: string, password = PASSWORD): Promise<void> {
	await remote.goto('./connect');
	await remote.getByTestId('connect-id').fill(id);
	await remote.locator('input[type="password"]').fill(password);
	await remote.getByTestId('connect-submit').click();
}

/** Дочекатися, доки пульт справді ВСЕРЕДИНІ дошки, і сказати прямо, якщо ні. */
export async function expectInside(remote: Page): Promise<void> {
	// Окремим кроком: інакше «елемента немає» читалося б як «присутність не
	// приїхала», хоча насправді пульт лишився на сторінці входу з помилкою.
	await expect(remote, 'пульт не зайшов на дошку — лишився на сторінці входу').toHaveURL(
		/\/remote/,
		ACROSS
	);
	await expect(remote.getByTestId('link-state')).toBeVisible(ACROSS);
}
