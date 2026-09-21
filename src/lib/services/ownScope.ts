import { base } from '$app/paths';

/**
 * МЕЖА «СВОЄ / ЧУЖЕ» НА СПІЛЬНОМУ ORIGIN.
 *
 * Застосунок живе на `alik532ua.github.io/AudioRemote/` разом із рештою
 * проєктів автора. Два браузерні API не знають про підшлях НІЧОГО й віддають
 * дані всього origin:
 *
 *   * `navigator.serviceWorker.getRegistrations()` — реєстрації всіх сусідів;
 *   * `caches.keys()` — імена кешів усіх сусідів.
 *
 * Тобто «очистити кеші» без фільтра означає вимкнути офлайн у `Slovko`,
 * `MindStep` і решти — і симптом вилізе в чужому репозиторії, де причини
 * немає. У сусідів це вже ставалося, обидва рази однаково: фільтр писали на
 * місці виклику, копії розходилися, і в частині з них фільтра не було зовсім.
 *
 * Тому тут модуль ПЕРШИМ, а не після другого виклику. Стереже це
 * `src/own-scope.test.ts`: він сканує джерела й червоніє на будь-якому
 * `getRegistrations()` чи `caches.keys()` поза цим файлом.
 */

/**
 * Абсолютний префікс scope цього застосунку: `https://host/AudioRemote/`.
 *
 * Порівнювати доводиться АДРЕСАМИ, а не рядками: `registration.scope` завжди
 * абсолютний, а `base` — шлях (`/AudioRemote`), тож пряме `startsWith(base)`
 * не збіглося б ніколи й фільтр тихо відкинув би все, включно зі своїм.
 */
function ownScopePrefix(): string {
	return new URL(`${base || ''}/`, window.location.origin).href;
}

/** Зняти реєстрації ЦЬОГО застосунку. Повертає, скільки їх було. */
export async function unregisterOwnServiceWorkers(): Promise<number> {
	if (!('serviceWorker' in navigator)) return 0;

	const prefix = ownScopePrefix();
	const own = (await navigator.serviceWorker.getRegistrations()).filter((registration) =>
		registration.scope.startsWith(prefix)
	);
	await Promise.all(own.map((registration) => registration.unregister()));
	return own.length;
}

/**
 * Префікс кешів, які застосунок називав би САМ.
 *
 * Сьогодні таких немає — `caches.open()` тут не викликається ніде, увесь
 * передкеш робить воркер із `vite-plugin-pwa`. Ознака лишається для залишків
 * від старих збірок і на випадок власного кеша в майбутньому.
 */
const OWN_CACHE_PREFIX = 'audioremote_';

/**
 * Імена кешів цього застосунку — за ДВОМА ознаками, і робоча тут ДРУГА.
 *
 * Це не припущення, а замір по коду workbox
 * (`workbox-core/src/_private/cacheNames.ts`): ім'я складається як
 * `[prefix, cacheName, suffix]`, де `prefix` це `workbox`, а `suffix` —
 * `registration.scope`, тобто `https://host/AudioRemote/`. Виходить
 * `workbox-precache-v2-https://host/AudioRemote/`, і ВЛАСНОГО префікса в
 * такому імені немає ЖОДНОГО.
 *
 * Саме на цьому обпікся сусідній `MindStep`: там фільтр стояв лише за власним
 * префіксом, віддавав порожній список, і крок «очистити кеші» в аварійному
 * скиданні не робив НІЧОГО — офлайн-копія переживала скидання цілком, тобто
 * саме та причина, заради якої скидання й натискають. Зелено було скрізь.
 *
 * Кінцевий слеш у scope робить перевірку точною: гіпотетичний `/AudioRemote2/`
 * під `/AudioRemote/` не підпадає.
 */
export function ownCacheNames(names: readonly string[]): string[] {
	const scope = ownScopePrefix();
	return names.filter((name) => isOwnCacheName(name, scope));
}

/**
 * Саме правило, зі `scope` параметром, — щоб його можна було ПЕРЕВІРИТИ.
 *
 * `ownCacheNames` бере scope із `window.location`, тобто поза браузером не
 * виконується взагалі. Доки правило живе всередині неї, єдиним способом
 * перевірити його лишається читання коду — а читанням коду помилка цього роду
 * не ловиться: неправильний фільтр виглядає точно так само, як правильний.
 */
export function isOwnCacheName(name: string, scope: string): boolean {
	return name.startsWith(OWN_CACHE_PREFIX) || name.includes(scope);
}

/** Прибрати всі кеші цього застосунку. Повертає, скільки прибрано. */
export async function deleteOwnCaches(): Promise<number> {
	if (!('caches' in window)) return 0;

	const own = ownCacheNames(await caches.keys());
	await Promise.all(own.map((name) => caches.delete(name)));
	return own.length;
}
