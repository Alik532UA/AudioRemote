// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { walk } from './gates/fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ПРАВИЛА Й SDK БАЗИ — ТЕ, ЩО ВИДНО В ДЖЕРЕЛАХ
 * (CLOUD-DATABASE-v9 § 4.2 `CDB-DEFAULT-DENY`, § 1 `CDB-RULES-IN-REPO`,
 * § 13 `CDB-LAZY-SDK`, § 6 `CDB-QUERY-INDEX`).
 *
 * ## Чому окремо від `check:rules`
 *
 * `npm run check:rules` перевіряє ПОВЕДІНКУ правил і робить це чесно — на
 * живому емуляторі, двома наборами випадків. Але він потребує Java й хвилини
 * часу, тож живе окремим job'ом у CI, а локально його запускають не щоразу.
 * Тут — те, що видно прямо в тексті й коштує мілісекунди: відкритий дозвіл,
 * SDK, піднятий на імпорті, запит без індексу. Дві перевірки різного роду над
 * однією межею безпеки — не дублювання: ця ловить помилку до того, як хтось
 * дійде до емулятора.
 *
 * ## Чому «дозволити все» тут гірше, ніж деінде
 *
 * Публічний конфіг Firebase лежить у бандлі за побудовою: адресу бази знає
 * кожен, хто відкрив сайт. Усе, що робить із базою наш код, може зробити
 * будь-хто тим самим SDK із консолі браузера — повз інтерфейс, валідацію й
 * перевірки. Цей файл правил і є єдиною межею.
 */

const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const sources = walk('src').filter(
	(file) => /\.(ts|svelte)$/.test(file) && !/\.(test|spec)\.ts$/.test(file)
);

const rulesText = read('database.rules.json');

/**
 * Текст правил без коментарів.
 *
 * Файл правил RTDB їх дозволяє, і тут їх більше, ніж самих правил — половина
 * рішень цього проєкту пояснена саме там. Шукати `".read": true` по сирому
 * тексту означало б знайти речення, яке пояснює, ЧОМУ цього не можна.
 */
const rules = rulesText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('правила доступу (CLOUD-DATABASE-v9 § 4.2)', () => {
	it('перевірка жива: файл правил прочитано й коментарі зрізано', () => {
		expect(rules.length, 'файл правил порожній').toBeGreaterThan(200);
		expect(rules, 'коментарі не зрізані — пошук знайде пояснення замість правила').not.toContain(
			'МЕЖА БЕЗПЕКИ'
		);
		expect(rules).toContain('"rules"');
	});

	it('корінь закритий', () => {
		// Типове правило — заборона. Дозвіл ставиться точково, на конкретний
		// вузол, а не успадковується згори.
		const root = /"rules"\s*:\s*\{\s*"\.read"\s*:\s*false\s*,\s*"\.write"\s*:\s*false/.test(rules);
		expect(root, 'у корені немає пари «читати не можна, писати не можна»').toBe(true);
	});

	it('ніде немає відкритого дозволу', () => {
		const open = [...rules.matchAll(/"\.(read|write)"\s*:\s*true/g)].map((m) => m[0]);
		expect(open, `дозвіл «будь-кому»: ${open.join(', ')}`).toEqual([]);
	});

	it('кожен вузол із відомою формою закритий $other', () => {
		/*
		 * `.validate` стосується лише НАЗВАНИХ полів. Без `$other: false` запис
		 * міг би принести зайве поле, а головне — розбіжність імені між кодом і
		 * правилом лишалася б тихою: справжнє поле проходило б як невідоме.
		 */
		const others = [...rules.matchAll(/"\$other"\s*:\s*\{\s*"\.validate"\s*:\s*false/g)];
		expect(others.length, 'жодного $other: false — форма запису не закрита').toBeGreaterThan(3);
	});

	it('firebase.json прив’язує саме цей файл', () => {
		// Правила, що лежать у репозиторії й не названі в конфігу, не
		// викладаються нічим: у базі лишається те, що колись вставили руками.
		const config = JSON.parse(read('firebase.json')) as { database?: { rules?: string } };
		expect(config.database?.rules, 'firebase.json не називає файл правил').toBe(
			'database.rules.json'
		);
	});

	/*
	 * КОНФІГ ЛЕЖИТЬ У ДЖЕРЕЛІ, А НЕ У ЗМІННИХ CI
	 * (SECURITY-v9 § 4.2.1, `SEC-CONFIG-IN-SOURCE`).
	 *
	 * Стан «значення порожнє» через це зник, але зʼявився інший, тихіший:
	 * значення на місці, а веде в ЧУЖИЙ проєкт. Тоді правила поїдуть в одну
	 * базу, застосунок писатиме в іншу, і обидві дії будуть «успішні».
	 *
	 * `.firebaserc` існує окремо, бо його читає `firebase-tools`, а той не
	 * вміє в TypeScript. Тож не «одне джерело», а «два, звірені тут».
	 */
	const configSource = read(join('src', 'lib', 'net', 'firebase.ts'));

	it('конфіг не читається зі змінних оточення', () => {
		expect(
			configSource,
			'значення повернулися в `import.meta.env` — тоді воно знову живе у двох місцях, ' +
				'а `git clone && npm run dev` знову не працює'
		).not.toMatch(/import\.meta\.env\.VITE_FIREBASE/);
	});

	it('ідентифікатор проєкту всюди один', () => {
		const inSource = /projectId:\s*'([^']+)'/.exec(configSource)?.[1];
		expect(inSource, 'у firebase.ts немає літерала projectId').toBeTruthy();
		const rc = JSON.parse(read('.firebaserc')) as { projects?: { default?: string } };
		expect(rc.projects?.default, '`.firebaserc` називає інший проєкт').toBe(inSource);
	});

	/*
	 * АДРЕСА БАЗИ — НЕ ДРІБНИЦЯ. Без неї SDK виводить адресу з `projectId` і
	 * йде на американську `firebaseio.com`, якої в цього проєкту немає, а CSP
	 * дозволяє лише `*.firebasedatabase.app`. Скарги не буде: SDK не знає, що
	 * адреса «не та», — він просто йде за нею.
	 */
	it('адреса бази європейська й вписана в джерело', () => {
		const url = /databaseURL:\s*'([^']+)'/.exec(configSource)?.[1];
		expect(url, 'у firebase.ts немає літерала databaseURL').toBeTruthy();
		expect(url, 'адреса не з `firebasedatabase.app` — CSP її заблокує').toMatch(
			/\.europe-west1\.firebasedatabase\.app$/
		);
	});
});

describe('SDK бази (CLOUD-DATABASE-v9 § 13, CDB-LAZY-SDK)', () => {
	const importsSdk = sources.filter((file) => /['"]firebase\//.test(read(file)));

	it('перевірка жива: файли зі згадкою SDK знайдено', () => {
		expect(importsSdk.length, 'жодної згадки firebase/* — сканер шукає не там').toBeGreaterThan(2);
	});

	it('SDK живе лише в мережевому шарі', () => {
		/*
		 * Пакет `firebase` важить більше за весь інший код застосунку разом.
		 * Імпорт із компонента чи контролера кладе його у спільний чанк, і навіть
		 * перший екран із двома кнопками тягне базу.
		 */
		const outside = importsSdk.filter((file) => !file.startsWith('src/lib/net/'));
		expect(outside, `SDK поза src/lib/net/: ${outside.join(', ')}`).toEqual([]);
	});

	it('значення SDK приходять лише динамічним імпортом', () => {
		// Статичний імпорт значення тягне пакет у чанк сторінки. Імпорт ТИПУ
		// зникає при збірці, тож він дозволений — саме ним описані `Auth` і
		// `Database`.
		const statics = importsSdk.flatMap((file) =>
			[...read(file).matchAll(/^import\s+(?!type\b)[^\n]*from\s+['"]firebase\/[^'"]+['"]/gm)].map(
				(m) => `${file}: ${m[0].slice(0, 60)}`
			)
		);
		expect(statics, `статичний імпорт SDK:\n${statics.join('\n')}`).toEqual([]);
	});

	it('initializeApp не виконується на імпорті модуля', () => {
		/*
		 * Синглтон, чий конструктор піднімає SDK, робить це на ІМПОРТІ — і
		 * будь-яка перевірка, яка транзитивно тягне цей модуль, починає вимагати
		 * бойових ключів, щоб узагалі зібратися.
		 */
		const topLevel = importsSdk.flatMap((file) =>
			read(file)
				.split('\n')
				// Виклик у тілі модуля стоїть від нульової колонки; усередині функції
				// чи класу — завжди з відступом. Рядки коментаря відкидаються окремо:
				// пояснення поруч називає цю функцію на кожному кроці.
				.filter((line) => /^[^\s/*].*initializeApp\s*\(/.test(line))
				.map((line) => `${file}: ${line.trim().slice(0, 60)}`)
		);
		expect(topLevel, `SDK підіймається на імпорті:\n${topLevel.join('\n')}`).toEqual([]);
	});
});

describe('запити з сортуванням мають індекс (CDB-QUERY-INDEX)', () => {
	it('кожен orderByChild названий у .indexOn', () => {
		/*
		 * RTDB на запит без індексу НЕ відмовляє: вона вантажить усю гілку в
		 * памʼять клієнта й фільтрує там, а в консолі лишає попередження, якого
		 * ніхто не бачить. Тобто на десяти записах усе працює, а на тисячі —
		 * ні, і причина не видна ніде в коді.
		 */
		const ordered = sources.flatMap((file) =>
			[...read(file).matchAll(/orderByChild\(\s*['"]([^'"]+)['"]/g)].map((m) => ({
				file,
				field: m[1]
			}))
		);

		const missing = ordered
			.filter(({ field }) => !new RegExp(`"\\.indexOn"[^\\]]*"${field}"`).test(rules))
			.map(({ file, field }) => `${file}: orderByChild('${field}') без .indexOn`);

		expect(missing, missing.join('\n')).toEqual([]);
	});
});

describe('форма значення однакова в коді й у правилі (CDB-GATE-FROM-CODE)', () => {
	/*
	 * Правило бази відкидає незнане значення РАЗОМ З УСІМ записом: `$other:
	 * false` не пропускає гілку, у якій одне поле не пройшло `.validate`. Тому
	 * розбіжність між «що вважає добрим клієнт» і «що приймає база» коштує не
	 * зіпсутого поля, а зниклої бібліотеки — і видно її лише на ЧУЖОМУ екрані,
	 * як «на плеєрі ще не обрано папку» при обраній папці.
	 *
	 * Так уже сталося тричі (`key`, `icon`, `auto` — § 6 гейтів). Спільного
	 * гейта на всі поля тут немає навмисно: більшість форм у правилах — це
	 * межі довжини, і звіряти їх текстом означало б писати другий парсер
	 * правил. Під гейтом стоїть те, що клієнт кладе В БАЗУ ДОСЛІВНО, не
	 * вкорочуючи й не округлюючи, — тобто саме те, де розбіжність форм і
	 * можлива.
	 */
	const colorRules = [...rules.matchAll(/"color"\s*:\s*\{\s*"\.validate"\s*:\s*"([^"]+)"/g)].map(
		(match) => match[1]
	);

	it('перевірка жива: правило кольору в файлі знайдено', () => {
		// Три місця: колір треку в бібліотеці, колір комірки й колір кнопки.
		expect(colorRules.length, 'правил кольору не знайдено — далі все дарма').toBe(3);
	});

	it('усі три правила кольору вимагають ту саму форму', () => {
		const shapes = [...new Set(colorRules.map((rule) => rule.replace(/\s+/g, '')))];
		expect(shapes, `форми розійшлися:\n${shapes.join('\n')}`).toHaveLength(1);
	});

	it('форма коду клавіші в коді — та сама, що в правилі', () => {
		/*
		 * Друге поле того самого роду: клавішу теж надсилає адміністратор
		 * рядком, і вона теж їде в базу дослівно. Локально вона завжди приходить
		 * з `KeyboardEvent.code` і має правильну форму — саме тому розбіжність
		 * тут не видно нізвідки, доки не спробує чужий пристрій.
		 */
		const inCode = read('src/lib/hotkeys/hotkeys.ts').match(
			/export const KEY_CODE = (\/.+\/);/
		)?.[1];
		expect(inCode, 'KEY_CODE не знайдено у hotkeys.ts').toBeTruthy();

		const rule = rules.match(/"hotkey"\s*:\s*\{\s*"\.validate"\s*:\s*"([^"]+)"/)?.[1];
		expect(rule, 'правила клавіші у файлі немає').toBeTruthy();
		const inRules = (rule as string).match(/matches\((\/.+\/)\)/)?.[1];
		expect(inCode, `код приймає ${inCode}, а база — ${inRules}`).toBe(inRules);
	});

	it('форма кольору в коді — та сама, що в правилі', () => {
		const inCode = read('src/lib/config/trackColors.ts').match(
			/export const COLOR_SLUG = (\/.+\/);/
		)?.[1];
		expect(inCode, 'COLOR_SLUG не знайдено у trackColors.ts').toBeTruthy();

		// `matches(/.../)` у правилі — той самий літерал, що й у коді.
		const inRules = colorRules[0].match(/matches\((\/.+\/)\)/)?.[1];
		expect(inRules, 'правило кольору не має літерала matches(/.../)').toBeTruthy();
		expect(
			inCode,
			`код приймає ${inCode}, а база — ${inRules}: те, що клієнт вважає добрим, ` +
				'база відкине разом з усім записом'
		).toBe(inRules);
	});
});
