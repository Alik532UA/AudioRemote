import { expect, test, type Page } from '@playwright/test';
import { ACROSS, PASSWORD } from './board';
import { INTERACTIVE } from '../pages';

/**
 * ПРАВИЛА, СПІЛЬНІ ДЛЯ ВСІХ ВІКОН — одним описом, а не по разу на вікно.
 *
 * Вікна в цьому застосунку ламалися однаково й по черзі: дії ховалися за
 * прокруткою, лічильники налазили один на одного, вміст виштовхував
 * горизонтальну смугу. Кожен випадок ловився окремо й очима — тобто рівно
 * доти, доки хтось дивився.
 *
 * Тут ті самі правила задані РАЗ, а вікна перелічені. Нове вікно додається
 * одним рядком у `WINDOWS`, і на нього починають діяти всі чотири правила
 * одразу — а не тоді, коли про них згадають.
 *
 * ## Чому в теці з базою
 *
 * Обидва вікна живуть на дошці, а дошка — у базі. Вікно налаштувань, якому
 * дошка не потрібна, перевіряється над артефактом (`a11y.spec.ts`).
 *
 * ## Чого тут НЕМАЄ
 *
 * Оцінок вигляду. Машина не скаже, чи зрозумілий підпис і чи там стоїть
 * кнопка; це питає людина за вкладкою «Розкладка й поведінка екранів» у
 * чеклисті бета-тесту. Тут — лише те, що міряється числом.
 */

/** Найменша сторона цілі, у яку цілять пальцем (WCAG 2.5.5). */
const TAP = 44;

/** Допуск на перетин: менше — це антиаліасинг і рамки, а не помилка. */
const OVERLAP = 4;

interface Broken {
	rule: string;
	detail: string;
}

/**
 * Заміряти відкрите вікно за всіма правилами одразу.
 *
 * Повертає ПЕРЕЛІК порушень, а не перше: виправляти три дефекти по одному
 * прогону — це три прогони, і в кожному з них наступний дефект ще невидимий.
 */
async function inspect(page: Page, testid: string): Promise<Broken[]> {
	return page.evaluate(
		({ id, tap, slack, selector }) => {
			const box = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
			if (!box) return [{ rule: 'вікно', detail: `${id}: не відкрилося` }];

			const bad: { rule: string; detail: string }[] = [];
			const frame = box.getBoundingClientRect();

			/*
			 * Сховане від ока не рахується НІДЕ нижче: `visually-hidden` — це
			 * поле в один піксель для читача екрана, і його «вміст ширший за
			 * коробку» правдивий за побудовою.
			 */
			const shown = (element: HTMLElement) => {
				const style = getComputedStyle(element);
				return style.clip === 'auto' && style.clipPath === 'none' && style.visibility !== 'hidden';
			};

			/* 1. ВМІСТ НЕ ШИРШИЙ ЗА ВІКНО. Горизонтальна смуга у вікні означає, що
			   щось у ньому не стискається — і його не видно, доки не поїдеш. */
			for (const part of [box, ...box.querySelectorAll<HTMLElement>('*')]) {
				if (!shown(part)) continue;
				/*
				 * Поля вводу прокручуються ВСЕРЕДИНІ себе за задумом: довгий
				 * пароль у вузькому полі — це нормальне поле, а не поламана
				 * розкладка.
				 */
				if (['INPUT', 'TEXTAREA', 'SELECT'].includes(part.tagName)) continue;
				const spill = part.scrollWidth - part.clientWidth;
				if (spill > 1) {
					bad.push({
						rule: 'бічна прокрутка',
						detail: `${part.dataset.testid ?? (part.className || part.tagName)} («${(part.textContent ?? '').trim().slice(0, 24)}», ${Math.round(part.clientWidth)}): +${spill}`
					});
					break;
				}
			}

			const controls = [...box.querySelectorAll<HTMLElement>(selector)]
				.filter(shown)
				.map((element) => ({
					element,
					rect: element.getBoundingClientRect(),
					/*
					 * Липка смуга накриває вміст НАВМИСНО — вона для того й липка.
					 * Її перетин із тим, що під нею, — не помилка розкладки, а її
					 * задум; помилкою був би перетин двох сусідів у потоці.
					 */
					/*
					 * Підйом зупиняється НА САМОМУ ВІКНІ: відкритий `<dialog>` за
					 * стилем браузера `position: fixed`, тож підйом до `<html>`
					 * робив «липкими» геть усі органи вікна — і правило про
					 * навмисне перекриття не спрацьовувало жодного разу.
					 */
					pinned: (() => {
						let node: HTMLElement | null = element;
						while (node && node !== box) {
							if (['sticky', 'fixed'].includes(getComputedStyle(node).position)) return true;
							node = node.parentElement;
						}
						return false;
					})()
				}))
				.filter(({ rect }) => rect.width > 0 && rect.height > 0);

			/* 2. НІЩО НЕ ВИХОДИТЬ ЗА КРАЙ ВІКНА вбік: елемент за краєм не
			   натиснути взагалі. */
			for (const { element, rect } of controls) {
				if (rect.left < frame.left - 1 || rect.right > frame.right + 1) {
					bad.push({
						rule: 'орган за краєм вікна',
						detail: element.dataset.testid ?? element.className
					});
					break;
				}
			}

			/* 3. ЦІЛЬ ПІД ПАЛЕЦЬ. Те саме правило, що й на сторінках: у вікні воно
			   ламається частіше, бо місця менше. */
			for (const { element, rect } of controls) {
				if (rect.width < tap || rect.height < tap) {
					const label = element.closest<HTMLElement>('label');
					const big = label && label.getBoundingClientRect();
					if (big && big.width >= tap && big.height >= tap) continue;
					bad.push({
						rule: 'ціль замала',
						detail: `${element.dataset.testid ?? element.className}: ${Math.round(rect.width)}×${Math.round(rect.height)}`
					});
					break;
				}
			}

			/* 4. ЦІЛІ НЕ НАЛАЗЯТЬ ОДНА НА ОДНУ: перекриття означає, що палець
			   влучає не туди, куди цілив. */
			for (let i = 0; i < controls.length; i += 1) {
				for (let j = i + 1; j < controls.length; j += 1) {
					const a = controls[i];
					const b = controls[j];
					if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
					if (a.pinned !== b.pinned) continue;

					const across = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
					const down = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
					if (across > slack && down > slack) {
						bad.push({
							rule: 'цілі налазять',
							detail: `${a.element.dataset.testid ?? a.element.className}[${a.pinned ? 'липкий' : 'у потоці'}] × ${b.element.dataset.testid ?? b.element.className}[${b.pinned ? 'липкий' : 'у потоці'}]`
						});
						i = controls.length;
						break;
					}
				}
			}

			return bad;
		},
		{ id: testid, tap: TAP, slack: OVERLAP, selector: INTERACTIVE }
	);
}

/**
 * Дія, яка мусить лишатися видимою ПРИ БУДЬ-ЯКІЙ прокрутці вмісту вікна.
 * Повертає, чи ховалася вона бодай раз.
 */
async function hides(page: Page, dialog: string, action: string): Promise<boolean> {
	return page.evaluate(
		async ({ box, act }) => {
			const frame = document.querySelector<HTMLElement>(`[data-testid="${box}"]`);
			const button = document.querySelector<HTMLElement>(`[data-testid="${act}"]`);
			if (!frame || !button) return true;

			const inner = frame.querySelector<HTMLElement>('*[class]');
			const scroller =
				[...frame.querySelectorAll<HTMLElement>('*')].find(
					(one) => one.scrollHeight - one.clientHeight > 1
				) ?? inner;

			const seen: boolean[] = [];
			for (const where of [0, 10_000]) {
				if (scroller) scroller.scrollTop = where;
				await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
				const rect = button.getBoundingClientRect();
				const edge = frame.getBoundingClientRect();
				seen.push(rect.top >= edge.top - 1 && rect.bottom <= edge.bottom + 1);
			}
			return seen.some((visible) => !visible);
		},
		{ box: dialog, act: action }
	);
}

async function openBoard(page: Page): Promise<void> {
	await page.goto('./create?kind=info');
	await expect(page.getByTestId('board-id')).toBeVisible();
	await page.getByTestId('board-name').fill('Проба');
	await page.getByTestId('board-password').fill(PASSWORD);
	await page.getByTestId('create-submit').click();
	await expect(page.getByTestId('info-screen-section')).toBeVisible(ACROSS);
}

/** Вікна дошки: як відкрити й що в них НЕ мусить ховатися за прокруткою. */
const WINDOWS = [
	{
		name: 'правка віджета',
		box: 'cell-modal',
		keep: 'cell-save-btn',
		async open(page: Page) {
			await page.getByTestId('info-start-edit-btn').click();
			await page.getByTestId('info-fill-btn').click();
			await page.getByTestId('panel-slot-0-btn').click();
		}
	},
	{
		name: 'як покликати помічника',
		box: 'remote-modal',
		keep: 'remote-modal-close-btn',
		async open(page: Page) {
			await page.getByTestId('info-open-remote-btn').click();
		}
	}
] as const;

for (const window of WINDOWS) {
	test(`вікно «${window.name}» тримає спільні правила`, async ({ browser }) => {
		/*
		 * Екран навмисно НЕВИСОКИЙ: на просторому моніторі вміст вміщається, і
		 * жодне з правил не напружується. Ламалося воно саме там, де місця мало.
		 */
		const desk = await browser.newContext({ viewport: { width: 900, height: 620 } });
		const page = await desk.newPage();

		await openBoard(page);
		await window.open(page);
		await expect(page.getByTestId(window.box)).toBeVisible(ACROSS);

		const broken = await inspect(page, window.box);
		expect(
			broken.map((one) => `${one.rule}: ${one.detail}`),
			'вікно порушує правила'
		).toEqual([]);

		expect(
			await hides(page, window.box, window.keep),
			`«${window.keep}» ховається за прокруткою вікна`
		).toBe(false);

		await desk.close();
	});
}
