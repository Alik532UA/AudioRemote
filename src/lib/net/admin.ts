import { adminPath } from '$lib/board/boardPath';
import { connect } from './firebase';
import { BOARD_SCHEMA, type AdminTracks } from './boardTypes';

/**
 * АДМІНСЬКИЙ КАНАЛ — те, чим третя роль відрізняється від пульта.
 *
 * Пульт грає звуком; адміністратор міняє саму дошку — підписи, кольори,
 * клавіші, повтори, видимість, запуск за API, порядок. Тобто робить те, що доти
 * вимагало сісти за той самий комп'ютер або зайти на нього віддаленим доступом.
 *
 * ## Пароль тут — це адреса
 *
 * Канал живе за `admin/{ключ}`, де ключ виведений з адреси дошки й адмінського
 * пароля (`deriveAdminKey`). Правила бази вміють дивитися лише на auth і на
 * шлях, тож іншого способу перевірити другий пароль не існує: він мусить БУТИ
 * шляхом. Звідси й перевірка пароля на пульті — `channelExists`: канал або є за
 * цією адресою, або його немає, і відповідає на це база, а не наш if.
 *
 * ## Чому канал не всередині дошки
 *
 * Дозвіл читати стоїть на `boards/{ключ}` і поширюється на ВСЕ піддерево —
 * звузити його глибше правила не вміють. Канал, покладений туди, прочитав би
 * кожен, хто знає пароль дошки, і другий пароль не означав би нічого.
 *
 * ## Чому команди, а не прямий запис
 *
 * Налаштування живуть у файлі `audioremote.json` у папці з музикою, і покласти
 * туди щось може лише той браузер, якому цю папку видали. Тобто адміністратор
 * фізично не може записати файл — він може лише попросити. Заразом це означає,
 * що все написане проходить через перевірку плеєра: підроблений шлях до файлу
 * чи невідомий трек далі бази не їдуть.
 */

/** Господар: відкрити канал. Робиться при ввімкненні адмінського пароля. */
export async function openChannel(adminKey: string): Promise<void> {
	const { db, uid } = await connect();
	const { ref, serverTimestamp, set } = await import('firebase/database');

	await set(ref(db, `${adminPath(adminKey)}/info`), {
		ownerUid: uid,
		createdAt: serverTimestamp(),
		schema: BOARD_SCHEMA
	});
}

/**
 * Господар: закрити канал.
 *
 * Це і є «вимкнути адміністратора»: адреса зникає, і пульт, який знав пароль,
 * більше нічого за нею не знайде. Пароль при цьому міняти не треба — достатньо
 * забрати те, до чого він вів.
 */
export async function closeChannel(adminKey: string): Promise<void> {
	const { db } = await connect();
	const { ref, remove } = await import('firebase/database');
	await remove(ref(db, adminPath(adminKey)));
}

/**
 * Пульт: чи правильний пароль.
 *
 * Читання, а не спроба команди: команда в канал, якого немає, відкидається
 * правилом, і з боку пульта це виглядало б так само, як «плеєр не відповів».
 * Тут різниця названа чесно — пароль не той.
 */
export async function channelExists(adminKey: string): Promise<boolean> {
	const { db } = await connect();
	const { get, ref } = await import('firebase/database');
	return (await get(ref(db, `${adminPath(adminKey)}/info`))).exists();
}

/** Господар: викласти повні налаштування. */
export async function publishTracks(adminKey: string, tracks: AdminTracks): Promise<void> {
	const { db } = await connect();
	const { ref, set } = await import('firebase/database');
	await set(ref(db, `${adminPath(adminKey)}/tracks`), tracks);
}

/** Пульт: стежити за налаштуваннями. Перший знімок приходить одразу. */
export async function watchTracks(
	adminKey: string,
	onTracks: (tracks: AdminTracks | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');

	return onValue(ref(db, `${adminPath(adminKey)}/tracks`), (snapshot) => {
		onTracks(snapshot.val() as AdminTracks | null);
	});
}
