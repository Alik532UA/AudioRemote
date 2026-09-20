/**
 * БЮДЖЕТ КОДУ, ЯКИЙ ВІДВІДУВАЧ ВАНТАЖИТЬ ДО ПЕРШОЇ ВЗАЄМОДІЇ
 * (PERFORMANCE-v9 § 1, § 10.1, `PERF-CRITICAL-PATH`).
 *
 * Запуск: `npm run check:bundle` після збірки.
 *
 * ## Чому міряються СТОРІНКИ, а не тека entry
 *
 * Еталонний скрипт канону сумує `build/_app/immutable/entry`. У цій версії
 * SvelteKit та тека важить два кілобайти — увесь застосунок лежить поруч, у
 * `chunks/` і `nodes/`. Гейт, який щоразу звітує «2 КБ зі 150», гірший за
 * відсутній: він читається як доказ і не міряє нічого
 * (AI-AGENT-PITFALLS-v9 § 1.1).
 *
 * Тому замір береться з самих згенерованих сторінок: кожен
 * `_app/immutable/**.js`, на який посилається сторінка, браузер по неї і
 * витягне. Gzip — бо саме так їх віддає хостинг.
 *
 * ## Чому одне число, а не два
 *
 * Канон вимагає рахувати код і дані окремо там, де в бандл їде реєстр контенту
 * (§ 1.1): інакше поріг червоніє від доданого запису, а не від доданого коду.
 * Тут такого реєстру немає — словники двох мов і перелік слів для паролів
 * важать разом менше за один чанк, а вся «бібліотека» цього застосунку живе на
 * диску того, хто грає, і в бандл не потрапляє за побудовою. Друге число тут
 * було б завжди нульовим, тобто ще одним зеленим доказом ні про що.
 *
 * ## Звідки взялася стеля
 *
 * Заміряно на день постановки гейта: найважча сторінка — приймач, 109.7 КБ
 * gzip (41 чанк); пульт 94.3; решта 73–78. Стеля 120 — приблизно десять
 * відсотків запасу над найважчою. Канонічний орієнтир 150 КБ тут був би
 * «половиною запасу», тобто ловив би лише катастрофу — а її й так видно
 * (§ 1.1).
 *
 * Найдорожче, що цей гейт стереже, — `firebase`. Пакет важить більше за весь
 * інший код разом і приїжджає динамічним імпортом рівно тоді, коли відкривають
 * дошку. Один статичний імпорт заради зручності перетворює перший екран із
 * двома кнопками на півмегабайта — і в коді це виглядає як звичайний рядок.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Стеля в КБ gzip на КОД однієї сторінки. */
const CODE_KB = 120;

const BUILD = process.argv[2] ?? 'build';

if (!existsSync(BUILD)) {
	console.error(`немає теки «${BUILD}» — спершу npm run build`);
	process.exit(1);
}

/** Кожна згенерована сторінка. `_app` тримає самі ресурси, а не сторінки. */
const pages = [];
(function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			if (entry !== '_app') walk(full);
		} else if (entry.endsWith('.html')) {
			pages.push(full);
		}
	}
})(BUILD);

const ASSET = /_app\/immutable\/[\w-]+\/[\w.$-]+\.js/g;

const sizes = new Map();
const kbOf = (asset) => {
	if (!sizes.has(asset)) {
		sizes.set(asset, gzipSync(readFileSync(join(BUILD, asset))).length / 1024);
	}
	return sizes.get(asset);
};

const measured = pages
	.map((page) => {
		const assets = [...new Set([...readFileSync(page, 'utf8').matchAll(ASSET)].map((m) => m[0]))];
		return {
			page: relative(BUILD, page).split('\\').join('/'),
			assets: assets.length,
			kb: assets.reduce((sum, asset) => sum + kbOf(asset), 0)
		};
	})
	.sort((left, right) => right.kb - left.kb);

/*
 * ГЕЙТ МУСИТЬ УМІТИ ВПАСТИ. Нуль сторінок або сторінки, які не посилаються ні
 * на що, означають те саме: розкладка збірки змінилася, і сканер дивиться не
 * туди. Це має бути гучно, а не зелено.
 */
if (measured.length === 0) {
	console.error('жодної сторінки — розкладка збірки змінилася');
	process.exit(1);
}
if (measured.every((entry) => entry.assets === 0)) {
	console.error('жодна сторінка не посилається на _app/immutable — шаблон ресурсу застарів');
	process.exit(1);
}

for (const entry of measured.slice(0, 3)) {
	console.log(`${entry.kb.toFixed(1).padStart(7)} КБ gzip  ${entry.assets} чанків  ${entry.page}`);
}

const over = measured.filter((entry) => entry.kb > CODE_KB);
if (over.length > 0) {
	for (const entry of over) {
		console.error(`понад бюджет: ${entry.kb.toFixed(1)} КБ при стелі ${CODE_KB} — ${entry.page}`);
	}
	process.exit(1);
}

console.log(
	`check:bundle — ${measured.length} сторінок, найважча ${measured[0].kb.toFixed(1)} КБ ` +
		`при стелі ${CODE_KB} КБ gzip.`
);
