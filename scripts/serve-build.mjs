/**
 * ВІДДАТИ `build/` ТАК, ЯК ЙОГО ВІДДАЄ GITHUB PAGES.
 *
 * Запуск: `node scripts/serve-build.mjs [порт]` (типово 4173).
 *
 * ## Навіщо свій сервер, а не `vite preview`
 *
 * Бо перевіряти треба саме ТОЙ артефакт, який поїде в мережу. `vite preview`
 * піднімає власний конвеєр із власним розвʼязанням шляхів; збіг із хостингом
 * у ньому випадковий, а розбіжність — тиха. Тут натомість відтворені рівно дві
 * звички GitHub Pages, і обидві впливають на те, чи застосунок узагалі
 * відкриється:
 *
 *  * `/{base}/menu` віддається як `menu.html` — сторінки лежать файлами, а не
 *    теками. Сервер, який цього не вміє, дає 404 на кожну сторінку, крім
 *    головної, і виглядає це як зламаний роутер.
 *  * невідома адреса віддається як `404.html` З КОДОМ 404 — саме звідси
 *    працює `+error.svelte`. Сервер, який замість цього віддає `index.html`
 *    із кодом 200, приховав би поломку сторінки помилки назавжди.
 *
 * ## Чому заголовків тут майже немає
 *
 * Політика безпеки приїжджає в самому HTML (`<meta http-equiv>`), бо GitHub
 * Pages не дає ставити заголовки. Отже додавати її тут означало б перевіряти
 * не те, що поїде: у мережі її не буде. Єдине, що задається, — тип вмісту.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const BUILD = resolve('build');
const BASE = (process.env.BASE_PATH ?? '/AudioRemote').replace(/\/$/, '');
const PORT = Number(process.argv[2] ?? process.env.PREVIEW_PORT ?? 4173);

if (!existsSync(BUILD)) {
	console.error('немає теки «build» — спершу npm run build');
	process.exit(1);
}

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.map': 'application/json; charset=utf-8'
};

/**
 * Файл, який віддав би хостинг на цю адресу. `null` — такого немає.
 *
 * @param {string} pathname
 * @returns {string | null}
 */
function fileFor(pathname) {
	if (BASE && !pathname.startsWith(`${BASE}/`) && pathname !== BASE) return null;

	const rest = pathname.slice(BASE.length) || '/';
	// `normalize` з відкинутим виходом угору: без нього `..%2f..` читає диск.
	const inside = normalize(rest).replace(/^(\.\.[/\\])+/, '');
	const target = join(BUILD, inside);
	if (!target.startsWith(BUILD)) return null;

	if (existsSync(target) && statSync(target).isFile()) return target;
	if (rest === '/' || rest === '') return join(BUILD, 'index.html');

	const asPage = `${target.replace(/\/$/, '')}.html`;
	return existsSync(asPage) ? asPage : null;
}

const server = createServer((request, response) => {
	const { pathname } = new URL(request.url ?? '/', 'http://localhost');
	const file = fileFor(decodeURIComponent(pathname));

	if (!file) {
		const missing = join(BUILD, '404.html');
		response.writeHead(404, { 'content-type': TYPES['.html'] });
		if (existsSync(missing)) createReadStream(missing).pipe(response);
		else response.end('404');
		return;
	}

	response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
	createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
	console.log(`build/ на http://localhost:${PORT}${BASE}/`);
});
