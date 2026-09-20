import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { VitePWA, type Display, type ManifestOptions } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

/*
 * У `vite.config.ts` доступний лише `process.env` — `$env` SvelteKit тут ще не
 * існує. Значення мусить збігатися з `svelte.config.js`: маніфест PWA описує
 * ту саму адресу, з якої віддається застосунок, і розбіжність тут дає
 * встановлений застосунок, який відкривається на чужому шляху.
 */
const isDev = process.argv.includes('dev');
const base = process.env.BASE_PATH ?? (isDev ? '' : '/AudioRemote');
const scope = base.endsWith('/') ? base : `${base}/`;

const manifest: Partial<ManifestOptions> = {
	name: 'AudioRemote',
	short_name: 'AudioRemote',
	description: 'Аудіодошка: один пристрій грає, інші ним керують',
	id: scope,
	scope,
	start_url: scope,
	display: 'standalone' as Display,
	background_color: '#101418',
	theme_color: '#101418',
	lang: 'uk',
	icons: [
		{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
		{ src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
	]
};

export default defineConfig({
	/*
	 * `base` тут НЕ задається: його виставляє SvelteKit із `paths.base`, і
	 * власне значення він однаково перекриє, надрукувавши попередження. Змінна
	 * `base` вище лишається — вона потрібна маніфесту PWA, який SvelteKit не
	 * чіпає, і виводиться з тієї самої `BASE_PATH`, тож розійтися їм нема з чого.
	 */
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	plugins: [
		sveltekit(),
		VitePWA({
			filename: 'service-worker.js',
			/*
			 * `prompt`, а НЕ `autoUpdate`.
			 *
			 * `autoUpdate` разом зі `skipWaiting` означає, що новий воркер
			 * забирає вже відкриту вкладку під себе, а `cleanupOutdatedCaches`
			 * прибирає з передкешу старі чанки. У звичайному застосунку це
			 * коштує втраченого стану сторінки. ТУТ це коштує більшого:
			 * вкладка-приймач — єдине, що грає звук, і перезавантаження посеред
			 * відтворення глушить зал. Причому рішення про це ухвалив би воркер,
			 * а не людина.
			 *
			 * Із `prompt` новий воркер стоїть у `waiting`, людина бачить
			 * пропозицію й застосовує її тоді, коли зал порожній
			 * (VERSIONING-v9 § 4.5, `VER-OPEN-TAB-SURVIVES`).
			 *
			 * Інваріант тримає `scripts/check-build.mjs`: він читає ЗІБРАНИЙ
			 * `service-worker.js` і червоніє, якщо генератор усе-таки вставив
			 * `skipWaiting()`. Перевіряти джерело тут недостатньо — прапорець
			 * приходить із конфігу плагіна, а не з нашого коду.
			 */
			registerType: 'prompt',
			manifest,
			injectRegister: false,
			workbox: {
				cleanupOutdatedCaches: true,
				globPatterns: isDev ? [] : ['**/*.{js,css,html,ico,png,svg,webp,woff2,json}'],
				/*
				 * Той самий файл, що й `fallback` в адаптері: офлайн-воркер мусить
				 * віддавати рівно ту оболонку, яку віддав би сервер.
				 */
				navigateFallback: isDev ? null : `${scope}404.html`,
				dontCacheBustURLsMatching: /-[a-f0-9]{8}\./
			},
			devOptions: {
				enabled: false,
				suppressWarnings: true,
				type: 'module'
			}
		})
	],
	build: {
		sourcemap: true
	},
	test: {
		/*
		 * І `.spec.ts`, і `.test.ts`. Конвенція проєкту — `.test.ts`, але файл
		 * із «неправильним» суфіксом просто не запускався б, і ніщо б про це не
		 * сказало: vitest звітує успіх, не подивившись на нього
		 * (AI-AGENT-PITFALLS-v9 § 1.3).
		 */
		include: ['src/**/*.{spec,test}.ts'],
		/*
		 * `node`, а не `jsdom`, — типово. Майже вся логіка тут чиста, а jsdom
		 * НЕ реалізує `crypto.subtle`: під ним виведення адреси дошки падало б
		 * не через помилку в коді, а через середовище. Файли, яким потрібен
		 * DOM, оголошують це самі рядком `// @vitest-environment jsdom`.
		 */
		environment: 'node'
	}
});
