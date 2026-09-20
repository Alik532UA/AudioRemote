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

/**
 * Простір імен бази. `emulators:exec` піднімає її саме таким, а перевизначити
 * можна змінною — див. перевірку нижче про те, чому чужий простір небезпечний.
 */
const NS = process.env.RULES_NS ?? `${PROJECT}-default-rtdb`;

/** Серверний час у REST — той самий, що `serverTimestamp()` у SDK. */
const SERVER_TIME = { '.sv': 'timestamp' };

/** Ключ дошки мусить бути 32 шістнадцяткові символи — так вимагає правило. */
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const GHOST_KEY = 'ffffffffffffffffffffffffffffffff';

/**
 * Адреси адмінського каналу. Це той самий хеш, лише з іншого матеріалу, тож і
 * форма в нього та сама — інша форма правило не пропустить.
 *
 * Другий ключ потрібен для випадку «господар закриває канал»: після закриття
 * канал зникає, і всі наступні випадки на ньому міряли б уже не те.
 */
const ADMIN_KEY = 'b1c2d3e4f5061728394a5b6c7d8e9f01';
const CLOSING_ADMIN_KEY = '1a2b3c4d5e6f70819293a4b5c6d7e8f9';
const GHOST_ADMIN = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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

/*
 * СПЕРШУ ПЕРЕКОНАТИСЯ, ЩО ПРАВИЛА ВЗАГАЛІ ДІЮТЬ.
 *
 * Емулятор прив'язує правила до ОДНІЄЇ бази — тієї, що в `firebase.json`. На
 * будь-який інший простір імен він піднімає порожню базу «дозволити все», і
 * гейт, спрямований туди, зеленіє повністю: усі сорок «не мусить могти»
 * проходять, бо не боронить ніщо. Виглядає це як ідеальні правила.
 *
 * Тому перше, що робиться, — запис у корінь звичайним токеном. У корені стоїть
 * `.write: false`, отже єдина правильна відповідь тут — відмова.
 */
const gatekeeper = await signIn('перевірка простору');
if (!denied(await write('_rules_check', 1, gatekeeper.token))) {
	console.error(
		`check:rules: правила не застосовані до простору «${NS}» — база відкрита, ` +
			'перевіряти нема чого.\n' +
			'  Найімовірніше, емулятор уже піднятий окремо й на іншому просторі.\n' +
			'  Запускати через `npm run check:rules`, а не цей файл напряму.'
	);
	process.exit(2);
}

const owner = await signIn('господар');
const stranger = await signIn('сторонній');

/*
 * ЗАЛИШКИ ВІД ПОПЕРЕДНЬОГО ПРОГОНУ ПРИБИРАЮТЬСЯ ПЕРЕД ПОЧАТКОМ.
 *
 * `emulators:exec` піднімає чистий емулятор, тож у CI цього не потрібно. Але
 * той самий скрипт запускають і проти вже піднятого емулятора — і там дошка з
 * тим самим ключем уже лежить, записана вчорашнім анонімним uid. Правило
 * «міняти може лише господар» тоді відмовляє САМЕ ТАК, ЯК МУСИТЬ, а гейт
 * показує дев'ять червоних рядків і виглядає як зламані правила.
 *
 * `auth=owner` — адмінський доступ емулятора; у справжній базі його не існує,
 * як і самого цього скрипта.
 */
for (const path of [
	`boards/${KEY}`,
	`boards/${OTHER_KEY}`,
	`boards/${GHOST_KEY}`,
	`admin/${ADMIN_KEY}`,
	`admin/${CLOSING_ADMIN_KEY}`,
	`admin/${GHOST_ADMIN}`
]) {
	await write(path, null, 'owner');
}

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

/*
 * У зразку мусять бути ВСІ поля, які застосунок колись пише, — і це не
 * прискіпливість. `$other: false` відкидає незнане поле разом з УСІМ записом:
 * додане в коді поле `key` поїхало в бойову базу, правило про нього не знало, і
 * бібліотека перестала записуватися цілком. На екрані це виглядало як «на
 * комп'ютері ще не обрано папку» — тобто причину шукали в папці.
 *
 * Гейт тоді був зелений, бо зразок тут був неповний. Отже правило просте:
 * нове поле в `publish()` — нове поле тут, інакше перевірка перевіряє вчорашній
 * застосунок.
 */
await must('господар викладає бібліотеку', () =>
	write(
		`boards/${KEY}/library`,
		{
			rev: 1,
			tracks: {
				t1: {
					title: 'Вихід',
					path: 'act1/vyhid.mp3',
					durationMs: 1000,
					order: 0,
					key: '1',
					hotkey: 'KeyQ',
					color: 'azure',
					icon: '🚨',
					auto: true
				}
			}
		},
		owner.token
	)
);

await mustNot('незнане поле в треку', () =>
	write(
		`boards/${KEY}/library`,
		{ rev: 2, tracks: { t3: { title: 'Чуже', path: 'a.mp3', order: 0, secret: 'x' } } },
		owner.token
	)
);

await must('пульт просить перемотку', () =>
	write(
		`boards/${KEY}/cmd/s1`,
		{ by: stranger.uid, type: 'seek', value: 125000, at: SERVER_TIME },
		stranger.token
	)
);

await must('пульт просить попередній трек', () =>
	write(`boards/${KEY}/cmd/p1`, { by: stranger.uid, type: 'prev', at: SERVER_TIME }, stranger.token)
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

await must('господар оголошує стан із тривалістю треку', () =>
	write(
		`boards/${KEY}/state`,
		{
			trackId: 't1',
			playing: true,
			armed: true,
			positionMs: 1500,
			durationMs: 186000,
			volume: 0.8,
			atServer: SERVER_TIME
		},
		owner.token
	)
);

await mustNot('тривалість більша за добу', () =>
	write(`boards/${KEY}/state`, { playing: true, armed: true, durationMs: 86_400_001 }, owner.token)
);

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

/*
 * Порядок, клавіша й колір їдуть У ЗАПИСІ ТРЕКУ. Запис без порядку відкидається:
 * мапа RTDB порядку не має, і трек без нього опинився б на екрані пульта де
 * завгодно.
 */
await mustNot('трек у бібліотеці без порядку', () =>
	write(
		`boards/${KEY}/library`,
		{ rev: 2, tracks: { t2: { title: 'Без порядку', path: 'a.mp3', durationMs: 0 } } },
		owner.token
	)
);

await mustNot('колір довільним рядком', () =>
	write(
		`boards/${KEY}/library`,
		{
			rev: 3,
			tracks: { t3: { title: 'Т', path: 'a.mp3', durationMs: 0, order: 0, color: '#ff0000; drop' } }
		},
		owner.token
	)
);

await mustNot('клавіша числом, а не кодом', () =>
	write(
		`boards/${KEY}/library`,
		// Код клавіші — рядок (`KeyQ`, `F5`). Число тут означало б старий формат,
		// який більше нікуди не пишеться.
		{ rev: 4, tracks: { t4: { title: 'Т', path: 'a.mp3', durationMs: 0, order: 0, hotkey: 42 } } },
		owner.token
	)
);

/*
 * Межа числа залежить від ТИПУ команди: `volume` несе відсотки, `seek` —
 * мілісекунди. Спільна межа означала б або гучність 86 мільйонів, або
 * перемотку на сто мілісекунд.
 */
await mustNot('гучність понад 100', () =>
	write(
		`boards/${KEY}/cmd/v9`,
		{ by: stranger.uid, type: 'volume', value: 5000, at: SERVER_TIME },
		stranger.token
	)
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

await mustNot('значок завдовжки з речення', () =>
	write(
		`boards/${KEY}/library`,
		{
			rev: 2,
			tracks: {
				t1: {
					title: 'Вихід',
					path: 'act1/vyhid.mp3',
					durationMs: 1000,
					order: 0,
					icon: 'це не значок, а ціле речення'
				}
			}
		},
		owner.token
	)
);

// ─── АДМІНСЬКИЙ КАНАЛ ───────────────────────────────────────────────────────
//
// Тут перевіряється те саме, що й для дошки, але з іншим наголосом: канал —
// це підвищення прав, тож «сторонній не мусить» важить більше за все інше.
// «Сторонній» у цих випадках — той, хто знає адресу каналу, тобто адміністратор:
// йому можна надсилати команди й читати налаштування, і НЕ можна писати їх
// самому, підроблювати квитанції чи знести канал.

const adminInfo = (uid) => ({ ownerUid: uid, createdAt: SERVER_TIME, schema: 1 });

await must('господар відкриває адмінський канал', () =>
	write(`admin/${ADMIN_KEY}/info`, adminInfo(owner.uid), owner.token)
);

await must('господар викладає повні налаштування треків', () =>
	write(
		`admin/${ADMIN_KEY}/tracks`,
		{ rev: 1, json: JSON.stringify([{ id: 't1', title: 'Вихід', plays: 2 }]) },
		owner.token
	)
);

await must('адміністратор читає канал за його адресою', () =>
	read(`admin/${ADMIN_KEY}/tracks`, stranger.token)
);

await must('адміністратор надсилає команду', () =>
	write(
		`admin/${ADMIN_KEY}/cmd/a1`,
		{ by: stranger.uid, type: 'tracks', value: '[]', at: SERVER_TIME },
		stranger.token
	)
);

await must('господар квитує адмінську команду', () =>
	write(`admin/${ADMIN_KEY}/ack/a1`, { ok: true, at: SERVER_TIME }, owner.token)
);

await must('господар прибирає виконану адмінську команду', () =>
	write(`admin/${ADMIN_KEY}/cmd/a1`, null, owner.token)
);

await must('господар закриває адмінський канал', async () => {
	await write(`admin/${CLOSING_ADMIN_KEY}/info`, adminInfo(owner.uid), owner.token);
	return write(`admin/${CLOSING_ADMIN_KEY}`, null, owner.token);
});

/*
 * НАЙВАЖЛИВІШИЙ ВИПАДОК З УСІХ ТУТ.
 *
 * Уся вигадка з другим паролем тримається на тому, що адресу каналу не можна
 * ні вгадати, ні підглянути. Перелічувана гілка `admin` віддала б усі адреси
 * списком — тобто права адміністратора дісталися б кожному, хто авторизувався.
 */
await mustNot('перелічити адмінські канали', () => read('admin', stranger.token));

await mustNot('адміністратор пише налаштування треків сам', () =>
	write(`admin/${ADMIN_KEY}/tracks`, { rev: 2, json: '[]' }, stranger.token)
);

await mustNot('адміністратор підробляє квитанцію', () =>
	write(`admin/${ADMIN_KEY}/ack/a2`, { ok: true, at: SERVER_TIME }, stranger.token)
);

await mustNot('адміністратор зносить канал', () =>
	write(`admin/${ADMIN_KEY}`, null, stranger.token)
);

await mustNot('адмінська команда з чужим підписом', () =>
	write(
		`admin/${ADMIN_KEY}/cmd/a3`,
		{ by: owner.uid, type: 'rescan', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('адмінська команда невідомого типу', () =>
	write(
		`admin/${ADMIN_KEY}/cmd/a4`,
		{ by: stranger.uid, type: 'wipe', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('адмінська команда із зайвим полем', () =>
	write(
		`admin/${ADMIN_KEY}/cmd/a5`,
		{ by: stranger.uid, type: 'rescan', at: SERVER_TIME, extra: 'x' },
		stranger.token
	)
);

await mustNot('команда в канал, якого немає', () =>
	write(
		`admin/${GHOST_ADMIN}/cmd/a6`,
		{ by: stranger.uid, type: 'rescan', at: SERVER_TIME },
		stranger.token
	)
);

await mustNot('незнаний вузол усередині каналу', () =>
	write(`admin/${ADMIN_KEY}/notes`, { text: 'x' }, owner.token)
);

await mustNot('опис каналу із зайвим полем', () =>
	patch(`admin/${ADMIN_KEY}/info`, { secret: 'x' }, owner.token)
);

await mustNot('чужий канал під своїм іменем', () =>
	patch(`admin/${ADMIN_KEY}/info`, { ownerUid: stranger.uid }, stranger.token)
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
