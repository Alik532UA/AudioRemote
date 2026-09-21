// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isOwnCacheName } from '$lib/services/ownScope';

/**
 * МЕЖА «СВОЄ / ЧУЖЕ» НА СПІЛЬНОМУ ORIGIN — і чому перевірок тут ДВІ, а не одна.
 *
 * Застосунок живе на `alik532ua.github.io/AudioRemote/` разом із рештою
 * проєктів автора. `caches.keys()` і `getRegistrations()` віддають дані ВСЬОГО
 * origin, тож прибирання без фільтра вимикає офлайн у сусідів — а симптом
 * вилазить у чужому репозиторії, де причини немає.
 *
 * Дефекти тут бувають двох ПРОТИЛЕЖНИХ родів, і одна перевірка ловить лише
 * один із них. Обидва вже траплялися в сусідів:
 *
 *   1. ФІЛЬТРА НЕМАЄ. Цикл «взяти всі, зняти» пишуть на місці виклику, копія
 *      розходиться з наступним викликом. У `Slovko` так вийшло два виклики з
 *      трьох без фільтра, у `MindStep` — один із двох. Ловить сканер джерел;
 *
 *   2. ФІЛЬТР Є Й НЕ ЗБІГАЄТЬСЯ НІ З ЧИМ. У `MindStep` він шукав власний
 *      префікс, а кеші тут називає воркер, і власного префікса в їхніх іменах
 *      немає ЗОВСІМ — тобто крок «очистити кеші» не робив нічого, а виглядав
 *      справним. Читанням коду це не ловиться: неправильний фільтр виглядає
 *      точно так само, як правильний. Ловлять перевірки правила на іменах,
 *      які СПРАВДІ трапляються.
 *
 * Імена взято не зі здогадки, а з коду workbox
 * (`workbox-core/src/_private/cacheNames.ts`): `[prefix, cacheName, suffix]`,
 * де `prefix` = `workbox`, а `suffix` = `registration.scope`.
 */

const ROOT = process.cwd();
const ALLOWED = 'src/lib/services/ownScope.ts';

function sources(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) sources(full, found);
		else if (/\.(ts|svelte)$/.test(entry) && !/\.(test|spec)\.ts$/.test(entry)) found.push(full);
	}
	return found;
}

/** Текст без коментарів: у них ці виклики згадуються як опис дефекту. */
const strip = (text: string): string =>
	text
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/^[ \t]*\/\/.*$/gm, ' ');

const files = sources(join(ROOT, 'src')).map((full) => ({
	path: relative(ROOT, full).replace(/\\/g, '/'),
	code: strip(readFileSync(full, 'utf8'))
}));

describe('межа «своє / чуже» (STORAGE-NAMESPACE)', () => {
	it('перевірка жива: джерела знайдено, і сам модуль серед них', () => {
		expect(files.length, 'сканер не бачить джерел — далі все зелене дарма').toBeGreaterThan(30);
		expect(
			files.some((file) => file.path === ALLOWED),
			'модуля межі немає — сканер дивиться не туди'
		).toBe(true);
	});

	it('getRegistrations() кличуть лише з модуля межі', () => {
		const strays = files
			.filter((file) => file.path !== ALLOWED && file.code.includes('getRegistrations('))
			.map((file) => file.path);

		expect(
			strays,
			'реєстрації всього origin беруть повз фільтр — це знімає service worker ' +
				`сусідніх проєктів на alik532ua.github.io: ${strays.join(', ')}`
		).toEqual([]);
	});

	it('caches.keys() кличуть лише з модуля межі', () => {
		const strays = files
			.filter((file) => file.path !== ALLOWED && file.code.includes('caches.keys('))
			.map((file) => file.path);

		expect(strays, `імена кешів усього origin беруть повз фільтр: ${strays.join(', ')}`).toEqual(
			[]
		);
	});

	it('localStorage.clear() не вживається ніде', () => {
		// Origin спільний: `clear()` витирає дані сусідніх проєктів. Своє
		// прибирає `clearOwn()` за префіксом.
		const strays = files
			.filter((file) => /localStorage\s*\.\s*clear\s*\(/.test(file.code))
			.map((file) => file.path);

		expect(strays, `localStorage.clear() витирає чуже: ${strays.join(', ')}`).toEqual([]);
	});
});

describe('правило «свій кеш» збігається з іменами, які справді бувають', () => {
	const SCOPE = 'https://alik532ua.github.io/AudioRemote/';

	it('своє — впізнає', () => {
		// Саме так називає кеші workbox: prefix-cacheName-suffix, де suffix це scope.
		expect(isOwnCacheName(`workbox-precache-v2-${SCOPE}`, SCOPE)).toBe(true);
		expect(isOwnCacheName(`workbox-runtime-${SCOPE}`, SCOPE)).toBe(true);
		// І власний префікс — на випадок кеша, який застосунок назве сам.
		expect(isOwnCacheName('audioremote_tracks', SCOPE)).toBe(true);
	});

	it('чуже — не чіпає', () => {
		for (const foreign of [
			'workbox-precache-v2-https://alik532ua.github.io/Slovko/',
			'workbox-precache-v2-https://alik532ua.github.io/MindStep/',
			'slovko-cache-0.7.711',
			'mindstep_progress'
		]) {
			expect(isOwnCacheName(foreign, SCOPE), `${foreign} вважається своїм`).toBe(false);
		}
	});

	it('сусід із довшою назвою під нашим шляхом — не наш', () => {
		/*
		 * Кінцевий слеш у scope і робить перевірку точною. Без нього
		 * гіпотетичний `/AudioRemote2/` підпав би під `/AudioRemote`, і
		 * скидання тут витирало б офлайн у нього.
		 */
		expect(
			isOwnCacheName('workbox-precache-v2-https://alik532ua.github.io/AudioRemote2/', SCOPE)
		).toBe(false);
	});
});
