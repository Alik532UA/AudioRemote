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
 * ## Що тут розуміли неправильно ДВІЧІ
 *
 * Спершу стояло: «звузити походження неможливо, точніше за домен не обмежує ні
 * Tauri, ні сам GitHub» — як свідома межа, а не недогляд.
 *
 * Потім це визнали неправдою: `remote.urls` справді тлумачиться як
 * [URLPattern], схема Tauri наводить приклад `https://mydomain.dev/api/*`, а
 * `tauri-utils/src/acl/mod.rs` будує справжній `urlpattern::UrlPattern`. Межу
 * звузили до `https://alik532ua.github.io/AudioRemote/*`.
 *
 * І саме це зламало застосунок ЦІЛКОМ. `RemoteUrlPattern` справді розрізняє
 * шлях, але адресу на звірку йому подає не той, хто пише патерн: Tauri бере її
 * із ЗАГОЛОВКА `Origin` (`tauri-2.11.6/src/ipc/protocol.rs`), а заголовок
 * `Origin` за означенням не має шляху. Тобто на звірку приходить
 * `https://alik532ua.github.io/`, патерн зі шляхом не збігається ніколи, і
 * знімаються ВСІ дозволи разом: ні діалогу, ні файлів, ні оновлювача.
 *
 * Симптом не схожий на межу: кнопка «Обрати папку з музикою» просто нічого не
 * робить. Знайшлося це в журналі застосунку — `dialog.open not allowed on
 * window "main", URL: https://alik532ua.github.io/`.
 *
 * Отже межа тут — ПОХОДЖЕННЯ, і не тому, що ніхто не спробував інакше, а тому,
 * що більшого на звірку не приходить. Нижче звузити її коштувало б власного
 * домену.
 *
 * ## Що закриває те, чого не закриває походження
 *
 * GitHub Pages віддає з одного походження всі проєкти автора, тож capability їх
 * не розрізняє. Небезпечним це стає лише тоді, коли чужа сторінка опиняється в
 * ЦЬОМУ вебвʼю, — і саме це заборонено окремо: `on_navigation` у
 * `src-tauri/src/lib.rs` не пускає вебвʼю за межі `/AudioRemote/`.
 *
 * Саму межу (а не її написання) перевіряє прогоном модуль `remote_scope` там
 * же: він будує патерн ТИМ САМИМ типом і годує його САМЕ ПОХОДЖЕННЯМ, як це
 * робить застосунок. Текстовий гейт цього довести не може за побудовою.
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
	/*
	 * ОНОВЛЕННЯ ОБОЛОНКИ. Додані разом із каналом оновлення; чому канал узагалі
	 * знадобився — у `src/release.test.ts`.
	 *
	 * `updater:default` дає сторінці спитати «чи є нова версія» і поставити її.
	 * Ризик названо чесно: це дозвіл ЗАМІНИТИ ВСТАНОВЛЕНИЙ ЗАСТОСУНОК, тобто
	 * найсильніший у цьому переліку. Тримає його не ACL, а підпис: оновлювач
	 * приймає лише пакунок, підписаний приватним ключем, чия відкрита половина
	 * вшита в `tauri.conf.release.json`. Без підпису сторінка не може підсунути
	 * нічого, навіть маючи цей дозвіл.
	 *
	 * `process:allow-restart` — саме `allow-restart`, а НЕ `process:default`:
	 * типовий набір несе ще й `allow-exit`, тобто «закрити застосунок», якого
	 * тут не потрібно нікому. Перезапуск потрібен рівно один раз, після
	 * встановлення.
	 */
	'updater:default',
	'process:allow-restart',
	/*
	 * АВТОЗАПУСК РАЗОМ ІЗ СИСТЕМОЮ. Три команди замість `autostart:default`, і
	 * різниця тут не стилістична: типовий набір плагіна — це той самий перелік,
	 * але записаний так, що наступна його версія може мовчки додати четверту.
	 *
	 * Ризик названо: це запис у автозапуск системи, тобто застосунок
	 * зʼявлятиметься сам. Тримає його те, що вмикає його ЛЮДИНА в
	 * налаштуваннях, а типово він вимкнений; плагін сам не вмикає нічого.
	 */
	'autostart:allow-is-enabled',
	'autostart:allow-enable',
	'autostart:allow-disable',
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

	it('шляху в межі немає — він її не звужує, а вимикає', () => {
		/*
		 * ТУТ СТОЯЛО ПРОТИЛЕЖНЕ ПРАВИЛО, і воно коштувало працездатності
		 * застосунку.
		 *
		 * Міркування було таке: `https://alik532ua.github.io/*` — це весь
		 * GitHub Pages автора, отже межу треба звузити шляхом до
		 * `/AudioRemote/*`. Перша половина правдива, друга — ні, і не через
		 * стиль: Tauri бере адресу для звірки з ЗАГОЛОВКА `Origin`
		 * (`tauri-2.11.6/src/ipc/protocol.rs`), а заголовок `Origin` за
		 * означенням не має шляху. На звірку приходить
		 * `https://alik532ua.github.io/`, тож патерн зі шляхом не збігається
		 * НІКОЛИ — і знімає всі дозволи разом.
		 *
		 * Симптом не читається як межа: діалог вибору папки не відкривається, а
		 * в журналі застосунку лежить `dialog.open not allowed on window
		 * "main", URL: https://alik532ua.github.io/`.
		 *
		 * Тому правило перевернуте. Те, чого origin-межа не закриває (сторінка
		 * сусіднього проєкту, ЯКЩО вона опиниться в цьому вебвʼю), закривається
		 * не тут, а забороною вебвʼю виходити за `/AudioRemote/`.
		 */
		const scoped = shipped.flatMap((cap) =>
			(cap.body.remote?.urls ?? [])
				.filter((url) => {
					const path = url.replace(/^https:\/\/[^/]+/, '');
					return path !== '' && path !== '/' && path !== '/*';
				})
				.map((url) => `${cap.file}: ${url}`)
		);

		expect(
			scoped,
			'у межі названо шлях — на звірку приходить лише походження, тож жодна ' +
				'нативна команда не пройде й застосунок не працюватиме зовсім:\n' +
				scoped.join('\n')
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
		expect(libRs, 'перевірка більше не будує патерн тим самим типом, що й застосунок').toContain(
			'RemoteUrlPattern'
		);
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
		 *
		 * Адреса ПЕРЕЇХАЛА в `lib.rs` разом із самим вікном: `on_navigation`
		 * існує лише в будівника, вікну з `tauri.conf.json` його не додати.
		 * Тому читається вона звідти — з константи, а не з конфігу.
		 */
		const libRs = read('src-tauri/src/lib.rs');
		const appUrl = /const APP_URL: &str = "([^"]+)"/.exec(libRs)?.[1];
		expect(appUrl, 'у lib.rs немає APP_URL — адресу вікна більше ніхто не звіряє').toBeTruthy();

		const origins = shipped
			.flatMap((cap) => cap.body.remote?.urls ?? [])
			.map((url) => url.replace(/^(https:\/\/[^/]+).*$/, '$1'));

		expect(
			origins.some((origin) => (appUrl ?? '').startsWith(origin)),
			`вікно йде на ${appUrl}, де в нього немає дозволів`
		).toBe(true);

		// Конфіг не мусить оголошувати вікно вдруге: було б два вікна, і друге —
		// без заборони навігації.
		const windows = (
			JSON.parse(read('src-tauri/tauri.conf.json')) as { app?: { windows?: unknown[] } }
		).app?.windows;
		expect(
			windows ?? [],
			'вікно оголошене й у конфігу: відкриються два, і те, що з конфігу, ' +
				'не має `on_navigation`'
		).toEqual([]);
	});

	it('вебвʼю не випускають за межі застосунку', () => {
		/*
		 * ДРУГА ПОЛОВИНА МЕЖІ, і без неї перша нічого не варта.
		 *
		 * Дозволи видані ПОХОДЖЕННЮ (інакше не буває, див. докблок), а
		 * походження в GitHub Pages спільне для всіх проєктів автора. Отже
		 * єдине місце, де «наша сторінка» ще відрізняється від «сусідньої», —
		 * рішення, куди вебвʼю взагалі можна піти.
		 *
		 * Тут перевіряється лише те, що рішення не зникло: `cargo` у `npm test`
		 * не запускається (Rust стоїть не всюди), тож мовчазне видалення
		 * лишилося б непоміченим, а зовні виглядало б як «нічого не змінилося».
		 */
		const libRs = read('src-tauri/src/lib.rs');

		expect(libRs, 'зник обмежувач навігації — вебвʼю пустять на сусідній проєкт').toContain(
			'.on_navigation(stays_in_app)'
		);
		expect(libRs, 'зникла перевірка самої межі навігації').toContain('mod navigation');
		expect(libRs, 'межа навігації більше не тримається на шляху застосунку').toContain(
			'const APP_PREFIX'
		);
	});
});
