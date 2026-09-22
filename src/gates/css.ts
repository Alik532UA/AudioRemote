import { read, walk } from './fs';

/**
 * ЧИТАННЯ СТИЛІВ ДЛЯ ГЕЙТІВ — так само один раз, як і обхід дерева у `fs.ts`.
 *
 * ## Чому стилі окремо від файлів
 *
 * Гейт, що дивиться на CSS, не може просто взяти вміст `.svelte`: там
 * розмітка, словники й скрипт, у яких трапляється рівно той текст, який він
 * шукає. `repeat(3, 1fr)` у рядку підказки, `transition` у назві поля — усе це
 * зарахувалося б за стиль.
 *
 * Тому тут дві операції, і обидві мусять бути ОДНІ на всі гейти:
 *
 * 1. лишити з `.svelte` тільки вміст `<style>`;
 * 2. прибрати коментарі — бо коментар, що пояснює анти-патерн, зобов'язаний
 *    його процитувати, і перший же прогін падав би на власній документації.
 *
 * ## Чому заміна ПРОБІЛАМИ, а не вирізання
 *
 * І викинутий скрипт, і викинутий коментар лишають по собі рівно стільки
 * пробілів, скільки було символів, і всі переводи рядка. Інакше номер рядка у
 * звіті вказував би не на те місце, і кожну знахідку довелося б шукати руками —
 * а гейт, знахідки якого незручно перевіряти, вимикають.
 */

/** Той самий текст завдовжки, але без нічого, крім переводів рядка. */
export const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/** Коментарі CSS і HTML — пробілами. */
export const withoutComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank);

export interface CssSource {
	file: string;
	/** Лише CSS: для `.svelte` це вміст `<style>`, для `.css` — весь файл. */
	css: string;
}

/** Усі стилі проєкту, з номерами рядків, які збігаються з файлом на диску. */
export function cssSources(dir = 'src'): CssSource[] {
	return walk(dir)
		.filter((file) => /\.(svelte|css)$/.test(file))
		.map((file) => {
			const text = withoutComments(read(file));
			if (!file.endsWith('.svelte')) return { file, css: text };

			let css = blank(text);
			for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
				const at = match.index + match[0].indexOf(match[1]);
				css = css.slice(0, at) + match[1] + css.slice(at + match[1].length);
			}
			return { file, css };
		});
}

/** Місце знахідки в тому вигляді, у якому його клацають у терміналі. */
export const at = (file: string, css: string, index: number): string =>
	`${file}:${css.slice(0, index).split('\n').length}`;
