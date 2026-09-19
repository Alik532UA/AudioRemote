/**
 * ГЕЙТ НАД ЗІБРАНИМ `build/`, а не над джерелами.
 *
 * Усе, що тут перевіряється, має спільну властивість: у `src/` цього не видно.
 * Політику збирає SvelteKit, воркер — генератор Workbox, маніфест — плагін PWA.
 * Тобто правильний конфіг і правильний результат — різні твердження, і між
 * ними вже двічі в цій родині проєктів пролягала мовчазна помилка.
 *
 * Кожна перевірка нижче стоїть за конкретним випадком, а не «про всяк випадок».
 *
 * Запуск: BASE_PATH=/AudioRemote npm run build && npm run check:build
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const base = process.env.BASE_PATH ?? '/AudioRemote';
const scope = base.endsWith('/') ? base : `${base}/`;

/** @type {string[]} */
const failures = [];
let checks = 0;

/** @param {string} label @param {boolean} ok @param {string} [detail] */
function expect(label, ok, detail) {
	checks++;
	if (!ok) failures.push(detail ? `${label}\n    ${detail}` : label);
}

const read = (name) => {
	const path = join(BUILD, name);
	return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

// --- 0. Збірка взагалі є --------------------------------------------------
if (!existsSync(BUILD)) {
	console.error('build/ не існує — спершу `npm run build`');
	process.exit(1);
}

// --- 1. Значки й оболонка -------------------------------------------------
for (const asset of ['index.html', '404.html', 'favicon.svg', 'icon-192.png', 'icon-512.png']) {
	expect(`є ${asset}`, existsSync(join(BUILD, asset)));
}

// --- 2. Маніфест описує ТУ САМУ адресу, з якої віддається застосунок ------
const manifestRaw = read('manifest.webmanifest');
expect('є manifest.webmanifest', manifestRaw !== null);

if (manifestRaw) {
	const manifest = JSON.parse(manifestRaw);
	/*
	 * Розбіжність тут дає встановлений застосунок, який відкривається поза своїм
	 * scope: браузер вважає його чужою сторінкою й показує адресний рядок, а
	 * офлайн він не працює взагалі. У самому UI це виглядає як «PWA не
	 * встановлюється» — без жодної згадки про scope.
	 */
	expect(
		'scope маніфесту збігається з BASE_PATH',
		manifest.scope === scope,
		`${manifest.scope} ≠ ${scope}`
	);
	expect(
		'start_url збігається з BASE_PATH',
		manifest.start_url === scope,
		`${manifest.start_url} ≠ ${scope}`
	);
	expect('маніфест називає обидва значки', manifest.icons?.length === 2);
}

// --- 3. Воркер НЕ забирає відкриту вкладку --------------------------------
const worker = read('service-worker.js');
expect('є service-worker.js', worker !== null);

if (worker) {
	/*
	 * `registerType: 'prompt'` мусить дати воркер, який ЧЕКАЄ. Доказ його
	 * присутності — слухач повідомлення SKIP_WAITING: саме через нього
	 * `updateServiceWorker(true)` застосовує оновлення, коли людина погодилась.
	 *
	 * Якщо слухача немає — `needRefresh` не стане `true` ніколи, і
	 * `ReloadPrompt.svelte` перетвориться на мертвий код, який ніхто не помітить:
	 * застосунок оновлюватиметься сам, а пропозиція просто не показуватиметься.
	 */
	expect('воркер слухає SKIP_WAITING', worker.includes('SKIP_WAITING'));

	/*
	 * А ось БЕЗУМОВНИЙ `skipWaiting()` означає протилежне: новий воркер забирає
	 * вкладку під себе, не питаючи. Для вкладки-приймача це глушіння залу
	 * посеред відтворення, і рішення про це ухвалює воркер, а не людина.
	 *
	 * Перевіряється не наявність слова, а КОНТЕКСТ: у режимі `prompt` виклик
	 * стоїть усередині обробника повідомлення, і поруч із ним завжди є
	 * `SKIP_WAITING`.
	 */
	const unconditional = [...worker.matchAll(/skipWaiting\(\)/g)].filter((match) => {
		const around = worker.slice(Math.max(0, match.index - 160), match.index);
		return !around.includes('SKIP_WAITING');
	});
	expect(
		'немає безумовного skipWaiting()',
		unconditional.length === 0,
		`знайдено ${unconditional.length}`
	);
	expect('немає clientsClaim()', !worker.includes('clientsClaim()'));

	/*
	 * Офлайн-фолбек — той самий файл, що й `fallback` в адаптері. Доки тут
	 * стояв би `index.html`, воркер офлайн віддавав би не ту оболонку, яку
	 * віддає GitHub Pages, — і глибокі посилання працювали б онлайн і ламалися
	 * офлайн.
	 */
	expect('навігаційний фолбек — 404.html', worker.includes(`${scope}404.html`));
}

// --- 4. Політика безпеки дозволяє те, заради чого існує застосунок --------
const shell = read('404.html');
if (shell) {
	const csp = shell.match(/content="([^"]*default-src[^"]*)"/)?.[1] ?? '';
	expect('CSP є в оболонці', csp.length > 0);

	/*
	 * MEDIA-SRC З `blob:` — без нього не грає НІЧОГО.
	 *
	 * Приймач віддає файл у <audio> через `URL.createObjectURL()`, тобто за
	 * схемою `blob:`. Під `'self'` вона не підпадає. Симптом: тиша при
	 * натисканні й один рядок у консолі; в інтерфейсі не видно нічого, тому
	 * перевірка стоїть тут, а не покладається на око.
	 */
	expect('CSP має media-src із blob:', /media-src[^;]*\bblob:/.test(csp), csp.slice(0, 200));
	expect("CSP не має 'unsafe-inline' у script-src", !/script-src[^;]*unsafe-inline/.test(csp));
	expect('CSP має хеші інлайн-скриптів', /script-src[^;]*sha256-/.test(csp));
	expect('object-src заборонено', /object-src\s+'none'/.test(csp));
}

// --- Підсумок --------------------------------------------------------------
if (failures.length > 0) {
	console.error(`check:build — ${failures.length} із ${checks} перевірок не пройшли:\n`);
	for (const failure of failures) console.error(`  ✗ ${failure}`);
	process.exit(1);
}

console.log(`check:build — усі ${checks} перевірок пройшли (base ${scope}).`);
