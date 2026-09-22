import type { PresenceMap } from '$lib/net/presence';
import { PRESENCE_GRACE_MS } from './presenceLog';

/**
 * ХТО ЗА ПУЛЬТОМ — список, що не смикається.
 *
 * ## Навіщо він узагалі
 *
 * Пульт на інфодошці ОДИН: панель у залі й панель на таблі — та сама сітка з
 * тими самими комірками. Копій на таблі кілька рівно з однієї причини: щоб було
 * видно, ХТО натиснув. Двоє помічників — дві однакові панелі, і натискання
 * першого світиться в першій, другого — у другій. Без цього друга копія не
 * варта місця на екрані.
 *
 * Отже список тут — це список ЕКРАНІВ, а не даних. Дані одні.
 *
 * ## Чому витримка, а не просто присутність
 *
 * Присутність тримається на `onDisconnect`, тобто зникає від блимання Wi-Fi так
 * само, як від закритої вкладки. Панель, привʼязана просто до присутності,
 * зникала б і зʼявлялася разом із мережею в коридорі — а це СІТКА, яку тиснуть
 * наосліп: зникла панель зсуває сусідні, і палець влучає не туди.
 *
 * Тому зниклий помічник спершу тьмяніє (`gone`) і лише через витримку залишає
 * місце. Число те саме, що й у журналі (`presenceLog.ts`): одна поведінка —
 * одне число.
 *
 * ## Порядок сталий
 *
 * Нові місця дописуються в кінець і не переставляються ніколи. Сортування за
 * імʼям чи часом означало б, що панель того самого помічника переїжджає, щойно
 * підключився ще один, — тобто знищувало б ту саму сталість місця, заради якої
 * сітка й будується.
 */

export interface Seat {
	/** `uid/вкладка` — той самий ключ, що й у присутності. */
	key: string;
	/** Хто це, для звірки з автором команди. Вкладки одного `uid` не розрізняються. */
	uid: string;
	/** Як назвався. Порожньо — не називався. */
	name: string;
	/** Який пульт обрав. Порожньо — дивиться всю дошку. */
	sheet: string;
	/** Уже зник, але ще в межах витримки: місце тьмяніє, а не звільняється. */
	gone: boolean;
}

/**
 * ## Чому тут немає рун
 *
 * Список місць реактивний, і тримає його сторінка — так само, як рівні,
 * прапорці й підсвітку. Сюди руни не пускаються навмисно: усе, що тут є, —
 * витримки й порядок, тобто звичайний стан звичайного обʼєкта. Клас із
 * `$state` заради одного поля змусив би цей файл бути `.svelte.ts`, а таймери
 * в рунному файлі читаються як спроба зробити їх реактивними — і саме про це
 * сварився б лінт.
 */
export class Roster {
	private seats: Seat[] = [];
	private leaving = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private readonly report: (seats: Seat[]) => void,
		private readonly grace: number = PRESENCE_GRACE_MS
	) {}

	/** Новий знімок присутності. Місця зʼявляються одразу, звільняються з витримкою. */
	saw(present: PresenceMap): void {
		const here = new Map<string, Seat>();
		for (const [uid, tabs] of Object.entries(present)) {
			for (const [tab, entry] of Object.entries(tabs ?? {})) {
				if (entry?.role !== 'remote') continue;
				const key = `${uid}/${tab}`;
				here.set(key, {
					key,
					uid,
					name: entry.name?.trim() ?? '',
					sheet: entry.sheet?.trim() ?? '',
					gone: false
				});
			}
		}

		const next = this.seats.map((seat) => {
			const fresh = here.get(seat.key);
			if (fresh) {
				// Повернувся в межах витримки: місце не звільнялося й не переїжджає.
				this.cancel(seat.key);
				return fresh;
			}
			if (!seat.gone) this.schedule(seat.key);
			return { ...seat, gone: true };
		});

		const known = new Set(next.map((seat) => seat.key));
		for (const [key, seat] of here) if (!known.has(key)) next.push(seat);

		this.publish(next);
	}

	/** Зняти витримки. Інакше вони вистрелять у сторінку, якої вже немає. */
	forget(): void {
		for (const timer of this.leaving.values()) clearTimeout(timer);
		this.leaving.clear();
		this.publish([]);
	}

	private publish(seats: Seat[]): void {
		this.seats = seats;
		this.report(seats);
	}

	private cancel(key: string): void {
		const timer = this.leaving.get(key);
		if (timer) clearTimeout(timer);
		this.leaving.delete(key);
	}

	private schedule(key: string): void {
		this.cancel(key);
		this.leaving.set(
			key,
			setTimeout(() => {
				this.leaving.delete(key);
				this.publish(this.seats.filter((seat) => seat.key !== key));
			}, this.grace)
		);
	}
}
