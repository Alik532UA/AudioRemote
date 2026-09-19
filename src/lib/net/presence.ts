import { boardPath } from '$lib/board/boardPath';
import { connect } from './firebase';
import type { BoardRole } from '$lib/board/myBoards';

/**
 * ПРИСУТНІСТЬ — усе, що тримається на `onDisconnect`, тобто на обіцянці, яку
 * виконує СЕРВЕР, коли клієнт зник.
 *
 * ## Чому це окремий модуль
 *
 * Тут інша природа записів. Бібліотека й стан — те, що застосунок пише
 * навмисно і що мусить пережити обрив. Присутність навпаки: вона існує рівно
 * доти, доки живий сокет, і зникає без жодної участі коду. Змішані в одному
 * файлі, ці дві речі читаються як одна.
 *
 * ## Чому взагалі RTDB, а не щось інше
 *
 * Через `onDisconnect()`. Для цього застосунку питання «комп'ютер на зв'язку чи
 * вкладку закрили» — не дрібниця інтерфейсу, а головне, що людина з телефоном
 * хоче знати ПЕРЕД тим, як натиснути. Клієнт сам про свій обрив не напише: у
 * тому єдиному випадку, для якого присутність і існує — вкладку закрили, кришку
 * ноутбука опустили, зв'язок зник у коридорі, — писати вже нікому.
 *
 * ## Ключ — НЕ `uid`, а `uid` плюс вкладка. Заміряно.
 *
 * Спершу присутність лежала в `presence/{uid}`, і на двох пристроях це
 * працювало. Ламалося воно рівно тоді, коли плеєр і пульт опинялися в ОДНОМУ
 * браузері: анонімний вхід дає обом вкладкам той самий `uid`, тож друга
 * перетирала запис першої. На екрані це виглядало так: плеєр відкритий і
 * працює, а пульт поруч каже «комп'ютер офлайн».
 *
 * Тепер шлях — `presence/{uid}/{вкладка}`. Правило доступу від цього не
 * послабилося ні на крок: дозвіл і далі стоїть на `$uid === auth.uid` і
 * поширюється на все, що під ним, тобто писати за іншого так само не можна.
 *
 * Ідентифікатор вкладки живе в пам'яті сторінки й не зберігається ніде:
 * присутність і так має зникнути разом із вкладкою.
 *
 * ## Порядок не косметичний
 *
 * Спершу домовляємось, ЩО прибрати, і лише тоді зʼявляємось. У зворотному
 * порядку існує вікно, у якому запис уже є, а домовленості про його прибирання
 * ще немає, — і зникнення клієнта саме в цю мить лишає привида назавжди.
 */

const presencePath = (key: string) => `${boardPath(key)}/presence`;

/** Ідентифікатор ЦІЄЇ вкладки. Один на завантаження сторінки. */
const TAB_ID = Math.random().toString(36).slice(2, 10);

export interface Presence {
	role: BoardRole;
	at: number;
}

/** `presence/{uid}/{вкладка}` — два рівні, тому й тип вкладений. */
export type PresenceMap = Record<string, Record<string, Presence>>;

/** Тримати присутність, поки жива вкладка. Повертає функцію «піти явно». */
export async function trackPresence(key: string, role: BoardRole): Promise<() => void> {
	const { db, uid } = await connect();
	const { onDisconnect, ref, remove, serverTimestamp, set } = await import('firebase/database');

	const mine = ref(db, `${presencePath(key)}/${uid}/${TAB_ID}`);

	await onDisconnect(mine).remove();
	await set(mine, { role, at: serverTimestamp() });

	return () => void remove(mine);
}

/** Хто зараз на дошці. Повертає відписку. */
export async function watchPresence(
	key: string,
	onPresence: (present: PresenceMap) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, presencePath(key)), (snapshot) =>
		onPresence((snapshot.val() as PresenceMap | null) ?? {})
	);
}

/** Усі записи присутності одним списком — рівні `uid` тут уже не важать. */
const entries = (present: PresenceMap): Presence[] =>
	Object.values(present).flatMap((tabs) => Object.values(tabs ?? {}));

/** Чи є серед присутніх плеєр — тобто чи є кому грати. */
export function hasPlayer(present: PresenceMap): boolean {
	return entries(present).some((entry) => entry.role === 'player');
}

/** Скільки пультів на зв'язку. Плеєр показує це, щоб було видно, хто керує. */
export function countRemotes(present: PresenceMap): number {
	return entries(present).filter((entry) => entry.role === 'remote').length;
}
