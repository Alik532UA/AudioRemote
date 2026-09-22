// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InsecureContextError } from '$lib/board/boardPath';
import { BoardLookupTimeout } from './board';
import { ConfigMissingError, ConnectionDownError } from './firebase';
import { describeError, FIX_COMMAND } from './describeError';

/**
 * ЩО ЛЮДИНА ПОБАЧИТЬ, КОЛИ МЕРЕЖА ВІДМОВИЛА.
 *
 * Це єдине місце, де відмова перетворюється на пораду, і воно було на
 * половинному покритті: гілки, які розбирають ЧУЖУ форму помилки — код Firebase
 * і голий текст правил RTDB, — не виконувалися жодного разу.
 *
 * Саме вони й найкрихкіші. Класи (`ConnectionDownError` і сусіди) наші, і
 * перейменування ловить компілятор. А `PERMISSION_DENIED`, `permission-denied`
 * і `permission_denied at /boards/…` — три різні написання одного й того ж, що
 * приходять із трьох різних шарів чужої бібліотеки. Помилитися в них можна
 * мовчки: `describeError` не кине, а поверне «щось пішло не так» — і людина
 * замість «правила не викладені» побачить пораду, якої немає.
 *
 * Тому опис питає не «чи є гілка», а ЩО САМЕ повертається на кожній формі, у
 * якій відмова справді приходить.
 */

describe('describeError — відмова стає порадою', () => {
	it('емулятор і бойова база відрізняються, бо дія різна', () => {
		// Одна й та сама відмова: у розробника «підніми емулятор», у залі
		// «перевір інтернет». Порада, спільна на обидва випадки, марна двічі.
		expect(describeError(new ConnectionDownError(true))).toBe('error.emulatorDown');
		expect(describeError(new ConnectionDownError(false))).toBe('error.network');
	});

	it('наші класи відмов кожен зі своєю порадою', () => {
		expect(describeError(new BoardLookupTimeout())).toBe('error.dbOffline');
		expect(describeError(new ConfigMissingError('ключа'))).toBe('error.configMissing');
		expect(describeError(new InsecureContextError())).toBe('player.insecure');
	});

	/*
	 * ТРИ НАПИСАННЯ ОДНІЄЇ ВІДМОВИ. Firebase Auth каже `permission-denied`,
	 * RTDB — `PERMISSION_DENIED`, а правила, спрацювавши на записі, не дають
	 * коду взагалі: лише рядок. Усі три означають «правила не викладені», і
	 * будь-яке з них, розібране неправильно, дає «щось пішло не так».
	 */
	it.each([
		['код RTDB', { code: 'PERMISSION_DENIED' }],
		['код Auth', { code: 'permission-denied' }],
		['голий текст правил', new Error('permission_denied at /boards/ABCDE: Client doesn\u2019t have')],
		['текст із великої', new Error('Permission denied')]
	])('відмова правил упізнається: %s', (_what, error) => {
		expect(describeError(error)).toBe('error.denied');
	});

	it('мережева відмова впізнається за підрядком у коді', () => {
		// Саме підрядок: Firebase шле `auth/network-request-failed`, і повний
		// перелік його кодів ми не тримаємо.
		expect(describeError({ code: 'auth/network-request-failed' })).toBe('error.network');
	});

	/*
	 * ПОРОЖНЄ МІСЦЕ ВІДМОВИ — теж відмова. `catch` ловить що завгодно, і
	 * `undefined` тут не гіпотетичний: його кидає будь-який `throw` без
	 * значення, а `null` приходить із чужих проміс-ланцюгів.
	 */
	it.each([
		['нічого', undefined],
		['порожнечу', null],
		['рядок', 'зламалося'],
		['чужий об\u2019єкт', { status: 500 }],
		['помилку без прикмет', new Error('щось зовсім інше')]
	])('невпізнане лишається невпізнаним: %s', (_what, error) => {
		expect(describeError(error)).toBe('error.unknown');
	});
});

describe('FIX_COMMAND — команда, яку вставляють у термінал', () => {
	/*
	 * Команда, підвішена до ключа, якого `describeError` не повертає ніколи, —
	 * мертва: на екрані вона не з'явиться, а виглядає як покриття випадку.
	 * Тому перелік звіряється з тим, що модуль справді ВІДДАЄ.
	 */
	it('кожна команда висить на ключі, який справді повертається', () => {
		const reachable = new Set([
			describeError(new ConnectionDownError(true)),
			describeError(new ConnectionDownError(false)),
			describeError(new BoardLookupTimeout()),
			describeError(new ConfigMissingError('ключа')),
			describeError(new InsecureContextError()),
			describeError({ code: 'PERMISSION_DENIED' }),
			describeError({ code: 'auth/network-request-failed' }),
			describeError(undefined)
		]);

		const dead = Object.keys(FIX_COMMAND).filter((key) => !reachable.has(key as never));
		expect(dead, `команда без випадку: ${dead.join(', ')}`).toEqual([]);
	});

	it('команду не перекладають — вона однакова всіма мовами', () => {
		// Не стиль: `npm run emulators` вставляють у термінал, і переклад
		// зробив би з неї «npm run емулятори».
		expect(FIX_COMMAND['error.emulatorDown']).toBe('npm run emulators');
	});
});
