import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `light-dark()` — ЛИШЕ ДЛЯ КОЛЬОРІВ, і саме це тут стережеться.
 *
 * Функція приймає два КОЛЬОРИ. Поставлена у властивість, яка чекає довжину,
 * тінь, градієнт чи `url()`, вона не «повертає перше значення» — уся
 * властивість стає недійсною й зникає. Елемент просто лишається без тіні або
 * без фонового зображення.
 *
 * Симптому немає ніякого: сторінка малюється, консоль мовчить, жоден інший
 * гейт цього не бачить. Помічають таке через тиждень і зазвичай випадково.
 *
 * Правило, яке це ловить, просте: `light-dark(` дозволена лише в оголошенні
 * ВЛАСНОЇ властивості (`--щось: …`). Токен із двома кольорами всередині —
 * законний; складені властивості беруть готовий колірний токен через `var()`.
 */
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});

const posix = (path: string): string => path.split(sep).join('/');

/** Рядок-оголошення: `властивість: значення`. Коментарі сюди не потрапляють. */
const DECLARATION = /^\s*([\w-]+)\s*:\s*([^;]*light-dark\()/gm;

describe('токени тем', () => {
	it('light-dark() стоїть лише у власних властивостях', () => {
		const offenders: string[] = [];

		for (const file of walk('src').filter((name) => name.endsWith('.css'))) {
			const css = readFileSync(file, 'utf8');
			for (const match of css.matchAll(DECLARATION)) {
				const property = match[1];
				if (!property.startsWith('--')) offenders.push(`${posix(file)}: ${property}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('color-scheme оголошується лише для html, ніколи для body', () => {
		/*
		 * ЗАМІРЯНО В БРАУЗЕРІ, А НЕ ВИГАДАНО.
		 *
		 * `color-scheme` успадковується, а перемикач ставить `data-theme` на
		 * <html>. Доки інлайн-стиль `app.html` оголошував схему й для `body`,
		 * у <body> була ВЛАСНА `light dark`, яка перекривала успадковану: <html>
		 * ставав світлим, а <body> — той, що малює фон сторінки, — далі питав
		 * системну перевагу й лишався темним.
		 *
		 * Симптом найгірший із можливих: тема «перемикається» (атрибут є,
		 * сховище записане, кнопка світиться), а сторінка кольору не міняє.
		 */
		const sources = [
			readFileSync(join('src', 'app.html'), 'utf8'),
			...walk(join('src', 'lib', 'css')).map((file) => readFileSync(file, 'utf8'))
		];

		const offenders: string[] = [];
		for (const source of sources) {
			// Селектор перед блоком, у якому оголошено color-scheme.
			for (const match of source.matchAll(/([^{}]+)\{[^{}]*color-scheme\s*:/g)) {
				const selector = match[1].replace(/\s+/g, ' ').trim();
				if (/(^|[\s,>+~])body\b/.test(selector)) offenders.push(selector);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('обидві теми оголошують схему явно', () => {
		/*
		 * Без `color-scheme` функція `light-dark()` мовчки віддає ПЕРШИЙ
		 * аргумент — тобто світлу палітру в темній темі, і жодної помилки при
		 * цьому не буде.
		 *
		 * `only light` для світлої теми — окрема вимога: Android Chrome із темною
		 * темою браузера перефарбовує сторінки, які вважає світлими, і саме голе
		 * `light` дає йому підставу це зробити.
		 */
		const tokens = readFileSync(join('src', 'lib', 'css', 'base', 'tokens.css'), 'utf8');

		expect(tokens).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark/);
		expect(tokens).toMatch(/\[data-theme='light'\]\s*\{\s*color-scheme:\s*only light/);
		expect(tokens).toMatch(/\[data-theme='dark'\]\s*\{\s*color-scheme:\s*dark/);
	});
});
