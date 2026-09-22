// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE_GRACE_MS, PresenceEvents, sideOf, type PresenceEvent } from './presenceLog';
import type { PresenceMap } from '$lib/net/presence';

/**
 * ВИТРИМКА — ЄДИНЕ, ЗАРАДИ ЧОГО ЦЕЙ ФАЙЛ ІСНУЄ.
 *
 * Різницю між «пішов» і «блимнув Wi-Fi» присутність не розрізняє в принципі:
 * `onDisconnect` виконує сервер, і запис зникає однаково в обох випадках. Тому
 * все, що тут можна зробити, — почекати; і все, що можна перевірити, — що
 * чекання справді працює в обидва боки.
 *
 * Помилка тут тиха: журнал наповнюється парами «відключено / підключено» про
 * одну й ту саму людину, і питання, заради якого його читають, тоне в них.
 */

const board = (tabs: Record<string, { role: 'player' | 'remote'; name?: string }>): PresenceMap => {
	const out: PresenceMap = {};
	for (const [key, value] of Object.entries(tabs)) {
		const [uid, tab] = key.split('/');
		out[uid] ??= {};
		out[uid][tab] = { role: value.role, at: 0, ...(value.name ? { name: value.name } : {}) };
	}
	return out;
};

let seen: PresenceEvent[];
let watch: PresenceEvents;

beforeEach(() => {
	vi.useFakeTimers();
	seen = [];
	watch = new PresenceEvents('remote', (event) => seen.push(event));
});

afterEach(() => {
	watch.stop();
	vi.useRealTimers();
});

describe('сторона присутності', () => {
	it('бере лише потрібну роль і ключує вкладкою', () => {
		const present = board({
			'a/1': { role: 'player' },
			'b/1': { role: 'remote', name: 'Оля' },
			'b/2': { role: 'remote' }
		});
		expect([...sideOf(present, 'remote')]).toEqual([
			['b/1', 'Оля'],
			['b/2', '']
		]);
	});

	it('дві вкладки одного uid — це двоє присутніх', () => {
		// Той самий анонімний вхід дає обом вкладкам однаковий uid; без другого
		// рівня вони перетирали б одна одну.
		expect(
			sideOf(board({ 'b/1': { role: 'remote' }, 'b/2': { role: 'remote' } }), 'remote').size
		).toBe(2);
	});
});

describe('події присутності', () => {
	it('перший знімок мовчить: ті, хто вже тут, не «щойно прийшли»', () => {
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		expect(seen, 'відкриття дошки дало подію про тих, хто був до нас').toEqual([]);
	});

	it('новий учасник — подія одразу, з підписом', () => {
		watch.see(board({}));
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		expect(seen).toEqual([{ kind: 'came', who: 'Оля' }]);
	});

	it('своя сторона не рахується', () => {
		watch.see(board({}));
		watch.see(board({ 'a/1': { role: 'player' } }));
		expect(seen, 'рядок про власну вкладку — шум про те, що людина й так бачить').toEqual([]);
	});

	it('пішов — подія аж після витримки', () => {
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		watch.see(board({}));
		expect(seen, 'записали «пішов» одразу').toEqual([]);

		vi.advanceTimersByTime(PRESENCE_GRACE_MS);
		expect(seen).toEqual([{ kind: 'went', who: 'Оля' }]);
	});

	it('блимання мережі не лишає в журналі НІЧОГО', () => {
		/*
		 * Головний опис файлу. Без витримки тут було б два рядки на кожну
		 * секунду без Wi-Fi у коридорі — і так щоразу.
		 */
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		watch.see(board({}));
		vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		vi.advanceTimersByTime(PRESENCE_GRACE_MS * 2);

		expect(seen, 'блимання мережі потрапило в журнал').toEqual([]);
	});

	it('повернувся ПІЗНІШЕ — обидва рядки правдиві, і вони є', () => {
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));
		watch.see(board({}));
		vi.advanceTimersByTime(PRESENCE_GRACE_MS + 1);
		watch.see(board({ 'b/1': { role: 'remote', name: 'Оля' } }));

		expect(seen).toEqual([
			{ kind: 'went', who: 'Оля' },
			{ kind: 'came', who: 'Оля' }
		]);
	});

	it('зупинка знімає витримки', () => {
		// Інакше таймер вистрелить у стан сторінки, якої вже немає.
		watch.see(board({ 'b/1': { role: 'remote' } }));
		watch.see(board({}));
		watch.stop();
		vi.advanceTimersByTime(PRESENCE_GRACE_MS * 2);

		expect(seen).toEqual([]);
	});
});
