import { spawnSync } from 'node:child_process';

/**
 * `npm audit`, який падає від ЗНАХІДОК, а не від недоступного реєстру
 * (CI-CD-AND-TOOLS-v9 § 1.15, `CI-THIRD-PARTY-OUTAGE`).
 *
 * ## Що зламало деплой
 *
 * Заміряно в `teatralo4ka` 2026-09-04: крок `npm audit --audit-level=high`
 * завершився кодом 1 із повідомленням `503 Service Unavailable - POST
 * https://registry.npmjs.org/-/npm/v1/security/audits/quick`. Тобто реєстр npm
 * лежав, і розгортання не сталося — при тому, що в самому проєкті не змінилося
 * НІЧОГО. Того ж дня локально: 15 знахідок, усі low/moderate, порогу `high`
 * жодна не досягає, тож перевірка мусила бути зеленою. Це не гіпотетична
 * крихкість, а вже здійснене падіння: збій третьої сторони заблокував
 * публікацію сайту.
 *
 * ## Чому не `|| true`
 *
 * Бо тоді перевірка перестає бути перевіркою: справжня знахідка рівня `high`
 * теж стала б зеленою. Тут розрізняються ДВІ різні події, які `npm audit` подає
 * одним кодом виходу:
 *
 *   знайдено high/critical .... падіння, як і було
 *   реєстр не відповів ........ гучне попередження й код 0
 *
 * Різниця видна лише в `--json`, і саме тому код виходу тут не читається
 * взагалі: `npm audit --json` виходить ненульовим і тоді, коли просто знайшов
 * уразливості.
 *
 * Ознака успіху — наявність `metadata.vulnerabilities`, а НЕ відсутність поля
 * `error`: npm кладе в успішний звіт `error: { summary: '', detail: '' }` —
 * порожній, але присутній.
 *
 * ## Чому три спроби, і чому в кожної є таймаут
 *
 * Збій був 503, тобто тимчасовий; три спроби з паузою 5 с покривають коротку
 * недоступність і коштують у зеленому випадку нуль. Але редакція без таймауту
 * того ж дня показала друге дно: `npm audit` не відповів 503, а ЗАВИС —
 * крок тривав понад 15 хвилин, а в журналі за цей час рівно два рядки про
 * невдалі спроби. Механізм проти чужої недоступності сам став її підсилювачем.
 * `--fetch-timeout` не годиться: він стосується однієї HTTP-спроби, а власні
 * ретраї npm усередині нікуди не діваються — межу треба ставити процесу.
 */

/**
 * Поріг — той самий, що в `GATE-AUDIT` канону. Область — СТРОГІША: без
 * `--omit=dev`, тобто аудит дивиться й на інструментарій.
 *
 * Це записане свідоме відхилення (PROJECT-CONTEXT.md, «Свідомі відхилення»):
 * вразливий `eslint` чи `vite` — чужий код, який виконується на машині
 * розробника з доступом до всього репозиторію, а шуму від цього немає (різниця
 * між командами — одна знахідка). Стережеться інваріантом у `src/ci.test.ts`.
 */
const COMMAND = 'npm audit --json';
const THRESHOLD = ['high', 'critical'];
const ATTEMPTS = 3;
const PAUSE_MS = 5000;
/** 60 с на спробу: зелений випадок — близько секунди, гірший тепер 3 хв замість необмеженого. */
const TIMEOUT_MS = 60_000;

function attempt() {
	/*
	 * Команда ОДНИМ рядком, а не ім'я плюс масив аргументів. З масивом і
	 * `shell: true` Node попереджає, що аргументи не екрануються (DEP0190). А без
	 * шелла на Windows `npm` узагалі не запускається: там це `npm.cmd`, і
	 * `spawnSync` віддає порожній stdout — тобто перевірка звітувала б «реєстр не
	 * відповів» на цілком робочому реєстрі.
	 */
	const out = spawnSync(COMMAND, {
		shell: true,
		encoding: 'utf8',
		timeout: TIMEOUT_MS,
		// Без цього `timeout` на Windows убиває лише шелл, а `npm` лишається жити.
		killSignal: 'SIGKILL'
	});

	if (out.signal) {
		return { failure: `не відповів за ${TIMEOUT_MS / 1000} с — процес припинено (${out.signal})` };
	}

	const text = (out.stdout ?? '').trim();
	if (!text) {
		// `out.error` важливіший за stderr: він означає, що процес не запустився
		// взагалі, і плутати це з недоступним реєстром не можна.
		const reason = out.error?.message ?? out.stderr?.trim();
		return { failure: reason || `npm audit не віддав нічого (код ${out.status})` };
	}

	try {
		return { report: JSON.parse(text) };
	} catch {
		return { failure: `розбір JSON не вдався: ${text.slice(0, 200)}` };
	}
}

let report = null;
let lastFailure = '';

for (let i = 1; i <= ATTEMPTS; i += 1) {
	const result = attempt();
	if (result.report?.metadata?.vulnerabilities) {
		report = result.report;
		break;
	}
	lastFailure =
		result.failure ??
		result.report?.error?.summary ??
		'реєстр віддав звіт без metadata.vulnerabilities';
	console.warn(`⚠️  npm audit: спроба ${i} з ${ATTEMPTS} не вдалася — ${lastFailure}`);
	// `await` у модулі, а не цикл на `Date.now()`: той крутив би процесор.
	if (i < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

if (!report) {
	console.warn(
		'⚠️  Реєстр npm не відповів за три спроби — перевірку ПРОПУЩЕНО.\n' +
			'   Це не «уразливостей немає»: це «дізнатися не вдалося».\n' +
			`   Остання відповідь: ${lastFailure}`
	);
	process.exit(0);
}

const levels = report.metadata?.vulnerabilities ?? {};
const blocking = THRESHOLD.reduce((sum, level) => sum + (levels[level] ?? 0), 0);
// `total` серед рівнів — окремий ключ npm, а не рівень: підсумовувати його разом
// з рештою означало б подвоїти число й назвати `total` рівнем.
const total = levels.total ?? 0;

const breakdown = Object.entries(levels)
	.filter(([level, n]) => level !== 'total' && n > 0)
	.map(([level, n]) => `${n} ${level}`)
	.join(', ');

console.log(`🔒 npm audit: ${total} знахідок${breakdown ? ` (${breakdown})` : ''}, поріг ${THRESHOLD[0]}`);

if (blocking > 0) {
	console.error(`❌ уразливостей рівня ${THRESHOLD.join('/')}: ${blocking}`);
	console.error('   Подробиці: npm audit --audit-level=high');
	process.exit(1);
}
