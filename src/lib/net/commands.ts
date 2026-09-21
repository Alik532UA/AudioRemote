import { connect } from './firebase';
import {
	ACK_TIMEOUT_MS,
	COMMAND_TTL_MS,
	type Ack,
	type Command,
	type CommandType
} from './boardTypes';

/**
 * КАНАЛ КОМАНД: пульт дописує, приймач виконує й квитує.
 *
 * ## Журнал «лише створити», а не поле «остання команда»
 *
 * Спокуса зробити один вузол `lastCommand`, у який пише пульт, велика. Наслідки
 * з неї теж: два пульти перетирають один одного, повторне натискання тієї самої
 * кнопки не змінює значення й не долітає взагалі, а правило доступу неможливо
 * звузити — вузол один, письменників багато.
 *
 * Журнал цього не має. Команда — окрема дитина, яку можна лише СТВОРИТИ:
 * повторний запис того самого ключа відкидає база, а не клієнт.
 *
 * ## Межа життя — головне тут
 *
 * `onChildAdded` віддає ВСІ наявні вузли при підписці, не лише нові. Приймач,
 * який відкрили о дев'ятій ранку, отримав би всі команди, що накопичилися за
 * ніч, і програв би їх підряд. Тому кожна команда несе серверний час, а
 * приймач мовчки викидає старші за `COMMAND_TTL_MS`.
 *
 * ## Час рахується СЕРВЕРНИЙ
 *
 * Порівнювати серверну мітку з `Date.now()` приймача не можна: годинник
 * комп'ютера в залі й годинник сервера розходяться, і при відставанні на
 * хвилину приймач відкидав би геть усі команди, включно зі щойно надісланою.
 * Виглядало б це як «пульт не працює». Тому береться зсув із
 * `.info/serverTimeOffset`, який RTDB рахує сама.
 */

/*
 * КАНАЛ ЗАДАЄТЬСЯ ШЛЯХОМ, А НЕ КЛЮЧЕМ ДОШКИ.
 *
 * Каналів тепер два, і влаштовані вони однаково: `boards/{ключ}` для гри
 * звуком і `admin/{ключ}` для налаштувань. Різні в них лише набір типів і те,
 * хто має право слухати; журнал «лише створити», межа життя команди, квитанція
 * й прибирання — ті самі. Другий екземпляр цього коду розійшовся б із першим
 * рівно там, де це найважче помітити: у поводженні з часом.
 */
const cmdPath = (base: string) => `${channel(base)}/cmd`;
const ackPath = (base: string) => `${channel(base)}/ack`;

/**
 * Шлях, а не ключ, — і це перевіряється.
 *
 * Обидва — рядки, тож підміна одного одним для типів невидима: передали `key`
 * замість `boards/{key}` — і команди поїхали в корінь бази, де їх ніхто не
 * слухає, а правила відмовили б без пояснень. Симптом був би «пульт не працює»,
 * причина — один пропущений виклик.
 */
function channel(base: string): string {
	if (!base.includes('/')) {
		throw new Error(`канал задається шляхом, а не ключем: «${base}»`);
	}
	return base;
}

/** Зсув годинника цього пристрою відносно сервера, у мілісекундах. */
let serverOffset = 0;

async function trackServerOffset(): Promise<void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
		serverOffset = (snapshot.val() as number | null) ?? 0;
	});
}

let offsetTracked = false;
async function ensureOffset(): Promise<void> {
	if (offsetTracked) return;
	offsetTracked = true;
	await trackServerOffset();
}

/** Поточний серверний час, як його бачить цей пристрій. */
export const serverNow = (): number => Date.now() + serverOffset;

export interface SendResult {
	/** Ключ команди — за ним приходить квитанція. */
	id: string;
}

/**
 * Надіслати команду. Кидає, якщо база відмовила, — це дія, яку щойно натиснули,
 * і мовчазна невдача виглядала б як кнопка, що не працює.
 */
export async function sendCommand<T extends string = CommandType>(
	base: string,
	type: T,
	value?: string | number,
	/**
	 * Поля конверта, які знає лише свій вид дошки.
	 *
	 * Сьогодні це `cell` в інфодошці: номер комірки потрібен усім трьом її
	 * командам, а в звукових його немає взагалі. Класти його в `value` не
	 * можна — там уже лежить номер кнопки чи крок повзунка.
	 *
	 * Окремий `sendPanelCommand` поруч розійшовся б із цим на першій же правці
	 * поводження з часом, а саме там і ховаються дефекти каналу команд.
	 */
	extra?: Readonly<Record<string, string | number>>
): Promise<SendResult> {
	await ensureOffset();
	const { db, uid } = await connect();
	const { push, ref, serverTimestamp, set } = await import('firebase/database');

	const entry = push(ref(db, cmdPath(base)));
	const payload: Record<string, unknown> = { by: uid, type, at: serverTimestamp() };
	// Поле `value` пишеться лише коли воно є: `undefined` RTDB не приймає, а
	// `null` створив би дитину, яку правило не знає.
	if (value !== undefined) payload.value = value;
	for (const [field, own] of Object.entries(extra ?? {})) payload[field] = own;

	await set(entry, payload);
	return { id: entry.key as string };
}

/**
 * Дочекатися квитанції на команду.
 *
 * Без неї пульт показував би «зроблено» на кожне натискання — включно з тим
 * випадком, коли вкладку приймача закрили хвилину тому. Тайм-аут тут теж
 * відповідь: «комп'ютер не відповів» — це інше повідомлення, ніж «не вийшло
 * програти», і людині вони кажуть різні речі.
 */
export async function waitForAck(base: string, id: string): Promise<Ack | null> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');

	return new Promise((resolve) => {
		let settled = false;
		/*
		 * `let`, А НЕ `const` ПІСЛЯ `finish`.
		 *
		 * `onValue` має право покликати колбек СИНХРОННО — коли значення вже
		 * лежить у кеші SDK. Тоді `finish` виконується всередині самого виклику
		 * `onValue`, тобто до того, як його результат кудись записали: звернення
		 * до `const stop` у цю мить дає не «ще не підписалися», а
		 * `ReferenceError` із мертвої зони. Впало б це в колбеку бази, де на
		 * нього ніхто не чекає, і виглядало б як «пульт не дочекався квитанції».
		 *
		 * Сьогодні вузол квитанції щойно створений і в кеші його нема, тож шлях
		 * не спрацьовує. Це пастка на завтра, а не дефект на сьогодні.
		 */
		let stop: (() => void) | null = null;
		const finish = (ack: Ack | null) => {
			if (settled) return;
			settled = true;
			stop?.();
			clearTimeout(timer);
			resolve(ack);
		};

		const timer = setTimeout(() => finish(null), ACK_TIMEOUT_MS);
		stop = onValue(ref(db, `${ackPath(base)}/${id}`), (snapshot) => {
			const value = snapshot.val() as Ack | null;
			if (value) finish(value);
		});
		// Синхронний колбек уже пройшов повз `stop?.()` — знімаємо підписку тут,
		// інакше вона лишилася б назавжди саме в тому випадку, який ми й лікуємо.
		if (settled) stop();
	});
}

/**
 * Приймач: слухати команди.
 *
 * `handle` виконує команду й повертає ключ помилки або `null` при успіху. Усе
 * інше — вік команди, квитанція, прибирання — робиться тут, щоб сторінка плеєра
 * не мусила пам'ятати про жодну з цих трьох речей.
 */
export async function watchCommands<
	T extends string = CommandType,
	/**
	 * Уся форма команди, а не лише тип.
	 *
	 * Інфодошка возить у конверті ще й номер комірки, і без другого параметра
	 * оброблювач бачив би `Command<T>` без нього — тобто мусив би приводити тип
	 * руками рівно там, де помилка тиха.
	 */
	C extends Command<T> = Command<T>
>(base: string, handle: (command: C) => Promise<string | null>): Promise<() => void> {
	await ensureOffset();
	const { db } = await connect();
	const { onChildAdded, ref, remove, serverTimestamp, set } = await import('firebase/database');

	return onChildAdded(ref(db, cmdPath(base)), (snapshot) => {
		const id = snapshot.key;
		const command = snapshot.val() as C | null;
		if (!id || !command) return;

		const drop = () => remove(ref(db, `${cmdPath(base)}/${id}`));

		/*
		 * ПРОСТРОЧЕНА КОМАНДА ПРИБИРАЄТЬСЯ МОВЧКИ — без квитанції.
		 *
		 * Квитанція на неї була б гіршою за мовчання: пульт, який її надіслав,
		 * давно закритий, а той, хто відкриє його завтра, побачив би відповідь
		 * на натискання, якого не робив.
		 */
		if (serverNow() - command.at > COMMAND_TTL_MS) {
			void drop();
			return;
		}

		void handle(command)
			.then((error) =>
				set(ref(db, `${ackPath(base)}/${id}`), {
					ok: error === null,
					...(error ? { error } : {}),
					at: serverTimestamp()
				})
			)
			.finally(drop);
	});
}

/**
 * Прибрати старі квитанції.
 *
 * Квитанція живе рівно до того, як її прочитає пульт, але пульт може й не
 * прочитати — вкладку закрили. Без прибирання вузол ріс би вічно. Кличе
 * приймач при відкритті: це єдиний, хто має право писати в `ack`.
 */
export async function pruneAcks(base: string): Promise<void> {
	const { db } = await connect();
	const { get, ref, update } = await import('firebase/database');

	const all = await get(ref(db, ackPath(base)));
	if (!all.exists()) return;

	const stale: Record<string, null> = {};
	const cutoff = serverNow() - COMMAND_TTL_MS;
	all.forEach((child) => {
		const ack = child.val() as Ack;
		if (child.key && ack.at < cutoff) stale[child.key] = null;
	});

	if (Object.keys(stale).length > 0) await update(ref(db, ackPath(base)), stale);
}
