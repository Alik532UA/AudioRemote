import type { BoardRole } from '$lib/board/myBoards';
import type { PresenceMap } from '$lib/net/presence';

/**
 * ХТО ПРИЙШОВ І ХТО ПІШОВ — подіями, а не числом.
 *
 * Картка дошки каже, скільки їх ЗАРАЗ. На питання «а коли він відпав» вона не
 * відповідає ніяк: число просто стало на одиницю менше, і помітити це можна
 * лише дивлячись на нього в ту саму секунду. Тому підключення й відключення
 * лягають у той самий журнал, що й решта дій.
 *
 * ## ВИТРИМКА — головне тут
 *
 * Присутність тримається на `onDisconnect`, тобто вона зникає від блимання
 * Wi-Fi так само, як від закритої вкладки. Без витримки помічник, що на дві
 * секунди втратив мережу в коридорі, дає в журналі пару рядків «відключено» й
 * «підключено» — і робить це щоразу. Журнал, у якому половина рядків про
 * мережу, перестає відповідати на питання, заради якого його читають.
 *
 * Тому «пішов» не записується одразу: він чекає `grace`, і якщо той самий
 * учасник за цей час повернувся, обидві події скасовуються. Повернувся
 * ПІЗНІШЕ — обидва рядки правдиві, і вони будуть.
 *
 * ## Перший знімок — не новина
 *
 * Ті, хто вже на дошці, коли її відкрили, не «щойно підключилися»: вони були
 * тут до нас. Перший знімок приймається мовчки.
 *
 * ## Рахуємо ЧУЖУ сторону
 *
 * Власна присутність теж лежить у знімку, і рядок «плеєр підключено» на екрані
 * самого плеєра — це шум про те, що людина й так бачить. Тому сторона, за якою
 * стежать, називається явно.
 */

export type PresenceEventKind = 'came' | 'went';

export interface PresenceEvent {
	kind: PresenceEventKind;
	/** Як підписався. Порожньо — не називався. */
	who: string;
}

/**
 * Скільки чекати, перш ніж повірити, що пішов.
 *
 * Десять секунд: блимання мережі, перемикання Wi-Fi на мобільний інтернет і
 * перезавантаження сторінки вкладаються в них із запасом, а людина, яка
 * справді вийшла, однаково не повертається за десять секунд.
 */
export const PRESENCE_GRACE_MS = 10_000;

/** Присутні потрібної сторони: ключ `uid/вкладка` → підпис. */
export function sideOf(present: PresenceMap, role: BoardRole): Map<string, string> {
	const out = new Map<string, string>();
	for (const [uid, tabs] of Object.entries(present)) {
		for (const [tab, entry] of Object.entries(tabs ?? {})) {
			if (entry?.role === role) out.set(`${uid}/${tab}`, entry.name?.trim() ?? '');
		}
	}
	return out;
}

export class PresenceEvents {
	private seen: Map<string, string> | null = null;
	private leaving = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private readonly role: BoardRole,
		private readonly report: (event: PresenceEvent) => void,
		private readonly grace: number = PRESENCE_GRACE_MS
	) {}

	/** Новий знімок присутності. Події віддаються через `report`. */
	see(present: PresenceMap): void {
		const now = sideOf(present, this.role);

		if (this.seen === null) {
			this.seen = now;
			return;
		}

		for (const [key, who] of now) {
			if (this.seen.has(key)) continue;
			const pending = this.leaving.get(key);
			if (pending) {
				// Блимнула мережа: він і не йшов. Обидві події скасовуються.
				clearTimeout(pending);
				this.leaving.delete(key);
				continue;
			}
			this.report({ kind: 'came', who });
		}

		for (const [key, who] of this.seen) {
			if (now.has(key) || this.leaving.has(key)) continue;
			this.leaving.set(
				key,
				setTimeout(() => {
					this.leaving.delete(key);
					this.report({ kind: 'went', who });
				}, this.grace)
			);
		}

		this.seen = now;
	}

	/** Зняти витримки. Інакше вони вистрелять у стан сторінки, якої вже немає. */
	stop(): void {
		for (const timer of this.leaving.values()) clearTimeout(timer);
		this.leaving.clear();
		this.seen = null;
	}
}
