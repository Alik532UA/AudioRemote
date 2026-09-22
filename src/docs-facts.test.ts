// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ФАКТИ В ДОКУМЕНТАЦІЇ ЗВІРЯЮТЬСЯ З КОДОМ, А НЕ З ПАМʼЯТТЮ
 * (AI-AGENT-PITFALLS-v9 § 5.5, `PIT-NUMBER-UNDER-GATE`, `PIT-DOC-FACTS`).
 *
 * ## Чому це не причепка до охайності
 *
 * `PROJECT-CONTEXT.md` — це крок 2 алгоритму канону: агент читає САМЕ його,
 * щоб не вгадувати параметри проєкту. Порт, префікс сховища чи склад гейта,
 * записані з пам'яті, ведуть наступного читача — людину чи агента — робити не
 * те: емулятор на чужому порті виглядає як зламані правила, а «дозволити все»
 * у просторі імен, якого не існує, — як ідеальні.
 *
 * Число старіє саме тоді, коли робота йде добре: борг скоротили, випадок
 * додали — а рядок у таблиці лишився. Тому число або генерується, або стоїть
 * під гейтом; третього канон не пропонує.
 *
 * ## Що саме звіряється
 *
 * Лише СТАБІЛЬНІ факти: склад гейта правил доступу, порти емулятора, префікс
 * сховища, перелік мов і те, що кожен названий шлях існує. Кількість
 * юніт-перевірок навмисно НЕ звіряється — і в документах її бути не має: число,
 * яке треба правити щоразу, коли додано перевірку, розійдеться знову, а гейт
 * над ним лише перетворив би дрейф документації на червоний прогін без жодної
 * користі. Замість звірки стоїть заборона: рядок таблиці гейтів не сміє
 * називати таке число.
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
 */

const ROOT = process.cwd();
const read = (name: string): string => readFileSync(join(ROOT, name), 'utf8');

/**
 * Документи, які взагалі щось стверджують про цей проєкт.
 *
 * `AGENTS.md` тут не за компанію: канон називає його поруч із PROJECT-CONTEXT
 * саме тому, що його читає агент і діє за ним не питаючи (PIT-DOC-FACTS). Файл
 * із застарілим шляхом до гейта гірший за відсутній — агент виконає команду,
 * якої немає, і вирішить, що зламаний проєкт.
 */
const DOCS = ['PROJECT-CONTEXT.md', 'README.md', 'AGENTS.md'];

// ─── 1. Склад гейта правил доступу ────────────────────────────────────────

const rulesGate = read('scripts/check-rules.mjs');
const must = [...rulesGate.matchAll(/^await must\(/gm)].length;
const mustNot = [...rulesGate.matchAll(/^await mustNot\(/gm)].length;
const cases = must + mustNot;

describe('склад гейта правил у документах (AI-AGENT-PITFALLS-v9 § 5.5)', () => {
	it('перевірка жива: випадки гейта розібрано', () => {
		/*
		 * Нуль означав би не «гейт спорожнів», а «змінилася форма запису
		 * випадку» — і тоді будь-яке число в документі стало б правильним.
		 */
		expect(must, 'жодного «застосунок мусить це вміти»').toBeGreaterThan(10);
		expect(mustNot, 'жодного «сторонній не мусить цього могти»').toBeGreaterThan(10);
	});

	it.each(DOCS)('«%s» називає склад гейта правильно', (doc) => {
		const text = read(doc);
		const claims: { what: string; said: number; real: number }[] = [];

		for (const m of text.matchAll(/(\d+)\s+випадк\w*/g)) {
			claims.push({ what: m[0], said: Number(m[1]), real: cases });
		}
		for (const m of text.matchAll(/(\d+)\s+«застосунок мусить це вміти»/g)) {
			claims.push({ what: m[0], said: Number(m[1]), real: must });
		}
		for (const m of text.matchAll(/(\d+)\s+«сторонній не мусить/g)) {
			claims.push({ what: m[0], said: Number(m[1]), real: mustNot });
		}

		const wrong = claims
			.filter((claim) => claim.said !== claim.real)
			.map((claim) => `«${claim.what.trim()}» — насправді ${claim.real}`);

		expect(
			wrong,
			`число розійшлося з check-rules.mjs (${cases}: ${must} мусить уміти, ` +
				`${mustNot} не мусить могти):\n${wrong.join('\n')}`
		).toEqual([]);
	});
});

// ─── 2. Параметри, у яких помилка виглядає як поломка ─────────────────────

interface Fact {
	what: string;
	/** Звідки береться справжнє значення. */
	from: string;
	real: string;
	/** Як воно записане в документі. Група 1 — саме значення. */
	inDoc: RegExp;
}

const firebaseJson = JSON.parse(read('firebase.json')) as {
	emulators: Record<string, { port?: number }>;
};

const FACTS: Fact[] = [
	{
		what: 'порт емулятора auth',
		from: 'firebase.json',
		real: String(firebaseJson.emulators.auth.port),
		inDoc: /auth \*\*(\d+)\*\*/g
	},
	{
		what: 'порт емулятора database',
		from: 'firebase.json',
		real: String(firebaseJson.emulators.database.port),
		inDoc: /database \*\*(\d+)\*\*/g
	},
	{
		what: 'порт UI емулятора',
		from: 'firebase.json',
		real: String(firebaseJson.emulators.ui.port),
		inDoc: /UI \*\*(\d+)\*\*/g
	},
	{
		what: 'префікс localStorage',
		from: 'src/lib/services/storage.ts',
		real: /const PREFIX = '([^']+)'/.exec(read('src/lib/services/storage.ts'))?.[1] ?? '',
		inDoc: /Префікс `localStorage` *\| `([^`]+)`/g
	},
	{
		what: 'ключ sessionStorage',
		from: 'src/lib/board/session.svelte.ts',
		real: /const SESSION_KEY = '([^']+)'/.exec(read('src/lib/board/session.svelte.ts'))?.[1] ?? '',
		inDoc: /Ключ `sessionStorage` *\| `([^`]+)`/g
	},
	{
		what: 'стеля бюджету бандла',
		from: 'scripts/check-bundle.mjs',
		// Число, яке живе у двох місцях, розходиться там, де його не правлять
		// разом: гейт лишається суворим, а документ обіцяє запас, якого немає.
		real: /const CODE_KB = (\d+);/.exec(read('scripts/check-bundle.mjs'))?.[1] ?? '',
		inDoc: /зі стелею (\d+)/g
	},
	{
		what: 'підлога покриття',
		from: 'vite.config.ts',
		/*
		 * Чотири числа, які доти стояли в документі просто прозою
		 * (`PIT-NUMBER-UNDER-GATE`). Поріг у `vite.config.ts` лише РОСТЕ — і
		 * росте він разом із перевірками, тобто рядок у документі застаріває
		 * раз на кілька комітів. Застарілий він гірший за відсутній: обіцяє
		 * суворість, якої немає, тому наступний читач не піднімає поріг, бо той
		 * «і так уже піднятий».
		 */
		real: (
			/thresholds: \{ statements: (\d+), branches: (\d+), functions: (\d+), lines: (\d+) \}/.exec(
				read('vite.config.ts')
			) ?? []
		)
			.slice(1)
			.join(','),
		inDoc: /підлога покриття: (\d+)\/(\d+)\/(\d+)\/(\d+)/g
	},
	{
		what: 'перелік мов',
		from: 'src/lib/i18n/i18n.svelte.ts',
		real: (/const LOCALES = \[([^\]]+)\]/.exec(read('src/lib/i18n/i18n.svelte.ts'))?.[1] ?? '')
			.replace(/['\s]/g, '')
			.split(',')
			.filter(Boolean)
			.join(','),
		// «2 — `uk` (типова), `en`»: збирається саме перелік, бо число без
		// переліку збіглося б і для двох геть інших мов.
		inDoc: /Локалізації *\| \d+ — `(\w+)` \(типова\), `(\w+)`/g
	}
];

describe('параметри проєкту в PROJECT-CONTEXT.md (PIT-DOC-FACTS)', () => {
	it('перевірка жива: кожен факт прочитано з його джерела', () => {
		const unread = FACTS.filter((fact) => !fact.real).map(
			(fact) => `${fact.what} — форма запису в ${fact.from} змінилася`
		);
		expect(unread, unread.join('\n')).toEqual([]);
	});

	it('перевірка жива: кожен факт справді названий у документі', () => {
		// Без цієї половини переписаний рядок робить гейт мовчазно зеленим: немає
		// збігу — немає й розбіжності.
		const text = read('PROJECT-CONTEXT.md');
		const missing = FACTS.filter((fact) => ![...text.matchAll(fact.inDoc)].length).map(
			(fact) => `${fact.what} — документ його не називає, перевіряти нічого`
		);
		expect(missing, missing.join('\n')).toEqual([]);
	});

	it.each(DOCS)('«%s» називає параметри правильно', (doc) => {
		const text = read(doc);
		const wrong: string[] = [];

		for (const fact of FACTS) {
			for (const found of text.matchAll(fact.inDoc)) {
				const said = found.slice(1).filter(Boolean).join(',');
				if (said !== fact.real) {
					wrong.push(`«${found[0].trim()}» — ${fact.what}: у ${fact.from} ${fact.real}`);
				}
			}
		}

		expect(wrong, `документ розійшовся з кодом:\n${wrong.join('\n')}`).toEqual([]);
	});
});

// ─── 3. Названий шлях існує ───────────────────────────────────────────────

/**
 * Теки, на які документи посилаються й за які відповідає цей репозиторій.
 *
 * `.private/` сюди НЕ входить, і це названо поіменно: там лежать проби агента,
 * вони не відстежуються git, тож у CI їх немає взагалі — вимога до їхньої
 * наявності червоніла б рівно там, де нічого не зламано. Шляхи сусідніх
 * проєктів (`VetCrewGames/…`, `../sveltekit-canon/…`) не наші за визначенням.
 */
const OURS = /^(src|scripts|static|tests|src-tauri|\.github|\.githooks)\//;

describe('шляхи, названі в документах, існують (PIT-DOC-FACTS)', () => {
	it.each(DOCS)('«%s»', (doc) => {
		const text = read(doc);

		const mentioned = new Set<string>();
		// Шлях у зворотних лапках і ціль markdown-посилання — дві форми, якими
		// документи цього проєкту посилаються на файли.
		for (const m of text.matchAll(/`([^`\s]+\/[^`\s]+)`/g)) mentioned.add(m[1]);
		for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) mentioned.add(m[1]);

		const ours = [...mentioned].filter((path) => OURS.test(path));
		expect(ours.length, 'жодного нашого шляху в документі — розбір шукає не там').toBeGreaterThan(
			3
		);

		const gone = ours.filter((path) => !existsSync(join(ROOT, path)));
		expect(gone, `документ посилається на файли, яких немає:\n${gone.join('\n')}`).toEqual([]);
	});
});

// ─── 4. Заміряне число не живе в прозі ────────────────────────────────────

describe('заміряне число не живе в прозі (PIT-NUMBER-UNDER-GATE)', () => {
	it('таблиця гейтів не називає кількість юніт-перевірок', () => {
		/*
		 * Кількість перевірок росте від кожного коміту, тож записана в таблицю
		 * вона застаріває тим самим комітом, яким її записали. Тут це вже
		 * сталося: рядок казав «234 перевірки», а прогін давав інше число.
		 *
		 * Вимірюване число отримують командою (`npm test` друкує його останнім
		 * рядком), а в таблиці лишається те, що перевірка СТЕРЕЖЕ.
		 */
		const rows = read('PROJECT-CONTEXT.md')
			.split('\n')
			.filter((line) => /^\| `npm test`/.test(line))
			.filter((line) => /\d+\s+перевір/.test(line));

		expect(
			rows,
			'рядок таблиці називає кількість перевірок — вона застаріє наступним комітом:\n' +
				rows.join('\n')
		).toEqual([]);
	});
});
