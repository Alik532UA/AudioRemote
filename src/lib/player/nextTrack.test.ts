import { describe, expect, it } from 'vitest';
import { nextAfter } from './nextTrack';
import { DEFAULT_PLAY, type PlayPolicy } from '$lib/audio/boardConfig';

/**
 * ТУТ ПЕРЕВІРЯЄТЬСЯ ТЕ, ЧОГО НЕ ВИДНО НА ЕКРАНІ, ПОКИ НЕ ПІЗНО.
 *
 * Автоперехід спрацьовує в залі, між номерами, і помилка в ньому виглядає як
 * «музика заграла сама» — виправити це в ту мить нікому. Найдорожчі випадки
 * саме межові: останній трек списку, зниклий трек, перемикач «повторювати
 * список» при вимкненому автопереході.
 */

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const policy = (over: Partial<PlayPolicy>): PlayPolicy => ({ ...DEFAULT_PLAY, ...over });

describe('що грати після треку', () => {
	it('типово — нічого: дошка стоїть у залі, де тишу роблять навмисно', () => {
		expect(nextAfter(list, 'a', DEFAULT_PLAY)).toBeNull();
		expect(nextAfter(list, 'c', DEFAULT_PLAY)).toBeNull();
	});

	it('автоперехід веде до наступного й зупиняється на останньому', () => {
		const on = policy({ autoNext: true });
		expect(nextAfter(list, 'a', on)).toBe('b');
		expect(nextAfter(list, 'b', on)).toBe('c');
		expect(nextAfter(list, 'c', on)).toBeNull();
	});

	it('«повторювати список» замикає коло лише на останньому', () => {
		const on = policy({ autoNext: true, repeat: 'all' });
		expect(nextAfter(list, 'a', on)).toBe('b');
		expect(nextAfter(list, 'c', on)).toBe('a');
	});

	it('«повторювати список» без автопереходу не рухає нічого', () => {
		// Нічого не переходить — отже й замикати нема чого. На екрані про це
		// сказано прямо, а не лишено здогадуватися.
		expect(nextAfter(list, 'a', policy({ repeat: 'all' }))).toBeNull();
		expect(nextAfter(list, 'c', policy({ repeat: 'all' }))).toBeNull();
	});

	it('«повторювати трек» діє й без автопереходу: воно нікуди не переходить', () => {
		expect(nextAfter(list, 'b', policy({ repeat: 'one' }))).toBe('b');
		expect(nextAfter(list, 'b', policy({ repeat: 'one', autoNext: true }))).toBe('b');
	});

	it('трек, якого вже немає в списку, не дає наступного', () => {
		// Папку перечитали, поки трек звучав: продовжувати з місця, якого немає,
		// нема звідки — і «перший-ліпший» тут гірший за тишу.
		for (const mode of ['none', 'all', 'one'] as const) {
			expect(
				nextAfter(list, 'zzz', policy({ autoNext: true, repeat: mode })),
				`режим ${mode}`
			).toBeNull();
		}
	});

	it('список з одного треку: коло є, а руху далі немає', () => {
		const one = [{ id: 'a' }];
		expect(nextAfter(one, 'a', policy({ autoNext: true, repeat: 'all' }))).toBe('a');
		expect(nextAfter(one, 'a', policy({ autoNext: true }))).toBeNull();
	});

	it('порожній список не дає нічого й не падає', () => {
		expect(nextAfter([], 'a', policy({ autoNext: true, repeat: 'all' }))).toBeNull();
	});
});
