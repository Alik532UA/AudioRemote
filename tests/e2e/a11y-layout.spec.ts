import { expect, test, type Page } from '@playwright/test';
import { PAGES, RENDERED, ROUTES, WALK } from './pages';

/**
 * РОЗКЛАДКА, ЯКОЇ axe НЕ БАЧИТЬ У ПРИНЦИПІ
 * (ACCESSIBILITY-v9 § 8, § 10.3, § 10.3.1, § 10.8; `A11Y-REFLOW`,
 * `A11Y-TOUCH-OVERLAP`).
 *
 * axe перевіряє ДЕРЕВО ДОСТУПНОСТІ: імена, ролі, контраст. Два критерії WCAG
 * до нього не належать зовсім, бо вони про ГЕОМЕТРІЮ:
 *
 *  * 1.4.10 Reflow — на ширині 320 CSS px вміст читається без прокручування у
 *    два боки. Горизонтальна смуга тут не «негарно»: людина, яка збільшила
 *    масштаб до 200%, возить сторінку вбік на кожному рядку.
 *  * 2.5.8 Target Size — ціль не менша за 44×44 (власний стандарт проєкту;
 *    абсолютний мінімум WCAG — 24×24). Пульт тримають у руці посеред заняття,
 *    тобто це основний спосіб користування, а не крайній випадок.
 *
 * ## Чому цілі рахуються ще й ПАРАМИ
 *
 * Поелементна перевірка зелена й тоді, коли дві цілі по 44×44 лежать одна на
 * одній: кожна окремо правилу відповідає. Розширення зони кліку через
 * `padding` невидиме на екрані — сусід програє рівно там, де візуально нічого
 * не змінилося.
 *
 * ## Чому виняток «лежить у більшій цілі» ПЕРЕВІРЯЄТЬСЯ, а не оголошується
 *
 * Канон дозволяє винятки для елементів усередині більшої клікабельної зони й
 * вимагає, щоб вони були видимі в diff. Самого переліку мало: «клік по підпису
 * теж працює» — це твердження про браузер, і воно ламається мовчки, варто
 * підпису перестати бути `<label>` свого елемента.
 *
 * Тому виняток називає ОБГОРТКУ, а перевірка бере в неї `.control`: браузер сам
 * каже, чи справді ця мітка керує цим елементом. Плюс вимірює саму обгортку —
 * вона й мусить бути ціллю на 44. Прострочений виняток (елемент уже доріс)
 * червоніє так само, як забутий, — той самий ратчет, що й у переліку розмірів
 * файлів.
 */

// Межа часу опису — на весь обхід сторінок; чому саме так, сказано в `pages.ts`.
test.describe.configure({ timeout: WALK });

/** Стандарт проєкту: 44×44 CSS px на дотик. */
const TAP = 44;

/** Допуск на перетин цілей: менше — це антиаліасинг і рамки, а не помилка. */
const OVERLAP = 4;

const INTERACTIVE =
	'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch]';

/**
 * Елементи, менші за 44, які ціллю НЕ є: ціль — названа тут обгортка.
 *
 * Ключ — `data-testid`; `wrapper` — селектор мітки, яка насправді приймає клік,
 * `on` — сторінка, на якій цей елемент існує.
 *
 * ## НАВІЩО ТУТ АДРЕСА
 *
 * Прострочений виняток ловиться тим, що елемент обійшли, а малим він уже не
 * був. Але «обійшли» й «намалювався» — не одне й те саме: `settled()` віддає
 * сторінку, щойно бодай один орган керування три кадри стоїть на місці, а
 * перемикачі налаштувань приїжджають пізніше — після того, як сторінка
 * підняла збережене. На вільній машині ця різниця в кадр, на зайнятій — у
 * секунду, і тоді гейт казав «виняток більше не потрібен» про елемент, якого
 * просто не дочекалися. Заміряно за ніч: дві невдачі на п'ять повних прогонів,
 * обидві лише в повному прогоні з сусідніми проєктами на тій самій машині,
 * окремо — зелений щоразу.
 *
 * З адресою питання стає чесним: на СВОЇЙ сторінці елемент чекають поіменно, і
 * лише потім судять, чи потрібен ще виняток.
 */
const INSIDE_BIGGER_TARGET: Readonly<Record<string, { on: string; wrapper: string }>> = {
	// Прапорець «запам'ятати» — 20×20 усередині рядка заввишки --tap.
	'connect-remember': { on: PAGES.connect, wrapper: 'label.check' },
	// Доріжка перемикача — 47×26; клікає по ній увесь рядок із підписом.
	'settings-show-trigger': { on: PAGES.settings, wrapper: 'label.switch' },
	'settings-show-info-boards': { on: PAGES.settings, wrapper: 'label.switch' }
};

/** Те саме для браузера: лише «локатор → обгортка», без адрес. */
const WRAPPERS: Readonly<Record<string, string>> = Object.fromEntries(
	Object.entries(INSIDE_BIGGER_TARGET).map(([testid, where]) => [testid, where.wrapper])
);

interface Small {
	testid: string;
	size: string;
	wrapper: string | null;
	wrapperSize: string | null;
	wrapperControls: boolean;
}

/** Що на цій сторінці менше за ціль і чи є в нього законна обгортка. */
async function smallTargets(page: Page): Promise<Small[]> {
	return page.evaluate(
		({ selector, tap, exceptions }) => {
			const visible = [...document.querySelectorAll<HTMLElement>(selector)]
				.map((element) => ({ element, box: element.getBoundingClientRect() }))
				.filter(({ box }) => box.width > 0 && box.height > 0);

			return visible
				.filter(({ box }) => box.width < tap || box.height < tap)
				.map(({ element, box }) => {
					const testid = element.dataset.testid ?? element.className ?? element.tagName;
					const selectorOf = exceptions[testid];
					const wrapper = selectorOf ? element.closest<HTMLElement>(selectorOf) : null;
					const wrapperBox = wrapper?.getBoundingClientRect() ?? null;
					return {
						testid,
						size: `${Math.round(box.width)}×${Math.round(box.height)}`,
						wrapper: wrapper ? selectorOf : null,
						wrapperSize: wrapperBox
							? `${Math.round(wrapperBox.width)}×${Math.round(wrapperBox.height)}`
							: null,
						/*
						 * `.control` — це відповідь САМОГО БРАУЗЕРА на питання «чи
						 * передасть ця мітка клік цьому елементу». Ніяке наше
						 * припущення його не замінює.
						 */
						wrapperControls:
							wrapper instanceof HTMLLabelElement ? wrapper.control === element : false
					};
				});
		},
		{ selector: INTERACTIVE, tap: TAP, exceptions: WRAPPERS }
	);
}

/**
 * ДОЧЕКАТИСЯ, ДОКИ РОЗКЛАДКА ПЕРЕСТАНЕ ЇХАТИ.
 *
 * Плеєр, пульт і обидва екрани інфодошки без дошки чесно відправляють у меню, і
 * перехід іде вже в браузері. `main` при цьому стає видимим ДВІЧІ: спершу на
 * сторінці, з якої йдуть, потім на меню — а після переходу меню ще й дописує
 * згори рядок «чому ви тут», який зсуває картки. Вимір, зроблений між цими
 * моментами, застає розкладку на півдорозі: перевірка перекриття бачила
 * `go-create × go-connect: 287×17`, якого на екрані не буває жодної миті.
 *
 * Заміряно перед виправленням: один прогін із трьох, і щоразу на ІНШІЙ
 * сторінці (`./remote`, `./info-remote`, `./player`), а на самому `./menu` —
 * ніколи. Саме така форма й означає гонку, а не розкладку.
 *
 * Чекаємо не «трохи» й не адреси, а того самого, що потім міряємо: усі стилі
 * застосовані, у `main` є бодай один орган керування, і геометрія всіх органів
 * не змінюється три кадри поспіль. Адреси мало — вона встигає застигнути раніше за напис, що зсуває
 * картки; сон на фіксовані мілісекунди на зайнятій машині коротший за перехід,
 * а на вільній витрачається дарма.
 */
async function settled(page: Page) {
	await expect(page.locator('main')).toBeVisible(RENDERED);
	await page.waitForFunction(
		(selector) => {
			const seen = window as unknown as { __boxes?: string; __still?: number };
			/*
			 * СТИЛІ МАРШРУТУ ПРИЇЖДЖАЮТЬ ОКРЕМИМ ФАЙЛОМ, і поки він у дорозі,
			 * розмітка вже є, а розкладки ще немає.
			 *
			 * Заміряно на зібраному сайті: під час переходу з `./info` у меню
			 * стилів застосовано 10 з 11, потім 11 з 12, і лише коли всі 12 —
			 * картка стає 358×180. До того вона 287×17, тобто рівно те число, яке
			 * гейт і показував. `link` без `.sheet` — це стиль, який ще не
			 * застосовано; чекати на нього точніше, ніж на будь-яку кількість
			 * кадрів.
			 */
			const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]')];
			if (styles.some((link) => link.sheet === null)) return false;

			const main = document.querySelector('main');
			const controls = main ? [...main.querySelectorAll<HTMLElement>(selector)] : [];
			/*
			 * Порожній `main` — це ОБОЛОНКА сторінки, з якої йдуть: шапка вже
			 * намальована, вміст ще ні. Заміряно: на `./player` таких кадрів
			 * два-три поспіль, тобто «геометрія не міняється» справджується на
			 * стані, у якому міряти нема чого.
			 */
			if (controls.length === 0) return false;
			const now = controls
				.map((element) => {
					const box = element.getBoundingClientRect();
					return [box.x, box.y, box.width, box.height].map(Math.round).join(',');
				})
				.join('|');
			if (seen.__boxes !== now) {
				seen.__boxes = now;
				seen.__still = 0;
				return false;
			}
			seen.__still = (seen.__still ?? 0) + 1;
			return seen.__still >= 3;
		},
		INTERACTIVE,
		{ timeout: 10_000 }
	);
}

test('на 320 px сторінка не їде вбік', async ({ page }) => {
	/*
	 * 320 — не «маленький телефон», а ширина з 1.4.10: вона ж виходить із
	 * 1280 px при збільшенні до 400%.
	 */
	await page.setViewportSize({ width: 320, height: 800 });

	const wide: string[] = [];
	for (const path of ROUTES) {
		await page.goto(path);
		await settled(page);

		const culprits = await page.evaluate(() => {
			const root = document.documentElement;
			if (root.scrollWidth <= root.clientWidth) return [];
			/*
			 * Число саме по собі не лікується: далі шукають руками. Тому разом
			 * із ним іде перелік того, що вилазить за край.
			 */
			return [...document.querySelectorAll<HTMLElement>('body *')]
				.filter((element) => {
					const box = element.getBoundingClientRect();
					return box.right > root.clientWidth + 1 || box.left < -1;
				})
				.slice(0, 8)
				.map((element) => {
					const box = element.getBoundingClientRect();
					const name = element.dataset.testid ?? element.className ?? element.tagName;
					return `${name} ${Math.round(box.left)}…${Math.round(box.right)}`;
				});
		});

		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		if (width > 320) wide.push(`${path}: ${width} px\n      ${culprits.join('\n      ')}`);
	}

	expect(wide, `горизонтальна прокрутка на 320 px:\n${wide.join('\n')}`).toEqual([]);
});

test('на 320 px не їде вбік і відкрите вікно', async ({ page }) => {
	/*
	 * Вікно з фіксованою шириною в пікселях — найчастіше місце цього дефекту, і
	 * в стані «одразу після goto()» його не видно.
	 */
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto('./menu');
	await page.getByTestId('go-settings').first().click();
	await expect(page.getByTestId('settings-modal')).toBeVisible();

	const width = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(width, 'відкрите вікно розсунуло сторінку').toBeLessThanOrEqual(320);
});

test('кожна ціль не менша за 44×44, а виняток справді лежить у більшій', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });

	const problems: string[] = [];
	const seen = new Set<string>();
	let counted = 0;

	for (const path of ROUTES) {
		await page.goto(path);
		await settled(page);

		/*
		 * Виняток чекають на ЙОГО сторінці й поіменно: `settled()` стереже
		 * розкладку загалом і нічого не знає про те, що саме тут мусить бути.
		 */
		for (const [testid, where] of Object.entries(INSIDE_BIGGER_TARGET)) {
			if (where.on !== path) continue;
			await expect(
				page.getByTestId(testid),
				`${path}: виняток «${testid}» не намалювався, судити про нього нема по чому`
			).toBeVisible(RENDERED);
		}

		counted += await page.evaluate(
			(selector) => document.querySelectorAll(selector).length,
			INTERACTIVE
		);

		for (const small of await smallTargets(page)) {
			seen.add(small.testid);

			if (!small.wrapper) {
				problems.push(`${path} ${small.testid}: ${small.size} — менше за ${TAP}×${TAP}`);
				continue;
			}
			if (!small.wrapperControls) {
				problems.push(
					`${path} ${small.testid}: обгортка «${small.wrapper}» не керує цим елементом — клік по ній нічого не робить`
				);
				continue;
			}
			if (small.wrapperSize && small.wrapperSize.split('×').some((side) => Number(side) < TAP)) {
				problems.push(
					`${path} ${small.testid}: обгортка «${small.wrapper}» сама ${small.wrapperSize}`
				);
			}
		}
	}

	expect(counted, 'жодного керування не знайдено — перевірка мертва').toBeGreaterThan(20);

	/*
	 * ПРОСТРОЧЕНИЙ ВИНЯТОК — ТАКА САМА ПРОБЛЕМА, ЯК ЙОГО ВІДСУТНІСТЬ: він
	 * приховає наступне зменшення того самого елемента.
	 */
	const stale = Object.keys(INSIDE_BIGGER_TARGET).filter((testid) => !seen.has(testid));
	expect(stale, `виняток більше не потрібен — прибрати з INSIDE_BIGGER_TARGET: ${stale}`).toEqual(
		[]
	);

	expect(problems, `замалі цілі:\n${problems.join('\n')}`).toEqual([]);
});

test('цілі не перекривають одна одну', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });

	const problems: string[] = [];
	for (const path of ROUTES) {
		await page.goto(path);
		await settled(page);

		const overlaps = await page.evaluate(
			({ selector, allowed }) => {
				const items = [...document.querySelectorAll<HTMLElement>(selector)]
					.map((element) => ({ element, box: element.getBoundingClientRect() }))
					.filter(({ box }) => box.width > 0 && box.height > 0);

				const found: string[] = [];
				for (let i = 0; i < items.length; i++) {
					for (let j = i + 1; j < items.length; j++) {
						const a = items[i];
						const b = items[j];
						// Вкладені пари законні: зовнішній елемент — ціль навмисно.
						if (a.element.contains(b.element) || b.element.contains(a.element)) continue;

						const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
						const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
						if (width <= allowed || height <= allowed) continue;

						const name = (element: HTMLElement) =>
							element.dataset.testid ?? element.className ?? element.tagName;
						found.push(
							`${name(a.element)} × ${name(b.element)}: ${Math.round(width)}×${Math.round(height)} px`
						);
					}
				}
				return found;
			},
			{ selector: INTERACTIVE, allowed: OVERLAP }
		);

		problems.push(...overlaps.map((entry) => `${path} ${entry}`));
	}

	expect(
		problems,
		`цілі накладаються — клік дістанеться сусідові:\n${problems.join('\n')}`
	).toEqual([]);
});
