import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * БАЗА ВИВОДИТЬСЯ ЗІ ЗМІННОЇ, А НЕ ВПИСАНА КОНСТАНТОЮ.
 *
 * У сусідніх проєктах цієї родини база вписана рядком, і `as5.odesa.ua` після
 * купівлі домену місяцями показувався системними шрифтами: абсолютні шляхи
 * лишилися з префіксом `/as5.odesa.ua`. Найдешевшим переїзд виявився там, де
 * бази як константи не існує взагалі (`adoptananimal`) — саме ця форма тут і
 * повторена. Переїзд на власний домен коштуватиме однієї змінної в `deploy.yml`.
 *
 * @type {"" | `/${string}`}
 */
const basePath = /** @type {"" | `/${string}`} */ (
	process.env.BASE_PATH ?? (process.argv.includes('dev') ? '' : '/AudioRemote')
);

/**
 * Хеші власних інлайн-скриптів `app.html` для CSP.
 *
 * ХЕШ БЕРЕТЬСЯ З ТЕКСТУ, НОРМАЛІЗОВАНОГО ДО LF. Парсер HTML замінює CRLF і CR
 * на LF ще до появи DOM, тобто браузер хешує нормалізований текст. Файл,
 * збережений із CRLF, дає хеш, який не збігається з жодним скриптом на
 * сторінці, — і політика мовчки блокує рівно те, що мала дозволити. Симптом
 * тут майже відсутній: тему все одно виставить контролер після гідрації, тож
 * зовні видно лише мигання (AI-AGENT-PITFALLS-v9 § 2.1).
 *
 * `.gitattributes` тримає LF у репозиторії, але `.replace()` лишається: він
 * захищає від файлу, збереженого редактором повз git.
 *
 * @param {string} templatePath
 * @returns {`sha256-${string}`[]} Літеральний тип, а не `string[]`: один
 * широкий елемент розширює тип цілої директиви, і тоді падають сусідні рядки,
 * яких ніхто не чіпав.
 */
function inlineScriptHashes(templatePath) {
	const template = readFileSync(templatePath, 'utf8');
	// Лише інлайн: тег зі `src` не має вмісту, який можна захешувати.
	const inline = [...template.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)];
	return inline.map(
		(match) =>
			/** @type {`sha256-${string}`} */ (
				`sha256-${createHash('sha256').update(asBrowserSees(match[1])).digest('base64')}`
			)
	);
}

/**
 * Текст скрипта таким, яким його бачить браузер.
 *
 * Розбір HTML нормалізує `\r\n` і одиночний `\r` у `\n` ще до появи DOM
 * («preprocessing the input stream» у HTML Standard), і хешує браузер уже
 * нормалізований текстовий вузол. Тому будь-хто, хто рахує тут хеш — і цей
 * конфіг, і гейт над `build/`, — мусить проводити текст через ЦЮ САМУ функцію.
 * Доки кожен нормалізував (або не нормалізував) по-своєму, вердикт гейта
 * залежав від того, на якій машині лежить файл.
 *
 * @param {string} text
 * @returns {string}
 */
export function asBrowserSees(text) {
	return text.replace(/\r\n?/g, '\n');
}

const appHtmlHashes = inlineScriptHashes('src/app.html');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],

	kit: {
		/*
		 * Фолбек — `404.html`, а не `index.html` (DEPLOY-ENVIRONMENTS-v9 § 3).
		 * GitHub Pages віддає цей файл за будь-якою невідомою адресою й НЕ
		 * перекидає нікуди: адреса в рядку лишається та, за якою прийшли, тож
		 * клієнтський роутер бачить потрібний маршрут.
		 */
		adapter: adapter({ fallback: '404.html' }),
		prerender: { entries: ['*'] },
		paths: { base: basePath },

		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', ...appHtmlHashes],
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self'],
				/*
				 * MEDIA-SRC — директива, без якої цей застосунок не грає НІЧОГО.
				 *
				 * `blob:` тут головне: приймач отримує файл із дескриптора теки й
				 * віддає його в `<audio>` через `URL.createObjectURL()`. Схема
				 * `blob:` під `'self'` НЕ підпадає — це окрема схема, і без неї
				 * джерело падає на `default-src`.
				 *
				 * Клас помилки названий у каноні поіменно: «розмітка правильна,
				 * політика є» → тиша при натисканні й один рядок у консолі
				 * (SECURITY-v9 § 282, AI-AGENT-PITFALLS-v9 § 322). У UI не видно
				 * нічого, тож ловиться це тестом, який ВІДКРИВАЄ сторінку зі
				 * звуком, а не читанням конфігу.
				 */
				'media-src': ['self', 'blob:'],
				/*
				 * CONNECT-SRC для Realtime Database і анонімного входу.
				 *
				 * `wss://*.firebasedatabase.app` — сокет RTDB у europe-west1.
				 * Американська типова адреса (`*.firebaseio.com`) тут НЕ дозволена
				 * навмисно: якщо SDK туди пішов, значить загубилася
				 * `VITE_FIREBASE_DATABASE_URL`, і краще побачити відмову, ніж
				 * мовчки працювати не з тією базою.
				 *
				 * `identitytoolkit` під `*.googleapis.com` — анонімний вхід. Вхід
				 * через Google тут не використовується, тому ні `script-src`, ні
				 * `frame-src` розширювати не треба: саме ця економія й описана в
				 * `VetCrewGames/src/lib/net/account.ts`.
				 */
				/*
				 * `https:` ТУТ — ЦІНА ЗАПУСКУ ТРЕКІВ ЗА ЧУЖИМ API.
				 *
				 * Адресу називає людина в налаштуваннях треку, і перелічити її
				 * наперед неможливо за задумом: сенс саме в тому, що джерело обирає
				 * вона. Отже або вся схема `https:`, або функції немає.
				 *
				 * Послаблення назване вголос і обмежене: сторінці дозволено ходити
				 * куди завгодно по https, але НЕ виконувати звідти код —
				 * `script-src` лишається на хешах, і `unsafe-eval` тут немає. Саме
				 * тому тригер описується полями, а не вставленим скриптом (див.
				 * `src/lib/triggers/trigger.ts`).
				 */
				/*
				 * `ipc:` І `http://ipc.localhost` — ЦЕ НЕ ЗАЙВЕ.
				 *
				 * Ту саму сторінку відкриває застосунок на комп'ютері (`src-tauri/`),
				 * і читання папки з музикою йде звідти через IPC — а IPC у Tauri 2 це
				 * звичайний запит на ці адреси. Tauri дописує їх у політику САМ лише
				 * тоді, коли сторінка вшита в exe; наша приходить із мережі зі своєю
				 * політикою, тож дописати мусимо ми.
				 *
				 * Без цих двох рядків усе виглядає справним: вікно відкривається,
				 * сторінка малюється, кнопка «Обрати папку» є — і не робить нічого,
				 * а в консолі лежить порушення політики.
				 */
				'connect-src': [
					'self',
					'https:',
					'ipc:',
					'http://ipc.localhost',
					'https://*.googleapis.com',
					'https://*.firebasedatabase.app',
					'wss://*.firebasedatabase.app',
					'http://127.0.0.1:*',
					'ws://127.0.0.1:*',
					'http://localhost:*',
					'ws://localhost:*'
				],
				'img-src': ['self', 'data:'],
				'worker-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
