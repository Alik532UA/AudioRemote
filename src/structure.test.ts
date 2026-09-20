// @vitest-environment node
// Перевірка лише читає файли — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * ІНВАРІАНТИ СТРУКТУРИ (PROJECT-STRUCTURE-v9 § 4, § 7, `PS-REACHABILITY`,
 * `PS-STATIC-ORPHANS`, `PS-SIZE-RATCHET`).
 *
 * Найдорожче тут — сирота: файл, який існує, читається як зроблена робота.
 * Наступний читач (зокрема наступний агент) вважає функцію реалізованою, править
 * її, посилається на неї — а вона не виконується ніколи. Компілятор про це не
 * скаже нічого, `svelte-check` теж: незатребуваний модуль для них не помилка.
 *
 * ДОСЯЖНІСТЬ ДОВОДИТЬСЯ ГРАФОМ ІМПОРТІВ, А НЕ ПОШУКОМ ІМЕНІ ФАЙЛУ. Канон
 * називає саме пошук імені непридатним (§ 4.3.1): ланцюжок сиріт, де мертвий
 * `a.ts` імпортує мертвий `b.ts`, для греп-перевірки виглядає живим — а живим
 * не є жоден із двох. Те саме робить згадка імені в коментарі.
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
 */

const ROOT = process.cwd().split('\\').join('/');
const IGNORED_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dev-dist', 'target', 'gen']);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (IGNORED_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full.split('\\').join('/'));
	}
	return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const isTest = (file: string): boolean => /\.(test|spec)\.ts$/.test(file);

const all = walk('src');
const sources = all.filter((f) => /\.(ts|svelte)$/.test(f) && !isTest(f) && !f.endsWith('.d.ts'));

/**
 * Файли-дані: словники й перелік слів для паролів.
 *
 * Межа розміру стереже складність, а тут її немає — це таблиця, і кожен новий
 * рядок у ній коштує рівно одного рядка. Під загальною межею вони давали б
 * постійний борг, який нічого не означає (PERFORMANCE-v9 § 1.1 про те саме
 * розділення коду й даних).
 */
const DATA_FILE = /^src\/lib\/(i18n\/(uk|en)\.ts|board\/words\.ts)$/;

describe('структура проєкту (PROJECT-STRUCTURE-v9)', () => {
	it('перевірка жива: джерела знайдено', () => {
		expect(sources.length, 'сканер не бачить джерел — далі все зелене дарма').toBeGreaterThan(40);
	});

	it('руни лише у .svelte та .svelte.ts', () => {
		// Компілятор не обробляє руни поза цими розширеннями: код виглядає
		// правильним і мовчки не реагує ні на що — жодного попередження.
		const bad = all
			.filter((f) => f.endsWith('.ts') && !f.endsWith('.svelte.ts') && !isTest(f))
			.filter((f) => /\$state[({<]|\$derived[({<]|\$effect[({.]/.test(read(f)));
		expect(bad, `руни у звичайному .ts: ${bad.join(', ')}`).toEqual([]);
	});

	it('псевдонім імпорту збігається з іменем файлу', () => {
		// Розбіжність виникає після перейменувань і тихо руйнує зв'язок
		// «локатор ↔ компонент ↔ файл», на якому тримається пошук за назвою.
		const re = /import\s+([A-Z][A-Za-z0-9]*)\s+from\s+["'][^"']*\/([A-Z][A-Za-z0-9]*)\.svelte["']/g;
		const bad: string[] = [];
		for (const file of sources) {
			for (const m of read(file).matchAll(re)) {
				if (m[1] !== m[2]) bad.push(`${file}: ${m[1]} → ${m[2]}.svelte`);
			}
		}
		expect(bad, `псевдонім не збігається з файлом:\n${bad.join('\n')}`).toEqual([]);
	});
});

// ─── Досяжність графом імпортів ───────────────────────────────────────────

/**
 * Точки входу — маршрути SvelteKit. Усе інше має бути досяжним звідси.
 *
 * `src/app.html` і `src/app.d.ts` не імпортують нічого й тому точками входу не
 * є: перший — шаблон, другий — оголошення типів.
 */
const ENTRIES = sources.filter((f) => /^src\/routes\//.test(f));

function resolveImport(from: string, spec: string): string | null {
	let base: string;
	if (spec.startsWith('$lib/')) base = `src/lib/${spec.slice(5)}`;
	else if (spec.startsWith('./') || spec.startsWith('../')) {
		base = resolve(dirname(from), spec).split('\\').join('/').replace(`${ROOT}/`, '');
	} else return null; // пакет із node_modules або $app/* — не наш файл

	const candidates = [
		base,
		`${base}.ts`,
		`${base}.svelte`,
		`${base}.svelte.ts`,
		`${base}/index.ts`
	];
	return candidates.find((candidate) => sources.includes(candidate)) ?? null;
}

const reachable = new Set<string>();
function visit(file: string): void {
	if (reachable.has(file)) return;
	reachable.add(file);
	// І статичний `from '…'`, і динамічний `import('…')`: SDK бази приїжджає
	// саме другим способом, і без нього пів мережевого шару виглядало б мертвим.
	for (const m of read(file).matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)) {
		const target = resolveImport(file, m[1] ?? m[2]);
		if (target) visit(target);
	}
}
ENTRIES.forEach(visit);

describe('досяжність модулів (§ 4.3.1, PS-REACHABILITY)', () => {
	it('перевірка жива: точки входу знайдено й граф побудовано', () => {
		expect(ENTRIES.length, 'жодного маршруту — граф порожній').toBeGreaterThan(3);
		expect(
			reachable.size,
			'граф не розрісся далі точок входу — розбір імпортів зламався'
		).toBeGreaterThan(ENTRIES.length * 2);
	});

	it('кожен модуль досяжний з маршруту', () => {
		const orphans = sources.filter((file) => !reachable.has(file));
		expect(
			orphans,
			'модуль не досяжний із жодного маршруту — він не виконується, ' +
				`але читається як зроблена робота:\n${orphans.join('\n')}`
		).toEqual([]);
	});
});

// ─── Сироти в static/ ─────────────────────────────────────────────────────

/**
 * Файл у `static/`, на який не посилається ніхто.
 *
 * `adapter-static` копіює цю теку на хостинг цілком і мовчки: чернетка значка,
 * лишена там на день, їде у продакшн назавжди й потрапляє в передкеш воркера.
 */
const STATIC_EXCEPTIONS = new Set<string>([
	// Порожній файл-прапорець: вимога GitHub Pages, щоб Jekyll не з'їдав теки з
	// підкресленням. Посилатися на нього нікому й нема чого.
	'.nojekyll'
]);

describe('сироти в static/ (§ 2.1, PS-STATIC-ORPHANS)', () => {
	const assets = readdirSync('static');
	const haystack = [...walk('src'), ...walk('scripts'), 'vite.config.ts', 'svelte.config.js']
		.filter((f) => /\.(ts|svelte|mjs|js|html|json)$/.test(f))
		.map(read)
		.join('\n');

	it('перевірка жива: файли static/ і джерела прочитано', () => {
		expect(assets.length, 'static/ порожня — перевіряти нема що').toBeGreaterThan(2);
		expect(haystack.length, 'джерела не прочитані').toBeGreaterThan(10_000);
	});

	it('на кожен файл хтось посилається', () => {
		const orphans = assets
			.filter((name) => !STATIC_EXCEPTIONS.has(name))
			.filter((name) => !haystack.includes(name));
		expect(orphans, `ніхто не просить, а на хостинг їде: ${orphans.join(', ')}`).toEqual([]);
	});
});

// ─── Ратчет розміру ───────────────────────────────────────────────────────

/**
 * ПЕРЕВИЩЕННЯ ЖИВУТЬ ПЕРЕЛІКОМ ЗІ СТЕЛЕЮ НА КОЖЕН ФАЙЛ, А НЕ ЧИСЛОМ У ПРОЗІ
 * (`PS-SIZE-RATCHET`).
 *
 * Стеля тут — ЗАМІРЯНИЙ розмір на день постановки гейта, а не бажаний. Так
 * перелік працює як ратчет: файл може лише скорочуватися, новий великий файл
 * валить прогін, а виправлений — вимагає прибрати рядок звідси тим самим
 * комітом. Число «у нас N завеликих файлів» у документації не пишеться: воно
 * застаріває мовчки, а перелік друкує сам прогін.
 *
 * Дві сторінки-гіганти (`player` і `remote`) — це відомий борг, а не недогляд:
 * обидві тримають розкладку, діалоги й гарячі клавіші однієї ролі.
 */
const OVERSIZED_ALLOWLIST: Readonly<Record<string, number>> = {
	// Три стелі нижче піднімалися рівно раз — на рядок `aria-label` у повзунках
	// перемотки й полях розкладу. Підняття стелі законне лише так: зі своєю
	// причиною в описі коміту. Без причини ратчет перестає бути ратчетом за
	// один коміт.
	'src/routes/player/+page.svelte': 885,
	'src/routes/remote/+page.svelte': 862,
	'src/lib/player/controller.svelte.ts': 541,
	'src/lib/components/settings/SettingsPanel.svelte': 521,
	'src/lib/components/player/TriggerEditor.svelte': 415,
	'src/lib/components/player/TrackDialog.svelte': 326,
	// 329 → 331: по рядку `intent += 1` у `pause()` і `resume()`. Обидві команди
	// теж кажуть, що має звучати зараз, а лічильник піднімали лише «стоп»,
	// запуск і вихід — тобто пауза під час читання файлу гасила старий звук, і
	// новий трек починав грати сам. Коротше, ніж рядком на команду, не виходить.
	'src/lib/audio/engine.svelte.ts': 331
};

describe('розмір файлу (§ 7.1, PS-SIZE-RATCHET)', () => {
	const LIMITS: [RegExp, number][] = [
		[/\/routes\/.*\+page\.svelte$/, 400],
		[/\.svelte$/, 300],
		[/\.svelte\.ts$/, 300],
		[/\.ts$/, 250]
	];

	/** Рядки без коментарів і порожніх: тут міряється складність, а не проза. */
	const countSloc = (file: string): number =>
		read(file)
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '')
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0).length;

	const measured = sources
		.filter((file) => !DATA_FILE.test(file))
		.map((file) => ({
			file,
			lines: countSloc(file),
			limit: LIMITS.find(([re]) => re.test(file))?.[1] ?? Infinity
		}));

	it('нових перевищень немає', () => {
		const unexpected = measured
			.filter(({ file, lines, limit }) => lines > limit && !(file in OVERSIZED_ALLOWLIST))
			.map(({ file, lines, limit }) => `${file}: ${lines} рядків (межа ${limit})`);
		expect(unexpected, `завеликі файли:\n${unexpected.join('\n')}`).toEqual([]);
	});

	it('перелік перевищень лише скорочується', () => {
		const grown = measured
			.filter(({ file, lines }) => file in OVERSIZED_ALLOWLIST && lines > OVERSIZED_ALLOWLIST[file])
			.map(({ file, lines }) => `${file}: ${lines} > ${OVERSIZED_ALLOWLIST[file]}`);
		expect(grown, `борг зростає, а мав лише спадати:\n${grown.join('\n')}`).toEqual([]);
	});

	it('у переліку немає файлів, які вже вклалися в межу', () => {
		// Прострочений виняток — така сама проблема, як його відсутність: він
		// приховає наступне перевищення того самого файлу.
		const stale = measured
			.filter(({ file, lines, limit }) => file in OVERSIZED_ALLOWLIST && lines <= limit)
			.map(({ file }) => file);
		const missing = Object.keys(OVERSIZED_ALLOWLIST).filter(
			(file) => !measured.some((entry) => entry.file === file)
		);
		expect(
			[...stale, ...missing],
			'виняток більше не потрібен — прибрати з OVERSIZED_ALLOWLIST'
		).toEqual([]);
	});
});
