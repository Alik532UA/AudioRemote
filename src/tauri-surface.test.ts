// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ПОВЕРХНЯ ЗАСТОСУНКУ ДЛЯ КОМПʼЮТЕРА (SECURITY-v9 § 6, `SEC-NATIVE-SCOPE`).
 *
 * ## Чому це найгостріше місце проєкту
 *
 * У браузері сторінка не має доступу до диска: File System Access питає
 * людину, і дозвіл живе рівно доти, доки жива вкладка. У застосунку інакше —
 * там `fs:allow-read-file` і `fs:allow-write-text-file` видані НАЗАВЖДИ й
 * видані не файлу в exe, а СТОРІНЦІ З МЕРЕЖІ. Тобто межа тут не «що вміє наш
 * код», а «чий код вважається нашим».
 *
 * Відповідає на це рівно один рядок — `remote.urls`. Усе, що в нього
 * потрапило, отримує читання й запис файлів на машині, де стоїть плеєр.
 *
 * ## Що саме тут сталося
 *
 * У переліку лежав `http://localhost:5173/*`, і не використовувало його
 * НІЩО: у `tauri.conf.json` немає `devUrl`, збірка фронтенду в
 * `rebuild-exe.mjs` не бере участі взагалі, у документах порт не згадується.
 * Тобто це була не ціна робочого процесу, а забутий рядок — але у
 * встановленому застосунку він означав, що будь-що, здатне зайняти порт 5173
 * на цій машині, читає й пише файли від імені плеєра.
 *
 * ## Що тут було написано неправильно
 *
 * Доти в цьому докблоці стояло: «звузити походження неможливо, точніше за
 * домен не обмежує ні Tauri, ні сам GitHub», і те саме повторював § 5
 * `PROJECT-CONTEXT.md` — як свідома межа, а не недогляд.
 *
 * Неправда. `remote.urls` тлумачиться як [URLPattern], і шлях у ньому працює:
 * схема Tauri прямо наводить приклад `https://mydomain.dev/api/*`, а
 * `tauri-utils/src/acl/mod.rs` будує справжній `urlpattern::UrlPattern` і
 * звіряє ПОВНУ адресу. Тобто весь час, поки тут стояв
 * `https://alik532ua.github.io/*`, читання й запис файлів на машині з плеєром
 * мав кожен сусідній проєкт автора — і причиною було не обмеження Tauri, а це
 * речення.
 *
 * Тепер межа — `https://alik532ua.github.io/AudioRemote/*`.
 *
 * ## Чому шлях перевіряється окремим правилом
 *
 * Через тиху деталь у `RemoteUrlPattern::from_str`: якщо шлях у патерні
 * порожній або дорівнює `/`, він МОВЧКИ замінюється на `*`. Тобто
 * `https://host` і `https://host/` означають «весь домен», а виглядають як
 * точна адреса — і різниці в тексті конфігу не видно. Звідси правило «шлях
 * назвали, і він не самий лише слеш».
 *
 * Саму межу (а не її написання) перевіряє прогоном модуль `remote_scope` у
 * `src-tauri/src/lib.rs`: він будує патерн ТИМ САМИМ типом, що судить у
 * застосунку, і вимагає, щоб `/Slovko/`, `/MindStep/` і корінь домену не
 * підпадали. Текстовий гейт цього довести не може за побудовою.
 *
 * [URLPattern]: https://urlpattern.spec.whatwg.org/
 *
 * Перевірка текстова й коштує мілісекунди. Справжню збірку робить `cargo`, і
 * вона тут не запускається: Rust стоїть не всюди, а помилка в цьому файлі
 * коштує стільки, що чекати на неї до збірки не можна.
 */

const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const CAPS_DIR = 'src-tauri/capabilities';

interface Capability {
	identifier: string;
	description?: string;
	remote?: { urls?: string[] };
	permissions?: string[];
}

const files = readdirSync(join(ROOT, CAPS_DIR)).filter((name) => name.endsWith('.json'));
const caps = files.map((name) => ({
	file: `${CAPS_DIR}/${name}`,
	body: JSON.parse(read(`${CAPS_DIR}/${name}`)) as Capability
}));

const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as {
	app?: { security?: { capabilities?: string[] } };
};

/**
 * Які саме capability потрапляють у exe.
 *
 * Порожній перелік у конфігу означає «всі файли з теки» — тобто новий файл
 * поруч поїхав би у збірку сам собою. Тому тут це не «нічого», а «всі».
 */
const shipped = (() => {
	const named = conf.app?.security?.capabilities ?? [];
	return named.length === 0 ? caps : caps.filter((cap) => named.includes(cap.body.identifier));
})();

/**
 * ДОЗВОЛИ, ЯКІ СЬОГОДНІ ВИДАНІ, — ПЕРЕЛІКОМ, А НЕ ПРАВИЛОМ.
 *
 * Правило «нічого зайвого» неможливо записати: що зайве, вирішує задача.
 * Перелік працює інакше — він робить додавання ПОМІТНИМ. Новий `fs:allow-*`
 * валить прогін, і той, хто його додав, мусить назвати причину в описі
 * коміту. Саме цього бракувало рядку з `localhost`.
 */
const GRANTED = new Set([
	'allow-folder',
	'core:default',
	'dialog:default',
	'dialog:allow-open',
	'fs:default',
	'fs:allow-exists',
	'fs:allow-read-dir',
	'fs:allow-read-file',
	'fs:allow-read-text-file',
	'fs:allow-write-text-file'
]);

describe('поверхня застосунку для компʼютера (SEC-NATIVE-SCOPE)', () => {
	it('перевірка жива: capability знайдено й розібрано', () => {
		expect(caps.length, 'жодного файлу capability — сканер дивиться не туди').toBeGreaterThan(0);
		expect(shipped.length, 'жодна capability не їде у збірку — перевіряти нічого').toBeGreaterThan(
			0
		);
		expect(
			shipped.flatMap((cap) => cap.body.remote?.urls ?? []).length,
			'у жодної capability немає remote.urls — форма файлу змінилася'
		).toBeGreaterThan(0);
	});

	it('жодного походження поза https', () => {
		/*
		 * `http:` тут — не «менш безпечно», а зовсім інша річ: вміст такої
		 * адреси підміняє будь-хто в тій самій мережі, і підмінений вміст
		 * отримує читання й запис файлів.
		 */
		const insecure = shipped.flatMap((cap) =>
			(cap.body.remote?.urls ?? [])
				.filter((url) => !url.startsWith('https://'))
				.map((url) => `${cap.file}: ${url}`)
		);

		expect(insecure, `походження не через https:\n${insecure.join('\n')}`).toEqual([]);
	});

	it('жодного локального походження у збірці', () => {
		// Порт на цій машині може зайняти будь-що — і воно стає «своєю»
		// сторінкою з правами на диск.
		const local = shipped.flatMap((cap) =>
			(cap.body.remote?.urls ?? [])
				.filter((url) => /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(url))
				.map((url) => `${cap.file}: ${url}`)
		);

		expect(
			local,
			'локальне походження у ВСТАНОВЛЕНОМУ застосунку віддає файли будь-чому, ' +
				`що зайняло цей порт:\n${local.join('\n')}`
		).toEqual([]);
	});

	it('походження назване доменом, а не самою лише схемою', () => {
		/*
		 * `https://*` або `https://*.github.io/*` — це вже не межа: перший дає
		 * всю мережу, другий — усі чужі сторінки на спільному хостингу.
		 */
		const wide = shipped.flatMap((cap) =>
			(cap.body.remote?.urls ?? [])
				.filter((url) => {
					const host = url.replace(/^https:\/\//, '').split('/')[0];
					return host === '' || host.startsWith('*');
				})
				.map((url) => `${cap.file}: ${url}`)
		);

		expect(wide, `походження без конкретного домену:\n${wide.join('\n')}`).toEqual([]);
	});

	it('шлях назвали — домену самого по собі мало', () => {
		/*
		 * ЦЕ Й БУЛА ДІРКА, яка жила тут найдовше: `https://alik532ua.github.io/*`
		 * означає весь GitHub Pages автора, тобто кожен його проєкт, а разом із
		 * ним — читання й запис файлів на машині з плеєром.
		 *
		 * Правило дивиться на ШЛЯХ, і причина саме в тому, як його тлумачить
		 * Tauri: порожній шлях і самий слеш він МОВЧКИ замінює на `*`. Тому
		 * `https://host`, `https://host/` і `https://host/*` — це три написання
		 * того самого «весь домен», і жодне з них не видно як дірку в тексті
		 * конфігу.
		 *
		 * Межа мусить називати сам застосунок: `/AudioRemote/*`.
		 */
		const bare = shipped.flatMap((cap) =>
			(cap.body.remote?.urls ?? [])
				.filter((url) => {
					const path = url.replace(/^https:\/\/[^/]+/, '');
					return path === '' || path === '/' || path === '/*';
				})
				.map((url) => `${cap.file}: ${url}`)
		);

		expect(
			bare,
			'межа названа доменом без шляху — це ВЕСЬ спільний хостинг, тобто кожен ' +
				'сусідній проєкт дістає доступ до диска. Назвіть шлях застосунку:\n' +
				bare.join('\n')
		).toEqual([]);
	});

	it('межу перевіряє ще й прогін на Rust, а не лише цей файл', () => {
		/*
		 * Текстова перевірка не може довести, ЩО САМЕ патерн пропускає: для
		 * цього треба побудувати його тим кодом, який судитиме в застосунку.
		 * Такий прогін є (`remote_scope` у `src-tauri/src/lib.rs`), і без нього
		 * правило про шлях вище трималося б на тлумаченні документації.
		 *
		 * Тут перевіряється лише те, що він не зник: `cargo` у `npm test` не
		 * запускається (Rust стоїть не всюди), тож мовчазне видалення того
		 * модуля інакше лишилося б непоміченим.
		 */
		const libRs = read('src-tauri/src/lib.rs');
		expect(
			libRs,
			'зник модуль remote_scope — межу capability більше ніщо не перевіряє прогоном'
		).toContain('mod remote_scope');
		expect(
			libRs,
			'перевірка більше не будує патерн тим самим типом, що й застосунок'
		).toContain('RemoteUrlPattern');
		expect(
			read('src-tauri/Cargo.toml'),
			'tauri-utils зник із dev-залежностей — перевірка межі не збереться'
		).toContain('tauri-utils');
	});

	it('нових дозволів не додали мовчки', () => {
		const extra = shipped.flatMap((cap) =>
			(cap.body.permissions ?? [])
				.filter((permission) => !GRANTED.has(permission))
				.map((permission) => `${cap.file}: ${permission}`)
		);

		expect(
			extra,
			'дозвіл, якого не було: назвіть причину в описі коміту й допишіть його ' +
				`до GRANTED:\n${extra.join('\n')}`
		).toEqual([]);
	});

	it('у переліку дозволів немає прострочених рядків', () => {
		// Дозвіл, знятий із capability й забутий тут, приховає наступне додавання.
		const live = new Set(shipped.flatMap((cap) => cap.body.permissions ?? []));
		const stale = [...GRANTED].filter((permission) => !live.has(permission));

		expect(stale, `дозвіл більше не виданий, приберіть із GRANTED: ${stale.join(', ')}`).toEqual(
			[]
		);
	});

	it('вікно застосунку йде туди ж, куди дозволено', () => {
		/*
		 * Адреса вікна й перелік походжень — два різні місця, і розходяться вони
		 * тихо: вікно відкривається, сторінка працює, а команди застосунку
		 * відповідають «not allowed». Виглядає це як зламаний плеєр, а не як
		 * розбіжність у конфігу.
		 */
		const windows = (
			JSON.parse(read('src-tauri/tauri.conf.json')) as {
				app?: { windows?: { url?: string }[] };
			}
		).app?.windows;

		const urls = shipped.flatMap((cap) => cap.body.remote?.urls ?? []);
		const origins = urls.map((url) => url.replace(/^(https:\/\/[^/]+).*$/, '$1'));

		const strays = (windows ?? [])
			.map((window) => window.url)
			.filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url))
			.filter((url) => !origins.some((origin) => url.startsWith(origin)));

		expect(strays, `вікно йде туди, де в нього немає дозволів: ${strays.join(', ')}`).toEqual([]);
	});
});
