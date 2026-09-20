// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { walk } from './gates/fs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * БІЛОГО АРКУША БУТИ НЕ МАЄ (ERROR-HANDLING-v9 § 2.2, § 2.3, HIGH).
 *
 * Обидві сітки безпеки ловлять різне, і одна одну не замінює:
 *
 *  * `+error.svelte` — помилки НАВІГАЦІЇ: невідома адреса, відмова `load`. Без
 *    нього SvelteKit показує власну сторінку без жодного виходу, а у
 *    встановленому застосунку, де немає кнопки браузера, з неї нікуди подітися.
 *  * `<svelte:boundary>` — помилки РЕНДЕРУ й `$effect` усередині межі. Без неї
 *    одна виняткова ситуація в компоненті прибирає з екрана все, включно з
 *    шапкою: людина в залі бачить порожнечу й не має куди натиснути.
 *
 * Межа стоїть УСЕРЕДИНІ оболонки, навколо сторінки, і це теж перевіряється:
 * межа навколо всієї оболонки дала б той самий порожній екран, лише з написом.
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
 */

const ROOT = process.cwd();

const layout = readFileSync(join(ROOT, 'src/routes/+layout.svelte'), 'utf8');

describe('сітки безпеки (ERROR-HANDLING-v9 § 2)', () => {
	it('у корені маршрутів є +error.svelte', () => {
		expect(
			existsSync(join(ROOT, 'src/routes/+error.svelte')),
			'помилка навігації лишить людину на сторінці без виходу'
		).toBe(true);
	});

	it('сторінка помилки дає вихід і називає версію', () => {
		const errorPage = readFileSync(join(ROOT, 'src/routes/+error.svelte'), 'utf8');
		expect(errorPage, 'зі сторінки помилки нема куди піти').toMatch(/<a[^>]*href=/);
		expect(errorPage, 'у звіті не буде видно, яку збірку бачила людина').toContain(
			'__APP_VERSION__'
		);
	});

	it('сторінка лежить під межею помилки', () => {
		expect(layout, 'у макеті немає <svelte:boundary>').toContain('<svelte:boundary');
		expect(layout, 'межа без сніпета failed нічого не показує').toMatch(/\{#snippet failed\(/);
	});

	it('межа стоїть навколо сторінки, а не навколо всієї оболонки', () => {
		const boundaryAt = layout.indexOf('<svelte:boundary');
		const headerAt = layout.indexOf('<header');
		expect(headerAt, 'у макеті немає шапки — перевірка втратила орієнтир').toBeGreaterThan(-1);
		expect(
			boundaryAt,
			'межа охоплює й шапку: при поломці зникне і вихід зі сторінки'
		).toBeGreaterThan(headerAt);
	});

	it('те, що поза межами, потрапляє в журнал', () => {
		/*
		 * Третя сітка й НАЙШИРША: обробники подій, таймери, колбеки бази й
		 * відмови промісів не належать ні навігації, ні рендеру, тож жодна з
		 * двох межа їх не бачить. Саме там цей застосунок і працює.
		 *
		 * Перевіряється ВИКЛИК, а не імпорт: модуль, підключений і не покликаний,
		 * проходить і компілятор, і перевірку досяжності — а журнал так само
		 * обривається, не назвавши причини.
		 */
		expect(layout, 'перехоплювач не викликаний у макеті').toMatch(/logCrashes\(\s*window\s*\)/);
		expect(layout, 'перехоплювач поставлений і не знімається').toMatch(/\bunlog\(\)/);
	});

	it('перехоплювач стоїть раніше за все, що здатне кинути', () => {
		// Поставлений після ініціалізацій, він не побачив би саме той виняток,
		// який найдорожчий: під час підняття застосунку.
		const at = layout.indexOf('logCrashes(window)');
		expect(at, 'перехоплювача в макеті немає').toBeGreaterThan(-1);
		expect(at, 'перехоплювач стоїть після ініціалізацій').toBeLessThan(
			layout.indexOf('themeState.init()')
		);
	});

	it('кожна межа з await у тілі має сніпет pending', () => {
		/*
		 * Призупинення підіймається до найближчої межі, яка вміє його показати.
		 * Якщо такої немає — до кореня, і тоді порожньою стає ВСЯ сторінка, без
		 * жодної помилки ні в консолі, ні в журналі (`EH-BOUNDARY-PENDING`).
		 */
		const naked: string[] = [];
		for (const file of walk('src').filter((name) => name.endsWith('.svelte'))) {
			const text = readFileSync(file, 'utf8');
			for (const open of text.matchAll(/<svelte:boundary/g)) {
				const close = text.indexOf('</svelte:boundary>', open.index);
				if (close === -1) continue;
				const body = text.slice(open.index, close);
				if (/\bawait\b/.test(body) && !/\{#snippet pending\(/.test(body)) {
					naked.push(`${file}:${text.slice(0, open.index).split('\n').length}`);
				}
			}
		}
		expect(naked, `межа з await і без pending:\n${naked.join('\n')}`).toEqual([]);
	});
});
