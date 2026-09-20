import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ЧИТАННЯ ДЕРЕВА ДЛЯ ГЕЙТІВ — ОДИН РАЗ, А НЕ В КОЖНОМУ ФАЙЛІ.
 *
 * ## Що тут було
 *
 * Шість гейтів реалізовували `walk` наново, і три набори винятків уже
 * розійшлися: чотири файли пропускали `node_modules`, `.svelte-kit`, `build`
 * і `dev-dist`, `structure` додавав ще `target` і `gen`, а `db-sources` і
 * `error-handling` не пропускали нічого. Сьогодні це нічого не ламає — усі
 * троє ходять лише по `src`, де таких тек немає. Але розбіжність такого роду
 * лікується не тоді, коли помітили, а тоді, коли вона вже обійшлася в
 * зелений прогін над половиною дерева.
 *
 * Тут узято ОБʼЄДНАННЯ всіх трьох наборів. Для тих, хто ходить лише по `src`,
 * поведінка не змінилася ні на файл.
 *
 * ## Чому це не `scripts/`
 *
 * Здавалося б, місце саме там: сусіди — теж інструменти, що читають дерево.
 * Але `scripts/*.mjs` навмисно лишені ПОЗА `tsconfig` (див. `eslint.config.js`),
 * а імпорт із перевірки затягнув би файл у проєкт — і typescript-eslint
 * відкинув би його з «included by allowDefaultProject but also by the
 * project». Тобто вибір тут не стилістичний: у `scripts/` цей модуль просто
 * не збирається.
 *
 * ## Чому гейт сиріт його не ловить
 *
 * Бо ловить правильно: з маршрутів сюди справді немає шляху. Замість винятку
 * «не дивитися» в `structure.test.ts` стоїть ІНША перевірка — що кожен файл
 * звідси імпортує бодай один гейт. Модуль, який перестали кликати, червоніє
 * так само, як червонів би сирота.
 */

/**
 * Теки, у які не заходимо.
 *
 * `target` і `gen` — нативна частина: там гігабайти проміжних файлів, і обхід
 * без них триває хвилини замість мілісекунд.
 */
export const IGNORED_DIRS = new Set([
	'node_modules',
	'.svelte-kit',
	'build',
	'dev-dist',
	'target',
	'gen'
]);

/**
 * Усі файли під текою, шляхами через `/`.
 *
 * Скісна нормалізується тут, а не в кожному виклику: гейти порівнюють шляхи з
 * рядками на кшталт `src/lib/net/`, і на Windows без цього не збігався б
 * жоден.
 */
export function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (IGNORED_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full.split('\\').join('/'));
	}
	return out;
}

/** Вміст файлу. Шлях — від кореня проєкту. */
export const read = (file: string): string => readFileSync(file, 'utf8');

/** Чи це сам файл перевірок. Гейти майже завжди дивляться на код, а не на себе. */
export const isTest = (file: string): boolean => /\.(test|spec)\.ts$/.test(file);

/**
 * Джерела застосунку: те, що їде у збірку.
 *
 * Без самих перевірок і без `.d.ts` — оголошення типів зникають при збірці й
 * не є кодом, який щось робить.
 */
export function appSources(dir = 'src'): string[] {
	return walk(dir).filter(
		(file) => /\.(ts|svelte)$/.test(file) && !isTest(file) && !file.endsWith('.d.ts')
	);
}
