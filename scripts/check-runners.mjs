/**
 * КОЖЕН ФАЙЛ ПЕРЕВІРОК СПРАВДІ ЗАПУСКАЄТЬСЯ, А КОЖЕН СКРИПТ-ГЕЙТ МАЄ ЩО
 * ПЕРЕВІРЯТИ (AI-AGENT-PITFALLS-v9 § 1.3.1, `PIT-TEST-DISCOVERY-PROCESS`).
 *
 * Запускати: `npm run check:runners`.
 *
 * ## Чому окремим процесом, а не ще одним файлом під vitest
 *
 * Бо саме vitest тут і є підозрюваним. Перевірка «чи всі файли підхоплені
 * раннером», запущена раннером, зникає разом із тим, що мала знайти: звужена
 * маска `include` викидає і її. Червоного при цьому не буде — прогін звітує
 * успіх, просто перевірок у ньому на одну менше.
 *
 * ## Що саме ловиться
 *
 * 1. ФАЙЛ ПЕРЕВІРОК, ЯКОГО НЕ ЗАПУСКАЄ НІХТО. Файл із неправильним суфіксом
 *    або поза маскою `include` лежить у репозиторії, читається як покриття й не
 *    виконується жодного разу.
 *
 * 2. СКРИПТ-ГЕЙТ БЕЗ ЖОДНОГО ФАЙЛУ. Той самий клас із іншого боку, і саме він
 *    тут і був: `"test:e2e": "playwright test"` при порожній теці `tests/e2e`
 *    і без конфігу Playwright. У `package.json` він виглядає як покриття
 *    браузером, у PROJECT-CONTEXT про нього не сказано нічого, а запуск падає
 *    з «no tests found». Гейт, який ніколи не виконувався, — не гейт.
 *
 * 3. ФАЙЛ, ЯКОГО ЗАПУСКАЄ НЕ ТОЙ РАННЕР. Раннерів тепер два, і територія в
 *    кожного своя: vitest бере `src/`, Playwright — `tests/`. Плутанина
 *    ламається в обидва боки й обидва рази тихо. Браузерний опис, що
 *    потрапив під маску vitest, падає в `node` із причиною, яка не читається,
 *    — і його «виправляють», звузивши маску, тобто викинувши з прогону. Юніт,
 *    що заїхав у `tests/`, навпаки: vitest його не бачить, Playwright запускає
 *    в браузері, і зелений він там нічого не означає.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const posix = (path) => path.split('\\').join('/');

function walk(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(posix(full));
	}
	return out;
}

// ─── 1. Кожен файл перевірок бачить vitest ────────────────────────────────

const isCheck = (file) => /\.(test|spec)\.ts$/.test(file);

/**
 * Території раннерів: vitest бере `src/`, Playwright — `tests/`.
 *
 * У `tests/` під нагляд іде й `*.setup.ts`: проєкт `identity` — це САМЕ
 * такий файл, і саме він доводить, що набір біжить проти потрібної збірки.
 * Випав би він із `testMatch` — решта проєктів лишилися б зеленими, довівши
 * менше, ніж здається.
 */
const unitFiles = walk('src').filter(isCheck);
const browserFiles = walk('tests').filter((file) => /\.(test|spec|setup)\.ts$/.test(file));
const onDisk = [...unitFiles, ...browserFiles];

/*
 * Перелік береться в самого раннера, а не виводиться з маски в конфігу:
 * вивести його означало б повторити логіку `include` й повірити власному
 * повторенню. `--filesOnly` друкує саме те, що він справді візьме.
 */
const listed = execFileSync(
	process.execPath,
	[join('node_modules', 'vitest', 'vitest.mjs'), 'list', '--filesOnly'],
	{ encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
)
	.split('\n')
	.map((line) => posix(line.trim()))
	.filter((line) => /\.(test|spec)\.ts$/.test(line));

if (unitFiles.length === 0) {
	problems.push('у `src` немає жодного файлу перевірок — сканер шукає не там');
}
if (listed.length === 0) {
	problems.push('vitest не назвав жодного файлу — розбір його виводу зламався');
}

for (const file of unitFiles) {
	if (!listed.includes(file)) {
		problems.push(`${file}: лежить у репозиторії, але vitest його не запускає`);
	}
}

/*
 * ЧУЖЕ VITEST БРАТИ НЕ МУСИТЬ. Браузерний опис під його маскою падає в `node`
 * так, що причина не читається зовсім, — а «виправляють» це звуженням маски,
 * тобто викиданням перевірок із прогону.
 */
for (const file of listed) {
	if (file.startsWith('tests/')) {
		problems.push(`${file}: браузерний опис потрапив під маску vitest`);
	}
}

// ─── 1б. Кожен браузерний опис бачить Playwright ──────────────────────────

if (browserFiles.length > 0) {
	/*
	 * Перелік береться в самого Playwright тією ж логікою, що й у vitest:
	 * повторити його `testDir`/`testMatch` означало б повірити власному
	 * повторенню. `--list --reporter=json` друкує саме те, що він візьме.
	 */
	const seen = [];
	try {
		const listing = JSON.parse(
			execFileSync(
				process.execPath,
				[
					join('node_modules', '@playwright', 'test', 'cli.js'),
					'test',
					'--list',
					'--reporter=json'
				],
				{ encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
			)
		);
		/*
		 * `suite.file` у Playwright відносний до `rootDir` (`tests/e2e`), а не
		 * до кореня репозиторію. Без цього приведення жоден файл не збігся б із
		 * тим, що знайшов `walk`, — і гейт червонів би на здоровому наборі.
		 */
		const root = posix(listing.config?.rootDir ?? '');
		const here = posix(process.cwd());
		const prefix = root.startsWith(here) ? root.slice(here.length + 1) : '';
		const collect = (suite) => {
			if (suite.file) seen.push(prefix ? `${prefix}/${posix(suite.file)}` : posix(suite.file));
			for (const child of suite.suites ?? []) collect(child);
		};
		for (const suite of listing.suites ?? []) collect(suite);
	} catch (error) {
		problems.push(`playwright не перелічив описи: ${String(error).slice(0, 120)}`);
	}

	if (seen.length === 0) {
		problems.push('playwright не назвав жодного файлу — розбір його виводу зламався');
	}
	for (const file of browserFiles) {
		if (!seen.includes(file)) {
			problems.push(`${file}: лежить у репозиторії, але playwright його не запускає`);
		}
	}
}

// ─── 2. Скрипт-гейт, якому нічого перевіряти ──────────────────────────────

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts ?? {};

/** Раннер → як переконатися, що йому є що запускати. */
const RUNNERS = [
	{
		match: /\bplaywright\b[^&|]*\btest\b/,
		has: () => walk('tests').some((file) => /\.(test|spec)\.(ts|js)$/.test(file)),
		why: 'жодного файлу e2e — `playwright test` падає з «no tests found»'
	},
	{
		match: /\bvitest\b(?!.*--watch)/,
		has: () => onDisk.length > 0,
		why: 'жодного файлу перевірок'
	}
];

for (const [name, body] of Object.entries(scripts)) {
	for (const runner of RUNNERS) {
		if (!runner.match.test(body)) continue;
		if (!runner.has()) {
			problems.push(`скрипт «${name}» (${body}): ${runner.why}`);
		}
	}
}

// ─── Підсумок ─────────────────────────────────────────────────────────────

if (problems.length > 0) {
	console.error('check:runners — перевірка, якої ніхто не запускає:\n');
	for (const problem of problems) console.error(`  ✗ ${problem}`);
	process.exit(1);
}

console.log(
	`check:runners — ${onDisk.length} файлів перевірок, усі підхоплені раннером; ` +
		'скриптів-гейтів без файлів немає.'
);
