// @vitest-environment node
// Перевірка лише читає файли — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { walk } from './gates/fs';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

/**
 * Помічники самих перевірок.
 *
 * Це не код застосунку: у збірку `src/gates/` не їде, і шляху з маршрутів до
 * нього немає й бути не повинно. Категорія названа тут, а поводження з нею —
 * нижче, в описі «кожен помічник гейтів справді комусь потрібен».
 */
const GATE_HELPER = /^src\/gates\//;

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
		const orphans = sources.filter((file) => !reachable.has(file) && !GATE_HELPER.test(file));
		expect(
			orphans,
			'модуль не досяжний із жодного маршруту — він не виконується, ' +
				`але читається як зроблена робота:\n${orphans.join('\n')}`
		).toEqual([]);
	});

	it('кожен помічник гейтів справді комусь потрібен', () => {
		/*
		 * ЗАМІНА ВИНЯТКУ, А НЕ ПОСЛАБЛЕННЯ.
		 *
		 * `src/gates/` недосяжний із маршрутів, і це правильно: він не їде у
		 * збірку, його кличуть самі перевірки. Але «сюди не дивимося» зробило б
		 * теку місцем, де сирота живе вічно. Тому питання просто інше: чи імпортує
		 * цей файл бодай один гейт. Перестали кликати — червоніє так само, як
		 * червонів би сирота.
		 */
		const helpers = sources.filter((file) => GATE_HELPER.test(file));
		expect(helpers.length, 'теки помічників немає — перевіряти нічого').toBeGreaterThan(0);

		const gates = all.filter(isTest).map(read).join('\n');
		const unused = helpers.filter(
			(file) => !gates.includes(`./${file.replace(/^src\//, '').replace(/\.ts$/, '')}'`)
		);

		expect(unused, `помічник гейтів, якого не імпортує жоден гейт:\n${unused.join('\n')}`).toEqual(
			[]
		);
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
	// 885 → 886: рядок імпорту `Failure.svelte`. Компонент замінив тут
	// `<p class="error">` на фатальний блок і заразом прибрав таку саму
	// розмітку зі сторінки підключення — у сумі по проєкту рядків менше.
	// 886 → 889 і 862 → 865: роль дошки («Плеєр», «Пульт») стала окремим
	// рядком замість того, щоб зникати під назвою. Три рядки на сторінку —
	// заголовок, умова на назву й закриття умови; винести це нікуди, бо
	// розмітка в обох сторінках уже стоїть окремим сніпетом.
	// 889 → 890 і 865 → 866: по одному рядку `overflow-wrap: anywhere` у назві
	// того, що грає. Назва без пробілів (а імена файлів такі часто) виїжджала
	// за край картки й тягла горизонтальну прокрутку всієї сторінки. Винести
	// одну властивість нікуди: обидві назви стоять у своїх сторінках і мають
	// різні розміри шрифту.
	// 890 → 841: попередження перед вибором папки додало вісімнадцять рядків і
	// вперлося в стелю. Замість підняття зі сторінки винесена шапка списку
	// (`FolderBar.svelte`) — назва папки, лічильник, вхід до прихованих і дві
	// дії над папкою. Стеля опускається РАЗОМ із файлом.
	// 841 → 844: імпорт і три рядки на `PlaybackPolicy` у деці. Сам орган
	// винесений компонентом; тут лишилася умова «лише в розгорнутій деці».
	// 844 → 830: журнал дій додав рядок, а три мовчазні відмови (база не
	// чути, бібліотеку відкинули, тека лише для читання) винесені одним
	// органом — `BoardNotices`. Стеля опускається РАЗОМ із файлом.
	'src/routes/player/+page.svelte': 830,
	'src/routes/remote/+page.svelte': 866,
	// 541 → 524: політика відтворення додала двадцять один рядок і вперлася б у
	// стелю. Замість підняття з контролера винесений переклад «файл у теці ↔
	// список на екрані» (`configMap.ts`) — найдовша його частина без мережі,
	// звуку й стану. Стеля опускається РАЗОМ із файлом.
	// 524 → 506: журнал дій аудіодошки додав рядки й уперся б у стелю.
	// Замість підняття з контролера винесена перевірка правки від
	// адміністратора (`adminPatch.ts`) — найдовша його частина без мережі,
	// звуку й стану. Стеля опускається РАЗОМ із файлом.
	'src/lib/player/controller.svelte.ts': 506,
	// 521 → 459: із панелі винесені дві самодостатні відповідальності —
	// журнал діагностики (`DiagnosticsTrail.svelte`) і аварійне скидання
	// (`HardResetButton.svelte`). Стеля опускається РАЗОМ із файлом, інакше
	// звільнене місце мовчки заповнить наступна правка, і ратчет не спрацює.
	// 459 → 402: перемикач інфодошки додав дев'ять рядків і вперся в стелю —
	// тобто ратчет спрацював так, як задумано. Замість підняття стелі з панелі
	// винесена картка папки з музикою (`MusicFolderCard.svelte`): це єдине
	// налаштування, якого в браузері не буває взагалі, зі своїм станом, своїм
	// `onMount` і двома власними діями.
	'src/lib/components/settings/SettingsPanel.svelte': 402,
	// 415 → 416: поле такту стало `NumberStepper`. Сам компонент винесений і
	// лежить поза переліком; тут лишився рядок на його імпорт.
	'src/lib/components/player/TriggerEditor.svelte': 416,
	// 326 → 321: два поля з власними `oninput` замінені на `NumberStepper`.
	// Стеля опускається РАЗОМ із файлом — інакше звільнене місце мовчки заповнить
	// наступна правка.
	'src/lib/components/player/TrackDialog.svelte': 321,
	// 329 → 331: по рядку `intent += 1` у `pause()` і `resume()`. Обидві команди
	// теж кажуть, що має звучати зараз, а лічильник піднімали лише «стоп»,
	// запуск і вихід — тобто пауза під час читання файлу гасила старий звук, і
	// новий трек починав грати сам. Коротше, ніж рядком на команду, не виходить.
	// 331 → 337: утримання нуля після «стопу» (`rewound`) — поле, три зняття й
	// захист у `timeupdate`. Ціна названа там же: без нього пульт лишався зі
	// смужкою посеред зупиненого треку.
	// 337 → 340: рушій навчився казати, що трек догравати САМ (`onFinished`).
	// Поле, знімок `trackId` до скидання й виклик — коротше не виходить, а без
	// цього репертуар не має звідки дізнатися про природний кінець: «стоп» і
	// новий запуск сюди не потрапляють навмисно.
	'src/lib/audio/engine.svelte.ts': 340
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
