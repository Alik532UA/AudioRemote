import { boardPath } from '$lib/board/boardPath';
import { connect } from './firebase';
import {
	BOARD_SCHEMA,
	type BoardInfo,
	type Library,
	type PlayerState,
	type Track
} from './boardTypes';

/**
 * ДОШКА В БАЗІ: опис, бібліотека, приховане й стан плеєра.
 *
 * Канал команд живе окремо (`commands.ts`), присутність — теж (`presence.ts`),
 * і поділ тут не за розміром файлу, а за природою записів. Те, що в цьому
 * файлі, — це СТАН: він пишеться навмисно й мусить пережити обрив зв'язку.
 * Команда — подія, яка або доїхала зараз, або не доїхала; присутність існує
 * рівно доки живий сокет. Змішані в одному модулі, вони читаються як одне, і
 * зʼявляється спокуса прибирати стан при обриві.
 */

const node = (key: string, child?: string) =>
	child ? `${boardPath(key)}/${child}` : boardPath(key);

/**
 * Чи існує дошка за цією адресою.
 *
 * Це і є перевірка пароля: адресу виводять із пари (ідентифікатор, пароль), тож
 * «немає такого вузла» і «пароль невірний» — буквально одна відповідь. Саме
 * тому інтерфейс показує одне повідомлення на обидва випадки: розділити їх
 * неможливо навіть теоретично, і це добре.
 */
export async function boardExists(key: string): Promise<boolean> {
	const { db } = await connect();
	const { get, ref } = await import('firebase/database');
	return (await get(ref(db, node(key, 'info')))).exists();
}

/**
 * Створити дошку, якщо її ще немає, і назватися господарем.
 *
 * Кличе ПЛЕЄР при відкритті, а не форма створення. Причина проста: дошка без
 * комп'ютера, який гратиме, не має сенсу, а господарем мусить стати саме той
 * браузер, у якому лежать дескриптори теки.
 *
 * Повертає `info` — уже наявний або щойно створений. Якщо господар інший,
 * повертається чужий `info`, і сторінка плеєра мусить це показати: дошка
 * належить іншому комп'ютеру, і писати бібліотеку сюди не вийде.
 */
export async function ensureBoard(key: string, name: string): Promise<BoardInfo> {
	const { db, uid } = await connect();
	const { get, ref, serverTimestamp, set } = await import('firebase/database');

	const infoRef = ref(db, node(key, 'info'));
	const existing = await get(infoRef);
	if (existing.exists()) return existing.val() as BoardInfo;

	await set(infoRef, {
		name: name.slice(0, 60),
		ownerUid: uid,
		createdAt: serverTimestamp(),
		schema: BOARD_SCHEMA
	});

	return (await get(infoRef)).val() as BoardInfo;
}

/** Підписка на опис дошки. Повертає відписку. */
export async function watchInfo(
	key: string,
	onInfo: (info: BoardInfo | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, node(key, 'info')), (snapshot) =>
		onInfo(snapshot.val() as BoardInfo | null)
	);
}

/**
 * Викласти бібліотеку — ОДНИМ записом, разом із новим номером перечитування.
 *
 * Одним, а не потреково: інакше пульт під час перечитування бачив би список,
 * який росте по одному рядку, а на півдорозі — набір, якого на диску немає
 * (частина старих треків уже зникла, частина нових ще не приїхала).
 */
export async function publishLibrary(key: string, tracks: Record<string, Track>): Promise<void> {
	const { db } = await connect();
	const { ref, set } = await import('firebase/database');
	const library: Library = { rev: Date.now(), tracks };
	await set(ref(db, node(key, 'library')), library);
}

export async function watchLibrary(
	key: string,
	onLibrary: (library: Library | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, node(key, 'library')), (snapshot) =>
		onLibrary(snapshot.val() as Library | null)
	);
}

/**
 * Приховати трек від пульта або показати знову.
 *
 * Окремий вузол, а не поле в треку, і це не дрібниця: бібліотеку пише
 * сканування теки, а приховане — людина. Одне поле означало б, що кожне
 * перечитування теки або стирає рішення людини, або мусить їх обережно
 * зливати. Два вузли з одним письменником кожен цієї задачі не мають узагалі.
 */
export async function setHidden(key: string, trackId: string, hidden: boolean): Promise<void> {
	const { db } = await connect();
	const { ref, remove, set } = await import('firebase/database');
	const target = ref(db, `${node(key, 'hidden')}/${trackId}`);
	// Прибрати, а не писати `false`: інакше вузол ріс би записами «показаний»
	// для кожного треку, який колись ховали.
	await (hidden ? set(target, true) : remove(target));
}

export async function watchHidden(
	key: string,
	onHidden: (hidden: Record<string, boolean>) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, node(key, 'hidden')), (snapshot) =>
		onHidden((snapshot.val() as Record<string, boolean> | null) ?? {})
	);
}

/**
 * Оголосити стан плеєра. Пише лише плеєр.
 *
 * `atServer` ставить СЕРВЕР, а не плеєр. Пульт рахує поточну позицію як
 * `positionMs + (зараз − atServer)`, і якби мітку ставив плеєр, то в цю
 * арифметику ввійшла б різниця годинників двох пристроїв — смужка поповзла б
 * або назад, або надто швидко. Годинник у залі й годинник у телефоні
 * розходяться на хвилини легко.
 */
export async function publishState(
	key: string,
	state: Omit<PlayerState, 'atServer'>
): Promise<void> {
	const { db } = await connect();
	const { ref, serverTimestamp, set } = await import('firebase/database');
	await set(ref(db, node(key, 'state')), { ...state, atServer: serverTimestamp() });
}

export async function watchState(
	key: string,
	onState: (state: PlayerState | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, node(key, 'state')), (snapshot) =>
		onState(snapshot.val() as PlayerState | null)
	);
}
