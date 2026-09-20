// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config, { asBrowserSees } from '../svelte.config.js';

/**
 * ХЕШ ІНЛАЙН-СКРИПТА В CSP ЗБІГАЄТЬСЯ З ТИМ, ЩО ОБЧИСЛИТЬ БРАУЗЕР
 * (SECURITY-v9 § 6.3, `SEC-CSP-HASH-EOL`, HIGH).
 *
 * ## Навіщо це окремою перевіркою
 *
 * Хеш тут рахується з `src/app.html`, а не вписаний рядком, — і цього все одно
 * недосить. Браузер хешує не байти файлу, а текстовий вузол `<script>` ПІСЛЯ
 * розбору HTML, а розбір нормалізує `\r\n` і одиночний `\r` у `\n`
 * («preprocessing the input stream» у HTML Standard). Тобто файл, збережений із
 * CRLF — редактором повз git або на машині з `core.autocrlf`, — дає хеш, якого
 * браузер не приймає, і скрипт першого кадру блокується ЦІЛКОМ.
 *
 * Ціна саме тут вища, ніж здається: цей скрипт ставить тему до першого кадру.
 * Заблокований, він дає не помилку, а мигання — темна сторінка на світлій
 * системній темі й навпаки. Симптом, який шукають у CSS тижнями.
 *
 * ## Чому юніт, а не перевірка над зібраним сайтом
 *
 * На Linux (CI, продакшн) файл із LF, хеші збігаються, дефекту немає. Тобто
 * перевірка в CI була б зелена рівно там, де перевіряти нічого, і не
 * запускалася б там, де дефект живе, — на машині розробника
 * (AI-AGENT-PITFALLS-v9 § 1.4).
 */

const sha256 = (text: string): string =>
	`sha256-${createHash('sha256').update(text).digest('base64')}`;

/** Інлайн-скрипти `app.html` — саме ті, що потребують хеша. */
function inlineScripts(): string[] {
	const html = readFileSync('src/app.html', 'utf8');
	return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** Хеші зі зібраного конфігу — те, що справді поїде в політику. */
const cspHashes: string[] = (
	(config as { kit?: { csp?: { directives?: Record<string, string[]> } } }).kit?.csp?.directives?.[
		'script-src'
	] ?? []
).filter((value) => typeof value === 'string' && value.startsWith('sha256-'));

describe('CSP: хеш інлайн-скрипта (SECURITY-v9 § 6.3)', () => {
	it('перевірка жива: інлайн-скрипт знайдено і в політиці є sha256', () => {
		expect(
			inlineScripts().length,
			'у app.html немає інлайн-скриптів — хешувати нічого'
		).toBeGreaterThan(0);
		expect(cspHashes.length, 'у script-src немає жодного sha256').toBeGreaterThan(0);
	});

	it('кожен інлайн-скрипт має в політиці свій браузерний хеш', () => {
		const missing = inlineScripts()
			.map((body) => sha256(asBrowserSees(body)))
			.filter((hash) => !cspHashes.includes(hash));
		expect(
			missing,
			`браузер вимагає ${missing.join(', ')}, а в script-src лежить ${cspHashes.join(', ')}. ` +
				'Якщо різниця лише в переносах рядків — хеш обчислено над CRLF.'
		).toEqual([]);
	});

	it('хеш над CRLF у політику НЕ потрапляє', () => {
		// Дзеркальна половина: без неї перевірка вище лишалася б зеленою, навіть
		// якби в політику поїхали ОБИДВА хеші — і правильний, і зайвий.
		const crlf = inlineScripts()
			.filter((body) => body.includes('\r'))
			.map((body) => sha256(body))
			.filter((hash) => cspHashes.includes(hash));
		expect(crlf, `у script-src лежить хеш над CRLF (${crlf.join(', ')})`).toEqual([]);
	});
});

describe('вердикт не залежить від переносів рядків', () => {
	const withCrlf = "(function () {\r\n\tconst t = 'x';\r\n})();\r\n";
	const withLf = withCrlf.replace(/\r\n/g, '\n');

	it('перевірка жива: сирі байти CRLF і LF дають РІЗНІ хеші', () => {
		expect(sha256(withCrlf)).not.toEqual(sha256(withLf));
	});

	it('після нормалізації той самий скрипт дає той самий хеш', () => {
		expect(sha256(asBrowserSees(withCrlf))).toEqual(sha256(asBrowserSees(withLf)));
	});

	it('одиночний CR теж стає LF — так робить розбір HTML', () => {
		expect(asBrowserSees('a\rb')).toEqual('a\nb');
	});

	it('гейт над build/ хешує через ту саму функцію', () => {
		/*
		 * `.gitattributes` до `build/` не дістає за побудовою — тека не
		 * відстежується, тож нормалізувати її git не може. Якщо гейт хешує сирі
		 * байти зібраного HTML, на Windows-дереві він червонітиме на збірці, у
		 * якій політика правильна, а в CI на тому самому коміті буде зелений.
		 */
		const source = readFileSync('scripts/check-build.mjs', 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		const hashing = source.split('\n').filter((line) => line.includes("createHash('sha256')"));

		expect(
			hashing.length,
			'у check-build.mjs зник виклик createHash — гейт більше не звіряє хеші'
		).toBeGreaterThan(0);
		expect(
			hashing.filter((line) => !line.includes('asBrowserSees(')),
			'ці рядки хешують сирий текст зібраного HTML'
		).toEqual([]);
	});
});
