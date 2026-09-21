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

	it('команда з поради не дублюється в її тексті', () => {
		/*
		 * Команду показує окремим полем `Failure.svelte` — моноширинним шрифтом і
		 * з кнопкою копіювання. Якщо вона лишиться й у тексті, людина побачить її
		 * двічі, причому перший раз — посеред речення, звідки її й доводилося
		 * виділяти мишею.
		 */
		const source = readFileSync(join(ROOT, 'src/lib/net/describeError.ts'), 'utf8');
		const map = source.slice(source.indexOf('FIX_COMMAND'), source.indexOf('export function'));
		const pairs = [...map.matchAll(/'([\w.]+)':\s*'([^']+)'/g)];

		expect(pairs.length, 'у FIX_COMMAND нічого немає — перевіряти нічого').toBeGreaterThan(0);

		const doubled: string[] = [];
		for (const file of ['src/lib/i18n/uk.ts', 'src/lib/i18n/en.ts']) {
			const dict = readFileSync(join(ROOT, file), 'utf8');
			for (const [, key, command] of pairs) {
				const at = dict.indexOf(`'${key}':`);
				if (at === -1) {
					doubled.push(`${file}: ключа ${key} немає, а команда для нього є`);
					continue;
				}
				// Запис словника коротший за це вікно: далі почнеться наступний ключ,
				// і команда з нього сюди не потрапить.
				const text = dict.slice(at, at + 400);
				if (text.includes(command)) doubled.push(`${file}: ${key} повторює «${command}»`);
			}
		}

		expect(doubled, doubled.join('; ')).toEqual([]);
	});

	it('відмова зберігається ключем, а не перекладеним текстом', () => {
		/*
		 * `failure = t(describeError(error))` перекладає ОДРАЗУ й запамʼятовує
		 * результат: текст застигає мовою, яка була на момент відмови, і
		 * перемикання мови його не чіпає. Та сама помилка вже лікувалася в
		 * опитувачі тригерів (`FAULT_TEXT`), тож правило одне на проєкт.
		 */
		const early: string[] = [];
		for (const file of walk('src').filter((name) => /\.(svelte|ts)$/.test(name))) {
			if (/\.(test|spec)\.ts$/.test(file)) continue;
			// Коментарі зрізаються: саме цей антипатерн названо в поясненні
			// `Failure.svelte` дослівно, і без зрізання гейт знайшов би пояснення,
			// чому так робити не можна, замість самого «так робити».
			const text = readFileSync(file, 'utf8')
				.replace(/<!--[\s\S]*?-->/g, '')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*\/\/.*$/gm, '');
			if (/=\s*t\(\s*describeError\(/.test(text)) early.push(file);
		}

		expect(
			early,
			`переклад застигне мовою, яка була на момент відмови: ${early.join(', ')}`
		).toEqual([]);
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
