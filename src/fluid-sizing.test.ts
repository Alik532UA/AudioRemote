// @vitest-environment node
// Перевірка лише читає файли — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { walk } from './gates/fs';
import { readFileSync } from 'node:fs';

/**
 * РОЗМІР ВІД ЕКРАНА, А НЕ ВІД ВМІСТУ (FLUID-SIZING-v9 § 1.1, § 2, § 7A).
 *
 * ## Чому це взагалі окрема перевірка
 *
 * Дефекти цього класу знаходить КОРИСТУВАЧ на своєму телефоні. Для типів,
 * `svelte-check` і решти гейтів `minmax(220px, 1fr)` і `minmax(min(220px,
 * 100%), 1fr)` — однаково правильний CSS; різниця між ними видно лише тоді,
 * коли вікно вужче за 220px плюс поля, і тоді сторінка вже їде вбік.
 *
 * Браузерний замір (§ 9) ловить це чесніше, але потребує E2E-набору, якого тут
 * немає навмисно (PROJECT-CONTEXT.md § 4). Сканування джерел покриває три з
 * чотирьох анти-патернів таблиці без браузера взагалі — і, на відміну від
 * заміру, бачить гілки `{#if}` і вікна, куди `page.goto()` не заходить.
 *
 * ## Що саме перевіряється, і чому НЕ все підряд
 *
 * Перевіряються лише випадки, де голе число — завжди помилка, скільки б місця
 * не було:
 *
 * 1. `repeat(auto-fit, minmax(Npx, 1fr))` — те саме число водночас поріг
 *    переносу й ПІДЛОГА ширини. Коли контейнер вужчий за N, колонка лишається
 *    N, і картка розпирає сторінку (§ 1.1).
 * 2. `repeat(N, 1fr)` — `1fr` це `minmax(auto, 1fr)`, тобто колонка не стане
 *    вужчою за `min-content` вмісту (§ 1).
 * 3. `vh` у висотах — на мобільних не враховує згортання панелі браузера, і
 *    нижній край лишається під нею (§ 2).
 * 4. `@media` всередині компонента — він міряє ВІКНО, а компонент стоїть у
 *    колонці, у вікні або в панелі (§ 7A).
 *
 * Явні сітки на кшталт `minmax(300px, 1fr) minmax(360px, 1.15fr)` у
 * `base.css` сюди НЕ потрапляють, і це не пропуск: вони живуть під
 * `@media (min-width: 900px)`, де місця свідомо більше за суму підлог.
 * Перевірка, що намагалася б це довести, рахувала б проміжки й падінги — і
 * перше ж хибне спрацювання її б вимкнуло (AI-AGENT-PITFALLS-v9 § 1.1).
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
 */

/**
 * Коментарі замінюються ПРОБІЛАМИ, а не вирізаються.
 *
 * Коментар, що пояснює анти-патерн, мусить його процитувати — і перший же
 * прогін падає на власній документації (FLUID-SIZING-v9 § 9). А заміна саме
 * пробілами, а не порожнім рядком, тримає номери рядків: інакше звіт показував
 * би не те місце, і його перевіряли б руками щоразу.
 */
const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

const withoutComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank);

interface Source {
	file: string;
	/** Лише CSS: для `.svelte` це вміст `<style>`, для `.css` — весь файл. */
	css: string;
}

const files = walk('src').filter((file) => /\.(svelte|css)$/.test(file));

const sources: Source[] = files.map((file) => {
	const text = withoutComments(readFileSync(file, 'utf8'));
	if (!file.endsWith('.svelte')) return { file, css: text };

	/*
	 * З `.svelte` береться ТІЛЬКИ `<style>`, і рядки поза ним зашиваються
	 * пробілами. Інакше `repeat(3, 1fr)` у рядку розмітки чи в тексті словника
	 * рахувався б за стиль, а номер рядка в звіті з'їхав би.
	 */
	let css = blank(text);
	for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
		const at = match.index + match[0].indexOf(match[1]);
		css = css.slice(0, at) + match[1] + css.slice(at + match[1].length);
	}
	return { file, css };
});

/** Місце знахідки в тому вигляді, у якому його клацають у терміналі. */
const at = (file: string, css: string, index: number): string =>
	`${file}:${css.slice(0, index).split('\n').length}`;

const hits = (pattern: RegExp): string[] =>
	sources.flatMap(({ file, css }) =>
		[...css.matchAll(pattern)].map((m) => `${at(file, css, m.index)}  ${m[0].trim()}`)
	);

describe('масштабування (FLUID-SIZING-v9)', () => {
	it('перевірка жива: стилі знайдено й коментарі з них прибрано', () => {
		const withCss = sources.filter(({ css }) => /\{[\s\S]*\}/.test(css));
		expect(withCss.length, 'сканер не бачить стилів — далі все зелене дарма').toBeGreaterThan(10);

		// Межа не нуль: на день коміту в джерелах ~4400 непорожніх рядків CSS.
		const lines = sources.reduce(
			(sum, { css }) => sum + css.split('\n').filter((line) => line.trim()).length,
			0
		);
		expect(lines, 'CSS майже порожній — імовірно, вирізано зайве').toBeGreaterThan(1000);
	});

	it('перевірка жива: коментар із анти-патерном не рахується', () => {
		// Сам цей файл їх цитує вдосталь, а в скан він не входить — але правило
		// перевіряється на зразку, а не на вірі.
		const sample = withoutComments('/* repeat(3, 1fr) */\n.a { color: red; }');
		expect(sample).not.toContain('repeat(3, 1fr)');
		expect(sample.split('\n').length, 'номери рядків поїхали').toBe(2);
	});

	it('мінімум у minmax() не буває голою довжиною (§ 1.1)', () => {
		/*
		 * `min(Npx, 100%)` лишає N порогом переносу, але знімає його як підлогу.
		 * `minmax(0, …)` теж законний — це явна відмова від підлоги.
		 */
		const bad = hits(/repeat\(\s*auto-(?:fit|fill)\s*,\s*minmax\(\s*[0-9.]+(?:px|rem|em)/g);
		expect(
			bad,
			'поріг переносу став підлогою ширини — картка розіпре сторінку ' +
				`на вужчому екрані:\n${bad.join('\n')}`
		).toEqual([]);
	});

	it('колонки з вмістом уміють стискатися (§ 1)', () => {
		// `1fr` — це `minmax(auto, 1fr)`: колонка не стане вужчою за `min-content`
		// свого вмісту, і три такі не влізуть туди, куди мали б.
		const bad = hits(/repeat\(\s*[0-9]+\s*,\s*1fr\s*\)/g);
		expect(
			bad,
			`колонка не стиснеться менше за вміст — потрібен minmax(0, 1fr):\n${bad.join('\n')}`
		).toEqual([]);
	});

	it('вертикальні розміри міряються в dvh (§ 2)', () => {
		// `vh` на мобільному не враховує згортання панелі браузера: нижній край
		// лишається під нею, і саме там зазвичай кнопка.
		const bad = hits(/(?<![a-z-])[0-9.]+vh\b/g);
		expect(bad, `vh замість dvh:\n${bad.join('\n')}`).toEqual([]);
	});

	/**
	 * Компоненти, яким медіазапит ЗАКОННИЙ, — із причиною на кожен.
	 *
	 * Перелік лише скорочується. Спільне в усіх чотирьох одне: їхня власна
	 * ширина виведена з ширини вікна мінус константа, тож вікно тут і є
	 * «наявне місце», а не здогадка про нього.
	 */
	const VIEWPORT_MEDIA: Readonly<Record<string, string>> = {
		// Вікна: ширина задана як `min(Npx, 100vw − поля)`.
		'src/lib/components/player/RemoteDialog.svelte': 'вікно на всю ширину екрана',
		'src/lib/components/player/TrackDialog.svelte': 'вікно на всю ширину екрана',
		// Панель усередині `TrackDialog`: своєї ширини не має, бере вікнову.
		'src/lib/components/player/TriggerEditor.svelte': 'панель усередині вікна треку',
		// Дзеркалить поріг розкладки сторінки з `base.css` (900px): підказки
		// ховаються разом із переходом дошки в один стовпець.
		'src/lib/components/ui/HotkeyTips.svelte': 'поріг розкладки самої сторінки'
	};

	it('компонент міряє наявне місце, а не вікно (§ 7A, FS-CONTAINER)', () => {
		const bad = sources
			.filter(({ file }) => file.startsWith('src/lib/components/'))
			.filter(({ file }) => !(file in VIEWPORT_MEDIA))
			.flatMap(({ file, css }) =>
				[...css.matchAll(/@media[^{]*\((?:min|max)-width[^{]*\{/g)].map(
					(m) => `${at(file, css, m.index)}  ${m[0].replace(/\s+/g, ' ').trim()}`
				)
			);

		expect(
			bad,
			'медіазапит усередині компонента міряє ВІКНО, а компонент стоїть у ' +
				`колонці, у вікні або в панелі — потрібен @container:\n${bad.join('\n')}`
		).toEqual([]);
	});

	it('у переліку немає компонентів, які вже перейшли на @container', () => {
		// Прострочений виняток приховає наступний медіазапит у тому ж файлі.
		const stale = Object.keys(VIEWPORT_MEDIA).filter((file) => {
			const source = sources.find((entry) => entry.file === file);
			return !source || !/@media[^{]*\((?:min|max)-width/.test(source.css);
		});
		expect(stale, 'виняток більше не потрібен — прибрати з VIEWPORT_MEDIA').toEqual([]);
	});

	it('контейнерний запит має контейнер, оголошений у тому ж файлі (§ 7A)', () => {
		/*
		 * `@container` без жодного `container-type` поруч мовчки міряє найближчий
		 * контейнер ВИЩЕ — а якщо його немає, то вікно перегляду. Тобто запит
		 * виглядає контейнерним і поводиться як медіазапит, лише без слова
		 * «media» в коді.
		 *
		 * Перевірка файлова, як і `live-wiring`: контейнер може стояти й на
		 * батьківському компоненті, але тоді це навмисне рішення, і йому місце в
		 * цьому переліку, а не в мовчанні.
		 */
		const bad = sources
			.filter(({ css }) => /@container\s*\(/.test(css))
			.filter(({ css }) => !/container-type\s*:/.test(css))
			.map(({ file }) => file);

		expect(bad, `@container без container-type — міряє вікно:\n${bad.join('\n')}`).toEqual([]);
	});
});
