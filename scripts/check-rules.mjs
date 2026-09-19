/**
 * ПЕРЕВІРКА ПРАВИЛ REALTIME DATABASE НАД ЕМУЛЯТОРОМ.
 *
 * Запускати: `npm run check:rules` — емулятори піднімає сам `emulators:exec`.
 *
 * ЧОМУ ОКРЕМИЙ СКРИПТ, А НЕ ТЕСТ ПІД VITEST. Правила — єдина частина проєкту,
 * стан якої не видно ні в `src/`, ні у `build/`: вони виконуються на боці
 * Firebase. Файл під vitest, який вимагає живого емулятора, у звичайному
 * `npm test` або падає, або тихо пропускається — тобто стає перевіркою, якої не
 * запускає ніхто.
 *
 * ЧОМУ REST, А НЕ firebase-admin. `firebase-admin` ходить в ОБХІД правил, тобто
 * перевіряв би не те. Звичайний `fetch` із токеном звичайного користувача
 * проходить крізь правила так само, як клієнтський SDK у браузері.
 *
 * ЗВОРОТНИЙ ЕКСПЕРИМЕНТ УСЕРЕДИНІ. Випадки діляться на два набори:
 * «застосунок мусить це вміти» і «сторонній не мусить цього могти». Правила
 * «дозволити все» валять другий набір, «заборонити все» — перший. Зелений
 * результат неможливий випадково. Скрипт сам падає, якщо один із наборів
 * спорожнів, — інакше видалений набір виглядав би як успіх.
 */

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9020';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9119';
const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-audioremote';
const NS = `${PROJECT}-default-rtdb`;

/** Серверний час у REST — той самий, що `serverTimestamp()` у SDK. */
const SERVER_TIME = { '.sv': 'timestamp' };

/** Ключ дошки мусить бути 32 шістнадцяткові символи — так вимагає правило. */
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const GHOST_KEY = 'ffffffffffffffffffffffffffffffff';

/** @param {string} label */
async function signIn(label) {
	const res = await fetch(
		`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ returnSecureToken: true })
		}
	);
	if (!res.ok) throw new Error(`емулятор Auth не дав токен для ${label}: ${res.status}`);
	const body = await res.json();
	return { uid: body.localId, token: body.idToken };
}

const url = (path, token, params = '') =>
	`http://${DB_HOST}/${path}.json?ns=${NS}${params ? `&${params}` : ''}${token ? `&auth=${token}` : ''}`;

const write = async (path, value, token) =>
	(
		await fetch(url(path, token), {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(value)
		})
	).status;

const patch = async (path, value, token) =>
	(
		await fetch(url(path, token), {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(value)
		})
	).status;

const read = async (path, token) => (await fetch(url(path, token))).status;

const ok = (status) => status >= 200 && status < 300;
const denied = (status) => status === 401 || status === 403;

/** @type {{ kind: 'must' | 'must-not', label: string, pass: boolean, got: number }[]} */
const results = [];

/** Застосунок МУСИТЬ це вміти. */
async function must(label, run) {
	const status = await run();
	results.push({ kind: 'must', label, pass: ok(status), got: status });
}

/** Сторонній НЕ МУСИТЬ цього могти. */
async function mustNot(label, run) {
	const status = await run();
	results.push({ kind: 'must-not', label, pass: denied(status), got: status });
}

const owner = await signIn('господар');
const stranger = await signIn('сторонній');

const info = (uid, name = 'Зал 2') => ({
	name,
	ownerUid: uid,
	createdAt: SERVER_TIME,
	schema: 1
});

// ─── НАБІР 1: застосунок мусить це вміти ────────────────────────────────────

await must('господар створює дошку, назвавши господарем себе', () =>
	write(`boards/${KEY}/info`, info(owner.uid), owner.token)
);

await must('господар міняє назву дошки', () =>
	patch(`boards/${KEY}/info`, { name: 'Зал 3' }, owner.token)
);

await must('будь-хто авторизований читає дошку за її адресою', () =>
	read(`boards/${KEY}/info`, stranger.token)
);

await must('господар викладає бібліотеку', () =>
	write(
		`boards/${KEY}/library`,
		{ rev: 1, tracks: { t1: { title: 'Вихід', path: 'act1/vyhid.mp3', durationMs: 1000 } } },
		owner.token
	)
);

await must('господар ховає трек', () => write(`boards/${KEY}/hidden/t1`, true, owner.token));

await must('господар фарбує трек', () =>
	write(`boards/${KEY}/colors/t1`, 'azure', owner.token)
);

await must('господар оголошує стан плеєра', () =>
	write(
		`boards/${KEY}/state`,
		{
			trackId: 't1',
			playing: true,
			armed: true,
			positionMs: 0,
			atServer: SERVER_TIME,
			volume: 0.5
		},
		owner.token
	)
);

await must('пульт дописує команду, підписану собою', () =>
	write(
		`boards/${KEY}/cmd/c1`,
		{ by: stranger.uid, type: 'play', value: 't1', at: SERVER_TIME },
		stranger.token
	)
);

await must('господар квитує команду', () =>
	write(`boards/${KEY}/ack/c1`, { ok: true, at: SERVER_TIME }, owner.token)
);

await must('господар прибирає виконану команду', () =>
	write(`boards/${KEY}/cmd/c1`, null, owner.token)
);

await must('кожен пише присутність про себе', () =>
	write(
		`boards/${KEY}/presence/${stranger.uid}/tab1`,
		{ role: 'remote', at: SERVER_TIME },
		stranger.token
	)
);

/*
 * ДВІ ВКЛАДКИ ОДНОГО БРАУЗЕРА — випадок не для повноти, а зі справжнього прогону.
 *
 * Анонімний вхід дає обом вкладкам той самий uid. Поки присутність лежала в
 * `presence/{uid}`, друга вкладка перетирала першу, і плеєр із пультом, відкриті
 * на одному комп'ютері, давали «комп'ютер офлайн» при живому плеєрі. Знайдено
 * натисканням у браузері, а не читанням правил, — тому випадок і стоїть тут.
 */
await must('друга вкладка того самого uid не перетирає першу', async () => {
	const second = await write(
		`boards/${KEY}/presence/${stranger.uid}/tab2`,
		{ role: 'player', at: SERVER_TIME },
		stranger.token
	);
	if (!ok(second)) return second;

	const both = await (
		await fetch(url(`boards/${KEY}/presence/${stranger.uid}`, stranger.token))
	).json();
	return both?.tab1 && both?.tab2 ? 200 : 500;
});

await must('господар зносить свою дошку цілком', () => {
	// Окрема дошка, щоб решта випадків не залежала від порядку.
	return (async () => {
		const created = await write(`boards/${OTHER_KEY}/info`, info(owner.uid), owner.token);
		if (!ok(created)) return created;
		return write(`boards/${OTHER_KEY}`, null, owner.token);
	})();
});

// ─── НАБІР 2: сторонній не мусить цього могти ───────────────────────────────

await mustNot('читати дошку без входу', () => read(`boards/${KEY}/info`, null));

await mustNot('писати без входу', () =>
	write(`boards/${KEY}/state`, { playing: false, armed: false }, null)
);

/*
 * НАЙВАЖЛИВІШИЙ ВИПАДОК УСЬОГО ФАЙЛУ.
 *
 * Пароль тут — це адреса: дошка живе за хешем від пари (ідентифікатор, пароль).
 * Уся конструкція тримається на тому, що перелічити `boards` неможливо. Якби
 * цей запит проходив, будь-хто одним GET зібрав би адреси ВСІХ дощок, і пароль
 * перестав би означати що-небудь.
 */
await mustNot('перелічити всі дошки', () => read('boards', stranger.token));
await mustNot('прочитати корінь бази', () => read('/', stranger.token));

await mustNot('чужий пише бібліотеку', () =>
	write(`boards/${KEY}/library`, { rev: 2, tracks: {} }, stranger.token)
);

await mustNot('чужий пише стан плеєра', () =>
	write(`boards/${KEY}/state`, { playing: false, armed: false }, stranger.token)
);

await mustNot('чужий ховає трек', () => write(`boards/${KEY}/hidden/t1`, false, stranger.token));

await mustNot('чужий фарбує трек', () =>
	write(`boards/${KEY}/colors/t1`, 'ruby', stranger.token)
);

/*
 * У базі лежить НАЗВА заготовки, а не код кольору. Довільний рядок сюди не
 * пройде — інакше вузол став би місцем, куди можна класти що завгодно, а
 * палітра застосунку перестала б бути єдиним джерелом кольорів.
 */
await mustNot('колір довільним рядком', () =>
	write(`boards/${KEY}/colors/t1`, '#ff0000; drop', owner.token)
);

await mustNot('чужий пише квитанцію', () =>
	write(`boards/${KEY}/ack/c9`, { ok: true, at: SERVER_TIME }, stranger.token)
);

await mustNot('чужий перехоплює дошку, назвавши господарем себе', () =>
	write(`boards/${KEY}/info`, info(stranger.uid), stranger.token)
);

await mustNot('підписати команду чужим uid', () =>
	write(`boards/${KEY}/cmd/c2`, { by: owner.uid, type: 'stop', at: SERVER_TIME }, stranger.token)
);

await mustNot('переписати наявну команду', async () => {
	const created = await write(
		`boards/${KEY}/cmd/c3`,
		{ by: stranger.uid, type: 'stop', at: SERVER_TIME },
		stranger.token
	);
	if (!ok(created)) return 500; // випадок не поставлений — це помилка тесту
	return write(
		`boards/${KEY}/cmd/c3`,
		{ by: stranger.uid, type: 'play', at: SERVER_TIME },
		stranger.token
	);
});

await mustNot('чужий прибирає команду', () => write(`boards/${KEY}/cmd/c3`, null, stranger.token));

await mustNot('писати присутність за іншого', () =>
	write(
		`boards/${KEY}/presence/${owner.uid}/tab1`,
		{ role: 'player', at: SERVER_TIME },
		stranger.token
	)
);

// Обійти рівень вкладки, написавши одразу в гілку чужого uid, теж не можна:
// дозвіл стоїть на $uid і поширюється вниз, а не навпаки.
await mustNot('писати присутність за іншого через гілку uid', () =>
	write(
		`boards/${KEY}/presence/${owner.uid}`,
		{ tabX: { role: 'player', at: SERVER_TIME } },
		stranger.token
	)
);

await mustNot('чужий зносить дошку', () => write(`boards/${KEY}`, null, stranger.token));

await mustNot('під виглядом видалення переписати дошку', () =>
	write(`boards/${KEY}`, { info: info(stranger.uid) }, stranger.token)
);

await mustNot('створити дошку з ключем не того формату', () =>
	write('boards/not-a-hash/info', info(stranger.uid), stranger.token)
);

await mustNot('слати команди в дошку, якої немає', () =>
	write(
		`boards/${GHOST_KEY}/cmd/c4`,
		{ by: stranger.uid, type: 'play', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('команда невідомого типу', () =>
	write(
		`boards/${KEY}/cmd/c5`,
		{ by: stranger.uid, type: 'format', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('команда з часом із майбутнього', () =>
	write(
		`boards/${KEY}/cmd/c6`,
		{ by: stranger.uid, type: 'stop', at: Date.now() + 3_600_000 },
		stranger.token
	)
);

await mustNot('команда із зайвим полем', () =>
	write(
		`boards/${KEY}/cmd/c7`,
		{ by: stranger.uid, type: 'stop', at: SERVER_TIME, extra: 'x' },
		stranger.token
	)
);

await mustNot('гучність поза межами 0..1', () =>
	write(
		`boards/${KEY}/state`,
		{ playing: true, armed: true, volume: 7, positionMs: 0, atServer: SERVER_TIME },
		owner.token
	)
);

await mustNot('присутність із невідомою роллю', () =>
	write(
		`boards/${KEY}/presence/${stranger.uid}/tab3`,
		{ role: 'admin', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('опис дошки із зайвим полем', () =>
	patch(`boards/${KEY}/info`, { secret: 'x' }, owner.token)
);

// ─── Підсумок ───────────────────────────────────────────────────────────────

const positives = results.filter((entry) => entry.kind === 'must');
const negatives = results.filter((entry) => entry.kind === 'must-not');

/*
 * ПОРОЖНІЙ НАБІР — ЦЕ ПОМИЛКА, А НЕ УСПІХ.
 *
 * Без цієї перевірки видалений набір випадків виглядав би як зелений гейт: нуль
 * очікувань — нуль падінь. Саме так перевірка тихо зникає, лишаючи рядок у
 * документації про те, що правила перевіряються.
 */
if (positives.length === 0 || negatives.length === 0) {
	console.error('check:rules: один із наборів порожній — гейт недостовірний');
	process.exit(2);
}

const failed = results.filter((entry) => !entry.pass);

for (const entry of failed) {
	const wanted = entry.kind === 'must' ? 'мало пройти' : 'мало бути відхилено';
	console.error(`  ✗ ${entry.label} — ${wanted}, отримано HTTP ${entry.got}`);
}

console.log(
	`check:rules: ${positives.length} «мусить уміти», ${negatives.length} «не мусить могти», ` +
		`невдач ${failed.length}`
);

process.exit(failed.length === 0 ? 0 : 1);
