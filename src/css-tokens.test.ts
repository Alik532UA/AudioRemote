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

/**
 * Усі місця, де в цьому проєкті може стояти колір: власні стилі компонентів,
 * спільні таблиці й перший кадр в `app.html`.
 */
const STYLED = [...walk('src'), join('src', 'app.html')].filter((name) =>
	/\.(css|svelte|html)$/.test(name)
);

/**
 * Оголошення власної властивості — у БУДЬ-ЯКІЙ формі, а не лише в блоці CSS.
 *
 * `--track-color` задається інлайновим `style` із шаблонного рядка, тобто
 * оголошення там стоїть усередині лапок. Перевірка, яка цього не знає, назвала
 * б живий токен невідомим — і закінчилося б це її вимкненням, а не правкою.
 */
const DECLARED = /(?:^|[;{\s"'`])(--[\w-]+)\s*:/g;
const USED = /var\(\s*(--[\w-]+)/g;

/** Хто оголошений і хто вжитий — по всьому, що має стилі. */
function tokenCensus(): { declared: Map<string, string>; used: Map<string, string[]> } {
	const declared = new Map<string, string>();
	const used = new Map<string, string[]>();

	for (const file of STYLED) {
		const text = readFileSync(file, 'utf8');
		for (const match of text.matchAll(DECLARED)) {
			if (!declared.has(match[1])) declared.set(match[1], posix(file));
		}
		for (const match of text.matchAll(USED)) {
			used.set(match[1], [...(used.get(match[1]) ?? []), posix(file)]);
		}
	}

	return { declared, used };
}

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

	it('перевірка жива: токени знайдено в обидва боки', () => {
		// Порожній перепис означав би не «токенів немає», а «змінилася форма
		// запису» — і тоді обидва описи нижче зеленіли б, не подивившись.
		const { declared, used } = tokenCensus();
		expect(declared.size, 'жодного оголошеного токена').toBeGreaterThan(30);
		expect(used.size, 'жодного вжитого токена').toBeGreaterThan(30);
	});

	it('кожен var() має оголошення', () => {
		/*
		 * НЕВІДОМИЙ ТОКЕН НЕ Є ПОМИЛКОЮ ДЛЯ БРАУЗЕРА — і саме тому його треба
		 * ловити тут. `var(--bg-surfase)` з одруківкою робить властивість
		 * недійсною: елемент лишається без тла, консоль мовчить, складання
		 * проходить. Найчастіше так ламається ПЕРЕЙМЕНУВАННЯ: токен переїхав,
		 * половина місць переїхала разом із ним, а половина ні.
		 */
		const { declared, used } = tokenCensus();
		const unknown = [...used]
			.filter(([name]) => !declared.has(name))
			.map(([name, where]) => `${name} ← ${[...new Set(where)].join(', ')}`);

		expect(
			unknown,
			`var() без оголошення — властивість мовчки зникає:\n${unknown.join('\n')}`
		).toEqual([]);
	});

	it('кожен оголошений токен комусь потрібен', () => {
		/*
		 * ДЗЕРКАЛЬНИЙ БІК ТОГО САМОГО: токен, якого не питає ніхто, читається як
		 * частина палітри. Наступний читач бере його замість правильного, або
		 * навпаки — додає поруч ще один, бо цього «наче немає».
		 *
		 * Знайдено ним же: `--bg-header`, `--accent-hover`, `--warn-soft` і
		 * `--info` не вживалися ніде. Найдорожчим був останній: гейт контрасту
		 * чесно міряв пару для кольору, якого немає на жодному екрані, — тобто
		 * виглядав пильнішим, ніж був.
		 */
		const { declared, used } = tokenCensus();
		const dead = [...declared]
			.filter(([name]) => !used.has(name))
			.map(([name, file]) => `${name} ← ${file}`);

		expect(dead, `токен оголошено й не вжито ніде:\n${dead.join('\n')}`).toEqual([]);
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
