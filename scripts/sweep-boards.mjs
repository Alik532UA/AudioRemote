/**
 * ПРИБРАТИ ПОКИНУТІ ДОШКИ — те, чого не може зробити жоден клієнт.
 *
 * ## Чому це взагалі можливо
 *
 * У `PROJECT-CONTEXT.md` довго стояло: «автоматичного прибирання тут не буде
 * ніколи». Половина висновку правильна, половина — ні.
 *
 * Правильна: клієнтові `boards` не перелічується за побудовою (саме на цьому
 * тримається пароль — дошка живе за хешем від пари з ним), і видаляти чуже
 * йому не можна. Це лишається, і послаблювати це не можна ні заради чого.
 *
 * Хибна: «ніхто не може». СЕРВІСНИЙ АКАУНТ правила обходить узагалі — для
 * нього гілка перелічується. Отже прибирати може рівно він, з боку сервера, і
 * жодних нових прав клієнтові для цього не потрібно.
 *
 * ## Чому REST, а не firebase-admin
 *
 * Потрібні три дії: прочитати `boards` поверхово, порахувати вік і видалити
 * зайве. Заради цього тягнути `firebase-admin` (десятки пакетів, власне дерево
 * залежностей у `npm audit`) не варто — токен доступу видає
 * `google-auth-library`, який уже приходить із `firebase-tools`, а решта це
 * два `fetch`.
 *
 * ## Чому `shallow=true` обов'язковий
 *
 * `GET /boards.json` без нього витягує ВСЮ базу разом із бібліотеками треків
 * кожної дошки — це десятки мегабайтів і рахунок за трафік на порожньому
 * місці. `shallow` віддає лише ключі, а опис кожної дошки читається окремим
 * дрібним запитом.
 *
 * ## Типово — ЛИШЕ ПОКАЗАТИ
 *
 * Видалення дошки незворотне: її адресу відновити неможливо за побудовою.
 * Тому прогін без `--apply` нічого не чіпає, а лише друкує, що зробив би.
 * Так само зроблено в сусідньому `MindStep` (`firestore-ttl.yml`).
 *
 * Запуск:
 *   node scripts/sweep-boards.mjs            показати, що прострочено
 *   node scripts/sweep-boards.mjs --apply    прибрати
 *
 * Потрібні змінні: `GOOGLE_APPLICATION_CREDENTIALS` (файл сервісного акаунта)
 * і `FIREBASE_DATABASE_URL`.
 */

/** Та сама межа, що й у застосунку. Джерело одне — `boardLifetime.ts`. */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const apply = process.argv.includes('--apply');
const databaseUrl = (process.env.FIREBASE_DATABASE_URL ?? '').replace(/\/+$/, '');
const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '';

function fail(message) {
	console.error(`sweep-boards: ${message}`);
	process.exit(1);
}

if (!databaseUrl) fail('немає FIREBASE_DATABASE_URL');
if (!credentials) fail('немає GOOGLE_APPLICATION_CREDENTIALS');

/**
 * Токен доступу для сервісного акаунта.
 *
 * `google-auth-library` приходить транзитивно з `firebase-tools`, який цей
 * проєкт і так кличе через `scripts/firebase-cli.mjs`. Окремої залежності
 * заводити не треба.
 */
async function accessToken() {
	const { GoogleAuth } = await import('google-auth-library');
	const auth = new GoogleAuth({
		keyFile: credentials,
		scopes: [
			'https://www.googleapis.com/auth/firebase.database',
			'https://www.googleapis.com/auth/userinfo.email'
		]
	});
	const client = await auth.getClient();
	const { token } = await client.getAccessToken();
	if (!token) fail('сервісний акаунт не дав токена');
	return token;
}

const token = await accessToken();
const call = (path, params = '') =>
	`${databaseUrl}/${path}.json?access_token=${token}${params ? `&${params}` : ''}`;

/** Лише ключі: повний `GET /boards` витяг би бібліотеки всіх дощок. */
const listing = await fetch(call('boards', 'shallow=true'));
if (!listing.ok) fail(`перелік дощок не вдався: ${listing.status} ${await listing.text()}`);

const keys = Object.keys((await listing.json()) ?? {});
console.log(`дощок у базі: ${keys.length}`);

const now = Date.now();
const expired = [];
let unknown = 0;

for (const key of keys) {
	const response = await fetch(call(`boards/${key}/info`));
	if (!response.ok) {
		console.warn(`  ${key}: опис не прочитано (${response.status})`);
		unknown += 1;
		continue;
	}

	const info = await response.json();
	const seen = typeof info?.seenAt === 'number' ? info.seenAt : 0;
	const created = typeof info?.createdAt === 'number' ? info.createdAt : 0;
	const used = Math.max(seen, created);

	/*
	 * Дошка без жодної позначки часу простроченою НЕ вважається — те саме
	 * правило, що й у застосунку. Відсутність даних не є доказом віку: це
	 * найімовірніше недописаний запис або зміна схеми, а видалення незворотне.
	 */
	if (used <= 0) {
		console.warn(`  ${key}: немає ні seenAt, ні createdAt — не чіпаю`);
		unknown += 1;
		continue;
	}

	const days = Math.floor((now - used) / 86400000);
	if (now - used > TTL_MS) expired.push({ key, days });
}

console.log(`прострочених (понад ${TTL_MS / 86400000} днів): ${expired.length}`);
for (const { key, days } of expired) console.log(`  ${key} — ${days} днів`);
if (unknown > 0) console.log(`без вердикту: ${unknown}`);

if (!apply) {
	console.log('\nце був показ. Щоб прибрати — той самий виклик із --apply');
	process.exit(0);
}

let removed = 0;
for (const { key } of expired) {
	const response = await fetch(call(`boards/${key}`), { method: 'DELETE' });
	if (response.ok) {
		removed += 1;
	} else {
		console.error(`  ${key}: не видалено (${response.status})`);
	}
}

/*
 * АДМІНСЬКІ КАНАЛИ ЛИШАЮТЬСЯ, і це не недогляд — їх неможливо зіставити з
 * дошкою. `admin/{hex}` виведений із адреси дошки Й адмінського пароля, тобто
 * зв'язку в базі немає за побудовою (і саме тому канал не читає той, хто знає
 * лише пароль дошки). Прибрати їх окремо можна тим самим правилом віку, коли
 * в них з'явиться власний `seenAt`; запис про це стоїть у PROJECT-CONTEXT.md.
 */
console.log(`\nприбрано дощок: ${removed} із ${expired.length}`);
if (removed !== expired.length) process.exit(1);
