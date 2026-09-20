import { expect, test, type Page } from '@playwright/test';

/**
 * ТЕ, ЧОГО НЕ ВИДНО НІ З `node`, НІ З JSDOM, НІ З РЕГУЛЯРОК.
 *
 * Кожен опис нижче стереже дефект, який уже траплявся в цьому проєкті й
 * жодного разу не був би впійманий іншими перевірками. Нічого «про всяк
 * випадок» тут немає: браузерний прогін коштує хвилину CI, і набір, який
 * дублює юніти, цю хвилину лише витрачає.
 *
 * Дошки тут немає навмисно — межа набору названа в `playwright.config.ts`.
 */

/** Порушення політики безпеки, зібрані зі СТОРІНКИ, а не з консолі. */
function watchPolicy(page: Page): string[] {
	const violations: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (/content security policy|refused to (execute|load|apply)/i.test(text)) {
			violations.push(text);
		}
	});
	return violations;
}

test('застосунок відкривається за базовим шляхом і доходить до меню', async ({ page }) => {
	/*
	 * Корінь — стрілочник: він нічого не малює й веде далі. Тобто це заразом
	 * перевірка того, що `resolve()` і `base` збігаються з тим, як віддає
	 * хостинг: розбіжність тут дає порожній екран, а не помилку.
	 */
	const violations = watchPolicy(page);
	await page.goto('./');

	await expect(page.getByTestId('go-create')).toBeVisible();
	await expect(page.getByTestId('go-connect')).toBeVisible();
	expect(violations, `політика заблокувала своє:\n${violations.join('\n')}`).toEqual([]);
});

test('інлайн-скрипт теми ВИКОНУЄТЬСЯ, а не блокується політикою', async ({ page }) => {
	/*
	 * ЦЕ ГОЛОВНИЙ ОПИС НАБОРУ.
	 *
	 * `csp-hash.test.ts` доводить, що хеш у політиці дорівнює хешу скрипта. Чи
	 * пустив його БРАУЗЕР — питання іншого роду, і відповідь на нього не видно
	 * ніде: заблокований скрипт не дає ні помилки на екрані, ні падіння. Лише
	 * мигання теми при кожному відкритті — і рядок у консолі, якої ніхто не
	 * бачить.
	 *
	 * Перевіряється наслідок, а не сам факт виконання: скрипт існує рівно щоб
	 * поставити `data-theme` до першого кадру.
	 */
	const violations = watchPolicy(page);
	await page.addInitScript(() => {
		try {
			localStorage.setItem('audioremote_theme', 'dark');
		} catch {
			/* приватний режим — опис нижче однаково побачить розбіжність */
		}
	});

	await page.goto('./menu');

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	expect(violations, `скрипт теми заблоковано:\n${violations.join('\n')}`).toEqual([]);
});

test('перемикання теми справді перемальовує сторінку', async ({ page }) => {
	/*
	 * Дефект, описаний в `app.html`: `color-scheme` стояв і на `<html>`, і на
	 * `body`, і власна схема `body` перекривала успадковану. Атрибут теми
	 * мінявся, сховище записувалося, кнопка світилася — а колір лишався той
	 * самий. Ні jsdom, ні регулярка цього не бачать: `light-dark()` обчислює
	 * сам браузер.
	 *
	 * ## Перехід вимкнено, і це не підгонка під пробу
	 *
	 * Зміна теми йде плавно 180 мс (`theme-changing` у `tokens.css`), а
	 * `getComputedStyle` посеред переходу віддає проміжний колір. Перший
	 * варіант цього опису читав колір одразу після натискання й на завантаженій
	 * машині падав приблизно раз на кілька прогонів — тобто був плаваючим, а
	 * плаваючий гейт гірший за відсутній.
	 *
	 * `prefers-reduced-motion: reduce` тут не милиця: сам проєкт знімає за нею
	 * перехід (`tokens.css`), тобто це штатний шлях, яким ходять і люди з такою
	 * перевагою. Колір, який перевіряється, той самий.
	 */
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('./menu');

	const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

	await page.emulateMedia({ colorScheme: 'dark' });
	const dark = await background();

	await page.emulateMedia({ colorScheme: 'light' });
	const light = await background();

	expect(dark, 'системна схема не міняє кольору сторінки — `light-dark()` не працює').not.toBe(
		light
	);

	/*
	 * І те саме ЯВНИМ вибором, а не системною перевагою: це різні шляхи, і
	 * зламатися міг саме другий — атрибут на `<html>` проти успадкованої
	 * `color-scheme`.
	 *
	 * Перемикач іде від ВИДИМОЇ теми, а видима зараз світла, тож один клік дає
	 * рівно `dark`. Звіряється не «колір змінився», а «колір став тим самим, що
	 * й від системної темної»: інакше опис пройшов би й на будь-якому третьому
	 * кольорі.
	 */
	await page.getByTestId('theme-toggle').click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect.poll(background, { message: 'явний вибір теми не перемалював сторінку' }).toBe(dark);
});

test('невідома адреса дає 404 і сторінку з виходом', async ({ page }) => {
	/*
	 * Дві речі одночасно, і обидві ламаються тихо: хостинг мусить віддати
	 * `404.html` САМЕ З КОДОМ 404 (з кодом 200 сторінка помилки не показала б
	 * нічого особливого), а `+error.svelte` мусить намалювати вихід. Без
	 * виходу у ВСТАНОВЛЕНОМУ застосунку, де немає кнопки браузера, з цієї
	 * сторінки нікуди подітися.
	 */
	const response = await page.goto('./такої-сторінки-немає');

	expect(response?.status(), 'хостинг віддав не 404').toBe(404);
	await expect(page.getByTestId('error-page')).toBeVisible();
	await expect(page.getByTestId('error-to-menu')).toBeVisible();

	await page.getByTestId('error-to-menu').click();
	await expect(page.getByTestId('go-create')).toBeVisible();
});

test('клавіша належить відкритому вікну, а не сторінці під ним', async ({ page }) => {
	/*
	 * `showModal()` робить сторінку інертною для миші й фокуса, але НЕ для
	 * слухача на вікні. Через це пробіл, натиснутий на кнопці у відкритому
	 * вікні, робив дві речі: сторінка під вікном виконувала свою дію, а
	 * `preventDefault()` заразом зʼїдав саме натискання кнопки.
	 *
	 * Друга половина того дефекту тут і перевіряється — і саме вона видима без
	 * дошки: пробіл на кнопці «закрити» мусить її закрити. У jsdom це не
	 * перевіриш: там `showModal()` є, а активації кнопки пробілом немає.
	 */
	await page.goto('./menu');
	await page.getByTestId('go-settings').first().click();

	const dialog = page.getByTestId('settings-modal');
	await expect(dialog).toBeVisible();

	await page.getByTestId('settings-modal-close-btn').focus();
	await page.keyboard.press('Space');

	await expect(dialog, 'пробіл у вікні не спрацював — його зʼїла сторінка під ним').toBeHidden();
});

test('на жодній сторінці немає помилок у консолі', async ({ page }) => {
	/*
	 * Найширша сітка набору й найдешевша. Ловить те, на що немає окремого
	 * опису: заблокований ресурс, кинутий `$effect`, відмову проміса при
	 * підйомі. Відтепер такі помилки ще й потрапляють у журнал слідів
	 * (`crashLog.ts`) — але тільки в браузері видно, чи вони взагалі є.
	 */
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(String(error)));

	for (const path of ['./', './menu', './create', './connect', './settings']) {
		await page.goto(path);
		await expect(page.locator('main')).toBeVisible();
	}

	expect(errors, `сторінка скаржиться в консоль:\n${errors.join('\n')}`).toEqual([]);
});
