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

	/*
	 * МЕЖА ЧАСУ, бо без неї «шукаємо дошку» триває вічність.
	 *
	 * Читання в Realtime Database не відмовляє, коли бази немає, — воно лягає в
	 * чергу SDK і чекає сокета, якого не буде. На телефоні це виглядає як
	 * кнопка, що назавжди застрягла на «Шукаємо дошку»: ні відповіді, ні
	 * помилки, ні підказки, що робити.
	 *
	 * Десять секунд — це вже точно не «повільна мережа»: сама відповідь важить
	 * байти, а метро й поїзд мають право бути повільними.
	 */
	const lookup = get(ref(db, node(key, 'info'))).then((snapshot) => snapshot.exists());

	/*
	 * ТАЙМЕР ГАСИТЬСЯ Й ТОДІ, КОЛИ ВІН ПРОГРАВ.
	 *
	 * `Promise.race` не скасовує програвшого — він лише перестає його слухати.
	 * Без `finally` кожен пошук дошки лишав за собою десятисекундний таймер,
	 * а пошук повторюють підбором пароля: кожна невдала спроба з форми — ще
	 * один. Відмови без нагляду це не давало (race підписаний на обидва
	 * проміси, тож пізнє відхилення перехоплене), тому й не видно було нічого.
	 */
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			lookup,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new BoardLookupTimeout()), LOOKUP_TIMEOUT_MS);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** Скільки чекати на відповідь бази, перш ніж сказати, що її не чути. */
const LOOKUP_TIMEOUT_MS = 10_000;

/** База не відповіла вчасно. Це НЕ «дошки немає» — це «бази немає». */
export class BoardLookupTimeout extends Error {
	constructor() {
		super('база не відповіла');
		this.name = 'BoardLookupTimeout';
	}
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
	if (existing.exists()) {
		const info = existing.val() as BoardInfo;

		/*
		 * ПОЗНАЧКА «ДОШКОЮ КОРИСТУЮТЬСЯ» — від неї рахується вік при прибиранні
		 * (`boardLifetime.ts`). Пише її лише господар: правило інакше й не
		 * дозволить, та й змісту в чужій позначці немає — забутий увімкнений
		 * планшет із пультом тримав би дошку вічно.
		 *
		 * Не `await`: відкриття плеєра не мусить чекати на запис, а невдача
		 * тут не мусить заважати грати. Найгірше, що станеться, — дошка
		 * зістариться на день раніше.
		 */
		if (info.ownerUid === uid) {
			void set(ref(db, node(key, 'info/seenAt')), serverTimestamp()).catch(() => {});
		}

		return info;
	}

	await set(infoRef, {
		name: name.slice(0, 60),
		ownerUid: uid,
		createdAt: serverTimestamp(),
		seenAt: serverTimestamp(),
		schema: BOARD_SCHEMA
	});

	return (await get(infoRef)).val() as BoardInfo;
}

/**
 * Прочитати опис дошки один раз. `null`, якщо дошки немає.
 *
 * Окремо від `boardExists`, бо потрібне не «є чи немає», а сам опис: за
 * `createdAt` і `seenAt` вирішується, чи дошку вже можна прибрати
 * (`boardLifetime.ts`). Межі часу тут немає навмисно — це прибирання, воно
 * робиться у фоні й нікого не тримає, на відміну від пошуку дошки з форми.
 */
export async function readInfo(key: string): Promise<BoardInfo | null> {
	const { db } = await connect();
	const { get, ref } = await import('firebase/database');
	const snapshot = await get(ref(db, node(key, 'info')));
	return snapshot.exists() ? (snapshot.val() as BoardInfo) : null;
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

/**
 * Знести дошку з бази.
 *
 * ## Чого тут не було
 *
 * Дошки не видалялися НІЧИМ. Правило `boards/$key` дозволяє господареві знести
 * свою дошку від першого дня, але коду, який цим користується, не існувало:
 * `forgetBoard` прибирає лише місцевий запис у браузері, і назва кнопки
 * («прибрати зі списку») про це чесно казала. Тобто кожна створена дошка
 * лишалася в базі назавжди.
 *
 * Гірше за обсяг те, що прибрати її було НІЧИМ: `boards` не перелічується за
 * побудовою — саме на цьому тримається пароль, — отже ні людина в консолі, ні
 * прибиральний скрипт не можуть знайти покинуту дошку. Адресу знає лише той,
 * хто зберіг пароль, і лише доки зберіг.
 *
 * ## Чому лише господар і чому лише цим шляхом
 *
 * Правило вимагає `auth.uid === info/ownerUid` І `!newData.exists()`: знести —
 * можна, підмінити під виглядом видалення — ні. Анонімний вхід дає сталий uid
 * на браузер, тож господар — це той самий браузер, у якому дошку створили.
 * Інший пристрій, навіть із паролем, дошку не зітре, і це правильно: пароль
 * дає право КОРИСТУВАТИСЯ, а не знищувати.
 *
 * Відмова тут не мовчазна: виняток іде нагору, і меню показує його людині.
 * Мовчазна невдача читалася б як «видалив», а дошка лишалася б жити.
 */
export async function deleteBoard(key: string): Promise<void> {
	const { db } = await connect();
	const { ref, remove } = await import('firebase/database');
	await remove(ref(db, boardPath(key)));
}
