// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Roster, type Seat } from './roster';
import { PRESENCE_GRACE_MS } from './presenceLog';
import type { PresenceMap } from '$lib/net/presence';

/**
 * МІСЦЕ ЗА ПУЛЬТОМ НЕ МУСИТЬ ПЕРЕЇЖДЖАТИ.
 *
 * Панелі на таблі — це копії ОДНІЄЇ сітки, і кожна існує заради того, щоб було
 * видно, чиє натискання світиться. Тому дві властивості тут дорожчі за решту, і
 * обидві ламаються тихо:
 *
 *  1. порядок. Панель, що переїхала, коли підключився ще один помічник, — це
 *     кнопка, яка опинилася не там, де на неї щойно дивилися;
 *  2. витримка. Без неї блимання Wi-Fi прибирає панель, зсуває сусідні, і
 *     палець влучає не туди — на сітці, яку тиснуть наосліп.
 */

const present = (
	tabs: Record<string, { role: 'player' | 'remote'; name?: string; sheet?: string }>
): PresenceMap => {
	const out: PresenceMap = {};
	for (const [key, value] of Object.entries(tabs)) {
		const [uid, tab] = key.split('/');
		out[uid] ??= {};
		out[uid][tab] = {
			role: value.role,
			at: 0,
			...(value.name ? { name: value.name } : {}),
			...(value.sheet ? { sheet: value.sheet } : {})
		};
	}
	return out;
};

let roster: Roster;
let seats: Seat[];

beforeEach(() => {
	vi.useFakeTimers();
	seats = [];
	roster = new Roster((next) => (seats = next));
});

afterEach(() => {
	roster.forget();
	vi.useRealTimers();
});

describe('місця за пультом', () => {
	it('бере лише помічників, з імʼям і обраним пультом', () => {
		roster.saw(
			present({
				'a/1': { role: 'player' },
				'b/1': { role: 'remote', name: 'Оля', sheet: 'світло' }
			})
		);
		expect(seats).toEqual([{ key: 'b/1', uid: 'b', name: 'Оля', sheet: 'світло', gone: false }]);
	});

	it('дві вкладки одного uid — два місця', () => {
		// Анонімний вхід дає обом вкладкам той самий `uid`; без другого рівня
		// другий помічник не отримав би панелі взагалі.
		roster.saw(present({ 'b/1': { role: 'remote' }, 'b/2': { role: 'remote' } }));
		expect(seats.map((seat) => seat.key)).toEqual(['b/1', 'b/2']);
	});

	it('новий стає в КІНЕЦЬ, а не перемішує наявних', () => {
		roster.saw(present({ 'b/1': { role: 'remote', name: 'Оля' } }));
		roster.saw(
			present({ 'b/1': { role: 'remote', name: 'Оля' }, 'a/1': { role: 'remote', name: 'Ада' } })
		);
		expect(
			seats.map((seat) => seat.name),
			'панель переїхала під новим сусідом'
		).toEqual(['Оля', 'Ада']);
	});

	it('зниклий тьмяніє, а місце звільняє аж після витримки', () => {
		roster.saw(present({ 'b/1': { role: 'remote', name: 'Оля' } }));
		roster.saw(present({}));
		expect(
			seats.map((seat) => seat.gone),
			'місце звільнилося одразу'
		).toEqual([true]);

		vi.advanceTimersByTime(PRESENCE_GRACE_MS);
		expect(seats).toEqual([]);
	});

	it('блимання мережі не смикає сітку й не міняє порядку', () => {
		roster.saw(
			present({ 'b/1': { role: 'remote', name: 'Оля' }, 'c/1': { role: 'remote', name: 'Ада' } })
		);
		roster.saw(present({ 'c/1': { role: 'remote', name: 'Ада' } }));
		vi.advanceTimersByTime(PRESENCE_GRACE_MS - 1);
		roster.saw(
			present({ 'b/1': { role: 'remote', name: 'Оля' }, 'c/1': { role: 'remote', name: 'Ада' } })
		);
		vi.advanceTimersByTime(PRESENCE_GRACE_MS * 2);

		expect(seats.map((seat) => `${seat.name}:${seat.gone}`)).toEqual(['Оля:false', 'Ада:false']);
	});

	it('зміна пульта на ходу видно, і місце лишається тим самим', () => {
		roster.saw(present({ 'b/1': { role: 'remote', name: 'Оля' } }));
		roster.saw(present({ 'b/1': { role: 'remote', name: 'Оля', sheet: 'завіса' } }));
		expect(seats).toEqual([{ key: 'b/1', uid: 'b', name: 'Оля', sheet: 'завіса', gone: false }]);
	});

	it('зупинка знімає витримки', () => {
		roster.saw(present({ 'b/1': { role: 'remote' } }));
		roster.saw(present({}));
		roster.forget();
		vi.advanceTimersByTime(PRESENCE_GRACE_MS * 2);

		expect(seats).toEqual([]);
	});
});
