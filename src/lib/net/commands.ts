import { boardPath } from '$lib/board/boardPath';
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

const cmdPath = (key: string) => `${boardPath(key)}/cmd`;
const ackPath = (key: string) => `${boardPath(key)}/ack`;

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
export async function sendCommand(
	key: string,
	type: CommandType,
	value?: string | number
): Promise<SendResult> {
	await ensureOffset();
	const { db, uid } = await connect();
	const { push, ref, serverTimestamp, set } = await import('firebase/database');

	const entry = push(ref(db, cmdPath(key)));
	const payload: Record<string, unknown> = { by: uid, type, at: serverTimestamp() };
	// Поле `value` пишеться лише коли воно є: `undefined` RTDB не приймає, а
	// `null` створив би дитину, яку правило не знає.
	if (value !== undefined) payload.value = value;

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
export async function waitForAck(key: string, id: string): Promise<Ack | null> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');

	return new Promise((resolve) => {
		let settled = false;
		const finish = (ack: Ack | null) => {
			if (settled) return;
			settled = true;
			stop();
			clearTimeout(timer);
			resolve(ack);
		};

		const timer = setTimeout(() => finish(null), ACK_TIMEOUT_MS);
		const stop = onValue(ref(db, `${ackPath(key)}/${id}`), (snapshot) => {
			const value = snapshot.val() as Ack | null;
			if (value) finish(value);
		});
	});
}

/**
 * Приймач: слухати команди.
 *
 * `handle` виконує команду й повертає ключ помилки або `null` при успіху. Усе
 * інше — вік команди, квитанція, прибирання — робиться тут, щоб сторінка плеєра
 * не мусила пам'ятати про жодну з цих трьох речей.
 */
export async function watchCommands(
	key: string,
	handle: (command: Command) => Promise<string | null>
): Promise<() => void> {
	await ensureOffset();
	const { db } = await connect();
	const { onChildAdded, ref, remove, serverTimestamp, set } = await import('firebase/database');

	return onChildAdded(ref(db, cmdPath(key)), (snapshot) => {
		const id = snapshot.key;
		const command = snapshot.val() as Command | null;
		if (!id || !command) return;

		const drop = () => remove(ref(db, `${cmdPath(key)}/${id}`));

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
				set(ref(db, `${ackPath(key)}/${id}`), {
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
export async function pruneAcks(key: string): Promise<void> {
	const { db } = await connect();
	const { get, ref, update } = await import('firebase/database');

	const all = await get(ref(db, ackPath(key)));
	if (!all.exists()) return;

	const stale: Record<string, null> = {};
	const cutoff = serverNow() - COMMAND_TTL_MS;
	all.forEach((child) => {
		const ack = child.val() as Ack;
		if (child.key && ack.at < cutoff) stale[child.key] = null;
	});

	if (Object.keys(stale).length > 0) await update(ref(db, ackPath(key)), stale);
}
