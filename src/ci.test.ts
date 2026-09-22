// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WORKFLOW — ТЕЖ КОД, І ЙОГО СТАН ПЕРЕВІРЯЄТЬСЯ
 * (CI-CD-AND-TOOLS-v9 § 1, `CI-NO-GATE-MASKING`, `CI-DEPLOY-ORDER`).
 *
 * Клас дефекту тут окремий від «тест не запускається» і гірший: крок у
 * `deploy.yml` є, виглядає як гейт — і не робить того, що обіцяє. `npm install`
 * замість `npm ci` вивантажує артефакт, який відрізняється від перевіреного;
 * гейт без `if: !cancelled()` забирає звіт у всіх наступних; команда, що пише в
 * `build/` між збіркою й публікацією, підміняє те, що дивився `check:build`.
 * Жодного з цього не видно в переліку кроків — там усе зелене або «довго йде».
 *
 * Зразок узятий із `selection_criteria/v9/kit/ci.test.ts`; викинуто перевірки
 * під те, чого тут немає (Lighthouse, OIDC-деплой, Playwright, `.geminiignore`),
 * і дописано три власні: порядок «правила раніше за код», межа часу на кожен
 * job і секрет, який прибирається навіть після падіння кроку.
 *
 * Зворотний експеримент на кожному пункті — в описі коміту, що приніс файл.
 */

const ROOT = process.cwd();
const DIR = join(ROOT, '.github/workflows');

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)) : [];

/**
 * ВМІСТ WORKFLOW ЧИТАЄТЬСЯ ЛИШЕ ЧЕРЕЗ ЦЕ, і `\r\n` тут нормалізується.
 *
 * Причина не в стилі, а в тому, як JavaScript читає рядки: `.` не збігається з
 * `\r`, а `$` без прапорця `m` стоїть перед `\n`, але не перед `\r`. Регулярка
 * виду `/^\s+- name: (.*)$/` на рядку з `\r\n` не збігається ЖОДНОГО разу — це
 * не «інший результат», а нуль знайденого, тобто зелений гейт, який нічого не
 * перевірив (AI-AGENT-PITFALLS-v9 § 1.5).
 *
 * Тут це друга лінія: форму закінчень тримає `.gitattributes`, а стан дерева —
 * `src/eol.test.ts`. Коштує вона одного рядка, тож лишається.
 */
const readWorkflow = (file: string): string =>
	readFileSync(join(DIR, file), 'utf8').replace(/\r\n/g, '\n');

const workflows = files.map((f) => ({ name: f, text: readWorkflow(f) }));

/**
 * Ті самі workflow без рядків-коментарів — кожна перевірка нижче читає САМЕ це.
 *
 * Коментар — це документація, а не крок, і відповідь коментаря на пошук ламає
 * перевірки в обидва боки: пояснення «ніколи не пишіть npm install» задовольнило
 * б пошук `npm install` і повідомило б про дефект, якого немає, а речення, що
 * називає крок, звітувало б про крок, якого вже немає. У цьому workflow прози
 * більше, ніж коду, тож фільтр тут не запобіжник, а умова роботи.
 */
const bare = (text: string): string =>
	text
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))
		.join('\n');

const all = workflows.map((w) => bare(w.text)).join('\n');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
	scripts?: Record<string, string>;
};

interface Step {
	/** Рядки `run:`/`uses:` кроку — те, за чим його впізнають. */
	command: string;
	/** Умова кроку без обгортки `${{ }}`, або порожній рядок, якщо її немає. */
	condition: string;
	/** Увесь блок кроку рядками — для перевірок, яким потрібен не лише виклик. */
	block: string[];
	/** Номер рядка, яким крок відкривається, у тексті БЕЗ коментарів. */
	at: number;
}

interface Job {
	name: string;
	/** Текст job'а без рядків-коментарів. */
	lines: string[];
	steps: Step[];
}

/**
 * Jobʼи й кроки рядками, без YAML-парсера.
 *
 * Залежності на `yaml` тут немає, і заводити її під один інваріант — це пакет у
 * `devDependencies` проти тридцяти рядків розбору (DEPENDENCIES-v9 § 1.1).
 * Розбір тримається на двох фактах: job — це ключ на два пробіли всередині
 * блоку `jobs:`, а крок — елемент списку на тому ж відступі, що й перший
 * елемент після `steps:`.
 *
 * РОЗБИРАТИ ДОВОДИТЬСЯ САМЕ ПО JOBʼАХ, і це не акуратність заради акуратності.
 * «Перший гейт у прогоні» — властивість jobʼа, а не файлу: кроки різних jobʼів
 * виконуються незалежно, тож `!cancelled()` першому з них не потрібен. Перша
 * редакція цього файлу рахувала кроки наскрізь і зажадала умови від `npm run
 * check`, який стоїть першим у своєму jobʼі, — тобто вимагала б правки, яка
 * нічого не лікує.
 */
function parseJobs(text: string): Job[] {
	const lines = text.split('\n').filter((line) => !/^\s*#/.test(line));

	const jobsAt = lines.findIndex((line) => /^jobs:\s*$/.test(line));
	if (jobsAt === -1) return [];

	const heads: { name: string; at: number }[] = [];
	for (let at = jobsAt + 1; at < lines.length; at += 1) {
		const head = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(lines[at]);
		if (head) heads.push({ name: head[1], at });
	}

	return heads.map((head, index) => {
		const end = heads[index + 1]?.at ?? lines.length;
		const body = lines.slice(head.at, end);
		return { name: head.name, lines: body, steps: parseSteps(body) };
	});
}

function parseSteps(lines: string[]): Step[] {
	const stepsAt = lines.findIndex((line) => /^\s*steps:\s*$/.test(line));
	if (stepsAt === -1) return [];

	const indent = lines
		.slice(stepsAt + 1)
		.find((line) => /^\s*- /.test(line))
		?.match(/^\s*/)?.[0];
	if (indent === undefined) return [];

	const opensStep = (line: string) => line.startsWith(`${indent}- `);
	const steps: Step[] = [];

	for (let i = stepsAt + 1; i < lines.length; i += 1) {
		if (!opensStep(lines[i])) continue;
		let end = i + 1;
		while (end < lines.length && !opensStep(lines[end])) end += 1;
		const block = lines.slice(i, end);
		steps.push({
			command: block.filter((line) => /(^|\s)(run|uses):/.test(line)).join('\n'),
			condition: block.find((line) => /(^|\s)if:/.test(line))?.replace(/^.*?if:\s*/, '') ?? '',
			block,
			at: i
		});
		i = end - 1;
	}

	return steps;
}

const jobs = workflows.flatMap((w) => parseJobs(w.text).map((job) => ({ file: w.name, ...job })));

describe('CI (CI-CD-AND-TOOLS-v9 § 1)', () => {
	it('перевірка жива: workflow узагалі знайдено', () => {
		expect(files.length, 'немає жодного workflow — сканер шукає не там').toBeGreaterThan(0);
	});

	it('перевірка жива: jobʼи й кроки розібрано', () => {
		expect(jobs.length, 'розбір не побачив жодного jobʼа').toBeGreaterThan(1);
		const steps = jobs.flatMap((job) => job.steps);
		expect(steps.length, 'розбір не побачив жодного кроку — далі все зелене дарма').toBeGreaterThan(
			10
		);
	});

	it('юніт-перевірки запускаються в CI', () => {
		// Пайплайн install → build → deploy означає, що перевірки не виконуються
		// ніколи, скільки б їх не написали.
		expect(/run:\s*npm test\s*$/m.test(all), 'у workflow немає кроку з npm test').toBe(true);
	});

	it('підлога покриття перевіряється в CI', () => {
		// Єдине число, яке відповідає на питання «перевірок не стало менше?».
		// `npm test` на нього не відповідає: він міряє те, що є, а не те, чого
		// немає (CODE-QUALITY-v9 § 6.2).
		expect(/run:\s*npm run check:coverage/.test(all), 'немає кроку check:coverage').toBe(true);
	});

	it('правила бази перевіряються на емуляторі', () => {
		// Єдина межа безпеки онлайн-частини, і стану її не видно ні в `src/`, ні у
		// `build/`: решта гейтів проходить однаково і на правильних правилах, і на
		// «дозволити все» (CLOUD-DATABASE-v9 § 3, `CDB-RULES-GATE`).
		expect(/run:\s*npm run check:rules/.test(all), 'немає кроку check:rules').toBe(true);
	});

	it('гейт над зібраним сайтом є', () => {
		// Частину дефектів видно лише у `build/`: базовий шлях у посиланнях, CSP,
		// маніфест PWA, `skipWaiting()` у воркері.
		expect(/run:\s*npm run check:build/.test(all), 'немає кроку check:build').toBe(true);
	});

	it('використовується npm ci, а не npm install', () => {
		expect(/run:\s*npm install\b/.test(all), 'npm install робить збірку невідтворюваною').toBe(
			false
		);
		expect(/run:\s*npm ci\b/.test(all), 'немає кроку npm ci').toBe(true);
	});

	it('збірка не бруднить робоче дерево', () => {
		// Єдина машинна перевірка правила «артефакт збірки не комітиться»
		// (VERSIONING-v9 § 1.4): інакше згенерований файл роками їздить у комітах.
		expect(/git diff --exit-code/.test(all), 'після збірки немає git diff --exit-code').toBe(true);
	});

	it('жоден тестовий скрипт не у watch-режимі', () => {
		// `test:watch` виключений навмисно — він для цього й існує. Решта в CI
		// підвисає до таймауту job'а, і виглядає це як довгий прогін.
		const watchers = Object.entries(pkg.scripts ?? {})
			.filter(([name]) => /^test(:|$)/.test(name) && name !== 'test:watch')
			.filter(([, cmd]) => /^(vitest|playwright)\s*$/.test(cmd.trim()))
			.map(([name, cmd]) => `${name}: ${cmd}`);

		expect(watchers, 'watch-режим підвисне в CI').toEqual([]);
	});

	it('кожен npm-скрипт із workflow справді існує', () => {
		// Крок, що кличе неіснуючий скрипт, падає лише на прогоні — тобто вже в
		// `main`, і зазвичай разом із деплоєм.
		const called = [...all.matchAll(/run:\s*npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]);
		expect(called.length, 'жодного npm run у workflow — сканер шукає не там').toBeGreaterThan(0);

		const missing = [...new Set(called)].filter((name) => !(pkg.scripts ?? {})[name]);
		expect(missing, `workflow кличе скрипти, яких немає: ${missing.join(', ')}`).toEqual([]);
	});

	/**
	 * МАЖОР ДІЇ ЗВІРЯЄТЬСЯ З ПЕРЕЛІКОМ ПЕРЕВІРЕНИХ, А НЕ З НОМЕРОМ РЕЛІЗУ
	 * (`CI-ACTION-RUNTIME`).
	 *
	 * Номер релізу дії не каже про її РАНТАЙМ нічого: `upload-artifact@v5` і
	 * `configure-pages@v5` свого часу стояли на `node20`, тобто свіжий на
	 * вигляд мажор віз застарілий рантайм. Дізнатися можна лише з `runs.using`
	 * у `action.yml` того самого мажора.
	 *
	 * Коли GitHub вимикає рантайм, дія не падає — вона друкує попередження, яке
	 * в зеленому прогоні ніхто не читає, і лише потім перестає запускатися. Тому
	 * тут перелік: мажор, його `runs.using` і ДАТА, коли це прочитано. Новий
	 * мажор у workflow валить прогін, доки не дописаний сюди разом із заміром —
	 * тобто бампнути дію не подивившись стає неможливо.
	 */
	const VERIFIED_ACTIONS: Readonly<Record<string, string>> = {
		// Прочитано з action.yml кожного мажора 2026-09-20; усі чотири — node24.
		'actions/checkout': 'v5',
		'actions/setup-node': 'v5',
		'actions/setup-java': 'v5',
		'peaceiris/actions-gh-pages': 'v4',
		/*
		 * Додані з `release.yml` (випуск застосунку для компʼютера). Прочитано
		 * з `action.yml` відповідного мажора 2026-09-21:
		 *
		 *   Swatinem/rust-cache@v2   → runs.using: "node24"
		 *   tauri-apps/tauri-action@v0 → runs.using: 'node24'
		 *
		 * `dtolnay/rust-toolchain@stable` сюди НЕ потрапляє й не мусить:
		 * перевірка бере лише `@vN`, а `@stable` — рухома мітка. Це окремий
		 * ризик (вміст мітки міняється без нашого відома), і вкладати його в
		 * перелік «перевірених мажорів» означало б вдавати, ніби його заміряли.
		 */
		'Swatinem/rust-cache': 'v2',
		'tauri-apps/tauri-action': 'v0'
	};

	it('перевірка жива: дії в workflow знайдено', () => {
		const used = [...all.matchAll(/uses:\s*([\w-]+\/[\w-]+)@/g)];
		expect(used.length, 'жодного uses: — сканер шукає не там').toBeGreaterThan(3);
	});

	it('кожна дія стоїть на перевіреному мажорі', () => {
		const wrong = [...all.matchAll(/uses:\s*([\w-]+\/[\w-]+)@(v\d+)/g)]
			.filter(([, action, major]) => VERIFIED_ACTIONS[action] !== major)
			.map(([, action, major]) =>
				VERIFIED_ACTIONS[action]
					? `${action}@${major} — перевірено ${VERIFIED_ACTIONS[action]}`
					: `${action}@${major} — дії немає в переліку перевірених`
			);

		expect(
			[...new Set(wrong)],
			'мажор дії не звірений із runs.using у її action.yml: ' +
				'номер релізу про рантайм не каже нічого, а вимкнений рантайм спершу ' +
				`лише попереджає:\n${[...new Set(wrong)].join('\n')}`
		).toEqual([]);
	});

	it('у переліку перевірених немає дій, яких у workflow вже немає', () => {
		// Прострочений рядок читається як доказ, що дію перевіряли, — а її тут
		// просто немає.
		const used = new Set([...all.matchAll(/uses:\s*([\w-]+\/[\w-]+)@/g)].map((m) => m[1]));
		const stale = Object.keys(VERIFIED_ACTIONS).filter((action) => !used.has(action));
		expect(stale, 'прибрати з VERIFIED_ACTIONS').toEqual([]);
	});

	it('кожен job має межу часу', () => {
		// Типове значення GitHub — 360 хвилин (`CI-JOB-TIMEOUT`). Підвислий крок
		// займає раннер на шість годин і виглядає як «ще йде».
		const naked = jobs
			.filter((job) => !job.lines.some((line) => /^\s*timeout-minutes:/.test(line)))
			.map((job) => `${job.file} → ${job.name}`);

		expect(
			naked,
			`job без timeout-minutes працюватиме до шести годин: ${naked.join(', ')}`
		).toEqual([]);
	});

	it('права оголошені на рівні job, а не на весь workflow', () => {
		// Блок на весь workflow роздає доступ на запис і тим jobʼам, яким він не
		// потрібен (`CI-JOB-LEAST-PRIVILEGE`). Тут таких два з трьох.
		const topLevel = /^permissions:/m.test(all);
		expect(topLevel, 'permissions на рівні workflow — права дістають усі jobʼи').toBe(false);
		expect((all.match(/^\s{4}permissions:/gm) ?? []).length).toBeGreaterThan(1);
	});

	it('повний набір гейтів біжить і на pull request', () => {
		/*
		 * `CI-PRE-MERGE-GATE`. Робота тут іде просто в `main`, тож «PR не буває»
		 * здавалося правдою. Вони є, і щотижня: Dependabot приносить нові версії
		 * того, що їде у браузер відвідувача. Доки цей workflow слухав лише
		 * `push`, такий PR не запускав нічого — ні типів, ні лінта, ні юнітів,
		 * ні гейта над збіркою.
		 *
		 * Перевіряється саме ТОЙ workflow, у якому лежать гейти: `pull_request`
		 * у сусідньому (оболонка) нічого про них не каже.
		 */
		const gated = workflows.find((w) => /npm run check:build/.test(bare(w.text)));
		expect(gated, 'немає workflow з гейтами над збіркою').toBeDefined();

		// Блок `on:` — саме свого файлу й без коментарів: `pull_request` у
		// сусідньому workflow (оболонка) про гейти не каже нічого, а проза —
		// тим паче.
		const triggers = /^on:\s*\n((?:[ \t]+.*\n|\n)*)/m.exec(bare(gated?.text ?? ''))?.[1] ?? '';
		expect(triggers.length, 'розбір блоку `on:` зламався').toBeGreaterThan(10);
		expect(
			/^\s+pull_request:/m.test(triggers),
			'гейти виконуються лише після мержу — PR зливають, не подивившись'
		).toBe(true);
	});

	it('на pull request нічого не публікується', () => {
		/*
		 * Друга половина того самого рішення, і без неї воно було б гіршим за
		 * відсутнє: прогін на гілці, якої ніхто не дивився, виклав би її на
		 * хостинг школи. Обидва кроки з побічним ефектом — викладання правил у
		 * бойову базу й публікація збірки — мусять називати подію.
		 */
		const ONLY_PUSH = /github\.event_name != 'pull_request'/;

		const publish = jobs
			.flatMap((job) => job.steps)
			.find((step) => step.command.includes('peaceiris/actions-gh-pages'));
		expect(publish, 'кроку публікації не знайдено — перевірка мертва').toBeDefined();
		expect(
			ONLY_PUSH.test(publish?.condition ?? ''),
			'публікація не питає про подію — на хостинг поїхала б непереглянута гілка'
		).toBe(true);

		const rules = jobs.find((job) => job.name === 'publish-rules');
		expect(rules, "job'а publish-rules не знайдено — перевірка мертва").toBeDefined();
		expect(
			(rules?.lines ?? []).some((line) => /^\s+if:/.test(line) && ONLY_PUSH.test(line)),
			'правила виклалися б у бойову базу з непереглянутої гілки'
		).toBe(true);
	});

	it('правила бази викладаються ПЕРЕД збіркою коду', () => {
		/*
		 * Порядок тут не оптимізація, а сумісність: нові правила сумісні зі старим
		 * кодом, старі з новим — ні. Поле, яке поїхало в коді раніше за правило,
		 * відкидається разом з УСІМ записом (`$other: false`), і бібліотека
		 * зупиняється цілком. Так сталося тричі: `key`, потім `icon` і `auto`.
		 */
		const deploy = workflows.find((w) => /build-and-deploy:/.test(w.text));
		expect(deploy, 'немає jobʼа build-and-deploy').toBeDefined();
		expect(
			/build-and-deploy:\s*\n\s*(#[^\n]*\n\s*)*needs:\s*publish-rules/.test(deploy?.text ?? ''),
			'збірка не чекає на викладання правил — код поїде раніше за них'
		).toBe(true);
	});

	it('секрет у файлі прибирається навіть після падіння кроку', () => {
		/*
		 * `CI-SECRET-EPHEMERAL`. Записаний у файл секрет живе в `RUNNER_TEMP` і
		 * знімається `trap … EXIT` У ТОМУ Ж КРОЦІ. Звичайний `rm` наприкінці не
		 * рахується: якщо команда між записом і ним впала, файл із ключем
		 * сервісного акаунта лишається на раннері до кінця job'а.
		 */
		const writes = all.includes('RUNNER_TEMP/sa.json');
		if (!writes) return;
		expect(/trap\s+[^\n]*EXIT/.test(all), 'секрет знімається без trap … EXIT').toBe(true);
	});

	describe('впала перевірка не забирає звіт у решти', () => {
		/*
		 * Клас дефекту: гейти є, падіння лишає слід — і про стан проєкту все одно
		 * не відомо нічого. GitHub за замовчуванням не запускає кроки після
		 * червоного, тож одна червона перевірка типів забирає звіт у лінта,
		 * формату, 260 юніт-перевірок і гейта над збіркою. У переліку кроків це
		 * один рядок, який читається як «одна проблема», а означає «одна проблема
		 * плюс чотири невідомості» (`CI-NO-GATE-MASKING`).
		 *
		 * Перелік гейтів заданий командами явно — щоб новий гейт треба було внести
		 * сюди руками, а не щоб він тихо випав із перевірки.
		 */
		const GATE =
			/npm audit|npm run check|npm run lint|npm test\b|npm run build|prettier --check|git diff --exit-code/;

		/** Кроки з побічним ефектом — саме їм `!cancelled()` протипоказаний. */
		const SIDE_EFFECT = /actions-gh-pages|upload-pages-artifact|deploy-pages|firebase-tools/;

		it('перевірка жива: гейти в workflow знайдено', () => {
			const gates = jobs.flatMap((job) => job.steps.filter((step) => GATE.test(step.command)));
			expect(gates.length, 'жодного гейта — розбір кроків шукає не там').toBeGreaterThan(3);
		});

		it('кожен гейт після першого несе !cancelled()', () => {
			const naked: string[] = [];
			for (const job of jobs) {
				const gates = job.steps.filter((step) => GATE.test(step.command));
				// Першому в СВОЄМУ jobʼі `if` не потрібен: до нього там ніщо не падало.
				for (const step of gates.slice(1)) {
					if (!/!cancelled\(\)/.test(step.condition)) {
						naked.push(`${job.file} → ${job.name} → ${step.command.trim()}`);
					}
				}
			}
			expect(
				naked,
				`гейт без !cancelled() — його падіння забере звіт у наступних:\n${naked.join('\n')}`
			).toEqual([]);
		});

		it('крок із побічним ефектом !cancelled() НЕ несе', () => {
			// Дзеркальна половина, і без неї перша половина небезпечна: `!cancelled()`
			// на публікації означає деплой після червоного гейта — тобто рівно те,
			// від чого гейти й захищають.
			const armed: string[] = [];
			for (const job of jobs) {
				for (const step of job.steps) {
					if (SIDE_EFFECT.test(step.command) && /!cancelled\(\)|always\(\)/.test(step.condition)) {
						armed.push(`${job.file} → ${job.name} → ${step.command.trim()}`);
					}
				}
			}
			expect(armed, `публікація виконається після впалого гейта:\n${armed.join('\n')}`).toEqual([]);
		});

		it('continue-on-error не вживається — він робить гейт незначущим', () => {
			// Не мʼякша версія правила, а протилежна: job зеленіє при червоному гейті.
			expect(
				/continue-on-error:\s*true/.test(all),
				'гейт із continue-on-error нічого не гейтує'
			).toBe(false);
		});

		it('крок CI не кличе скрипт, у якому два гейти зчеплені через &&', () => {
			/*
			 * Те саме маскування, лише на рівень нижче за кроки, де `if:` не
			 * допомагає: `prettier --check . && eslint .` падає на prettier, і eslint
			 * не запускається взагалі.
			 *
			 * Зчіплювати можна ПЕРЕДУМОВУ з гейтом — `npm run check` це
			 * `svelte-kit sync && svelte-check`, і там перше не гейт. Тому перелік
			 * команд-гейтів заданий явно й видний у diff.
			 */
			const GATE_COMMAND = [
				/\bprettier\b[^&|]*--check/,
				/\beslint\b/,
				/\bsvelte-check\b/,
				/\bvitest\b/,
				/\bnpm audit\b/
			];

			const scripts = pkg.scripts ?? {};

			/**
			 * Команди-гейти скрипта, з розгорнутими `npm run <name>`.
			 *
			 * `seen` — не про елегантність: `"a": "npm run b"`, `"b": "npm run a"`
			 * дало б нескінченну рекурсію, і гейт підвис би замість почервоніти.
			 */
			const gatesOf = (body: string, seen = new Set<string>()): string[] =>
				body.split('&&').flatMap((raw) => {
					const part = raw.trim();
					const nested = /^npm run ([a-z0-9:_-]+)/.exec(part)?.[1];

					if (nested) {
						if (seen.has(nested) || !scripts[nested]) return [];
						return gatesOf(scripts[nested], new Set([...seen, nested]));
					}

					return GATE_COMMAND.some((pattern) => pattern.test(part)) ? [part] : [];
				});

			const called = [
				...new Set([...all.matchAll(/run:\s*npm run ([a-z0-9:_-]+)/g)].map((m) => m[1]))
			];
			expect(called.length, 'у workflow немає жодного npm run').toBeGreaterThan(0);

			const chained = called
				.filter((name) => scripts[name])
				.map((name) => ({ name, gates: gatesOf(scripts[name], new Set([name])) }))
				.filter(({ gates }) => gates.length > 1)
				.map(({ name, gates }) => `${name}: ${gates.join(' && ')}`);

			expect(
				chained,
				'скрипт зчіплює незалежні гейти — перший червоний зʼїдає звіт решти, ' +
					`і умова кроку тут не допоможе:\n${chained.join('\n')}`
			).toEqual([]);
		});
	});

	it('між збіркою й публікацією ніхто не перезаписує build/', () => {
		/*
		 * Дефект живе не в кроці, а в ПОРЯДКУ кроків, і жоден інший гейт його не
		 * бачить: кожен міряє теку, яка на момент його погляду правильна
		 * (`CI-DEPLOY-ORDER`). Класичний випадок — крок e2e з власною збіркою,
		 * поставлений між `npm run build` із `BASE_PATH` і публікацією: на хостинг
		 * їде збірка з порожнім базовим шляхом, а `check:build` перед тим дивився
		 * на правильну.
		 *
		 * Перевірка свідомо груба: будь-який крок між збіркою й публікацією, чия
		 * команда згадує збірку, — порушення. Хибна тривога тут коштує рядка в
		 * цьому файлі, пропуск — зламаного сайту.
		 */
		const REBUILDS = /npm run build|npm run test:e2e/;

		for (const job of jobs) {
			const publish = job.steps.findIndex((step) =>
				/actions-gh-pages|upload-pages-artifact|deploy-pages/.test(step.command)
			);
			if (publish === -1) continue;

			/*
			 * Крок збірки впізнається за `id: build` — саме заради цього він у
			 * workflow і має ідентифікатор: на нього посилаються умови `if:`
			 * наступних кроків, і тепер ще й ця перевірка. Шукається блок кроку, а
			 * не конкретний рядок: `id:` стоїть під `name:`, і вимога до порядку
			 * рядків у YAML була б вимогою до стилю, а не до порядку кроків.
			 */
			const build = job.steps.findIndex((step) =>
				step.block.some((line) => /^\s*-?\s*id:\s*build\s*$/.test(line))
			);
			expect(
				build,
				`${job.file} → ${job.name}: крок збірки не має «id: build» — перевірку нема на чому закріпити`
			).toBeGreaterThan(-1);
			expect(build, `${job.file} → ${job.name}: збірка стоїть ПІСЛЯ публікації`).toBeLessThan(
				publish
			);

			// Власна команда кроку збірки перезаписом не є, тож зріз починається з
			// наступного кроку.
			const offenders = job.steps
				.slice(build + 1, publish)
				.filter((step) => REBUILDS.test(step.command))
				.map((step) => step.command.trim());

			expect(
				offenders,
				`${job.file} → ${job.name}: між збіркою й публікацією build/ перезаписується — ` +
					`поїде не та збірка, яку дивився check:build:\n${offenders.join('\n')}`
			).toEqual([]);
		}
	});
});
