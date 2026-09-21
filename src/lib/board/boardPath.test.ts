import { describe, expect, it } from 'vitest';
import {
	adminPath,
	boardPath,
	deriveAdminKey,
	deriveBoardKey,
	EmptySecretError,
	isBoardKey,
	NotABoardKeyError
} from './boardPath';

/**
 * ЧОМУ ЦЕ НАЙВАЖЛИВІШИЙ ТЕСТ У ПРОЄКТІ.
 *
 * Той, хто створює дошку, і той, хто до неї підключається, виводять адресу
 * НЕЗАЛЕЖНО, на різних пристроях і різних клавіатурах. Якщо виведення
 * розійдеться хоч на біт, симптом буде один: «дошку не знайдено» в людини, яка
 * ввела все правильно. Жоден інший тест цього не побачить — застосунок
 * працюватиме бездоганно, поки обидві сторони не опиняться в різних умовах.
 *
 * Тому тут перевіряється не «функція повертає рядок», а рівно ті розбіжності,
 * які виникають між двома людьми в одній кімнаті.
 */
const ID = 'ABCDE';
const PASSWORD = 'КАВА-ВІКНО-ТРАВА-4821';

describe('deriveBoardKey', () => {
	it('дає 32 шістнадцяткових символи', async () => {
		expect(await deriveBoardKey(ID, PASSWORD)).toMatch(/^[0-9a-f]{32}$/);
	});

	it('те саме введення дає ту саму адресу', async () => {
		expect(await deriveBoardKey(ID, PASSWORD)).toBe(await deriveBoardKey(ID, PASSWORD));
	});

	it.each([
		['нижній регістр', 'abcde', 'кава-вікно-трава-4821'],
		['пробіли замість дефісів', ' ABCDE ', 'КАВА ВІКНО ТРАВА 4821'],
		['подвійні й довгі розділювачі', 'ABCDE', 'КАВА__ВІКНО  —  ТРАВА-4821'],
		['дефіси всередині ідентифікатора', 'AB-CDE', 'КАВА-ВІКНО-ТРАВА-4821'],
		['зайві дефіси по краях пароля', 'ABCDE', '-КАВА-ВІКНО-ТРАВА-4821-']
	])('%s дає ту саму адресу', async (_name, id, password) => {
		expect(await deriveBoardKey(id, password)).toBe(await deriveBoardKey(ID, PASSWORD));
	});

	it('латинські омоглифи в паролі дають ту саму адресу', async () => {
		// КАВА кирилицею проти KABA латиницею — на екрані не відрізнити.
		expect(await deriveBoardKey(ID, 'KABA-ВІКНО-ТРАВА-4821')).toBe(
			await deriveBoardKey(ID, PASSWORD)
		);
	});

	it('кириличні омоглифи в ідентифікаторі дають ту саму адресу', async () => {
		// Ідентифікатор набрали, не перемкнувши розкладку.
		expect(await deriveBoardKey('АВСDЕ', PASSWORD)).toBe(await deriveBoardKey(ID, PASSWORD));
	});

	it('розкладена діакритика дає ту саму адресу', async () => {
		// Ї одним символом проти І плюс комбінований діерезис.
		const composed = 'ЇЖАК-ВІКНО-ТРАВА-4821';
		expect(await deriveBoardKey(ID, composed.normalize('NFD'))).toBe(
			await deriveBoardKey(ID, composed)
		);
	});

	it('інший пароль дає іншу адресу', async () => {
		expect(await deriveBoardKey(ID, 'КАВА-ВІКНО-ТРАВА-4822')).not.toBe(
			await deriveBoardKey(ID, PASSWORD)
		);
	});

	it('інший ідентифікатор дає іншу адресу', async () => {
		expect(await deriveBoardKey('ABCDF', PASSWORD)).not.toBe(await deriveBoardKey(ID, PASSWORD));
	});

	it('межа між частинами не зсувається', async () => {
		/*
		 * Без роздільника, якого не можна підробити, ці дві пари склеїлися б в
		 * один рядок і дали б одну адресу двом різним дошкам.
		 */
		expect(await deriveBoardKey('ABCDE', 'FGH-КАВА')).not.toBe(
			await deriveBoardKey('ABCDEFGH', 'КАВА')
		);
	});

	it('порожнє після нормалізації — відмова, а не спільна адреса', async () => {
		await expect(deriveBoardKey('', PASSWORD)).rejects.toThrow(EmptySecretError);
		await expect(deriveBoardKey(ID, '')).rejects.toThrow(EmptySecretError);
		await expect(deriveBoardKey(ID, '---   ---')).rejects.toThrow(EmptySecretError);
		// Ідентифікатор із самих заборонених літер: 0, O, 1, I, L не в алфавіті.
		await expect(deriveBoardKey('01IL', PASSWORD)).rejects.toThrow(EmptySecretError);
	});
});

describe('boardPath', () => {
	it('складає шлях до вузла дошки', () => {
		expect(boardPath('deadbeef')).toBe('boards/deadbeef');
	});
});

describe('ключ у посиланні на пульт', () => {
	it('справжній ключ приймається', async () => {
		expect(isBoardKey(await deriveBoardKey('ABCDE', 'КАВА-КАВА-КАВА-1234'))).toBe(true);
	});

	it('чуже не приймається', () => {
		// Саме тут і був дефект: перевірка вимагала 64 символи, а ключ має 32,
		// і посилання мовчки не спрацьовувало.
		expect(isBoardKey('a'.repeat(64))).toBe(false);
		expect(isBoardKey('A'.repeat(32))).toBe(false);
		expect(isBoardKey('не ключ')).toBe(false);
		expect(isBoardKey('')).toBe(false);
	});
});

describe('deriveAdminKey', () => {
	const BOARD = 'a'.repeat(32);
	const ADMIN = 'ЗАМОК-ПЕРО-СІЛЬ-9900';

	it('дає адресу тієї самої форми, що й дошка', async () => {
		expect(await deriveAdminKey(BOARD, ADMIN)).toMatch(/^[0-9a-f]{32}$/);
	});

	it('нормалізується так само, як пароль дошки', async () => {
		// Два пристрої, дві клавіатури: якщо розійдеться — адміністратор просто
		// не потрапить усередину, і сказати чому буде нічого.
		expect(await deriveAdminKey(BOARD, ' замок перо сіль 9900 ')).toBe(
			await deriveAdminKey(BOARD, ADMIN)
		);
	});

	it('інша дошка — інший канал', async () => {
		/*
		 * Саме це й робить канал каналом ЦІЄЇ дошки. Без прив'язки до адреси
		 * дошки один адмінський пароль відмикав би всі дошки школи одразу — і
		 * помітили б це рівно тоді, коли вже пізно.
		 */
		expect(await deriveAdminKey('b'.repeat(32), ADMIN)).not.toBe(
			await deriveAdminKey(BOARD, ADMIN)
		);
	});

	it('адреса каналу не збігається з адресою дошки', async () => {
		// Збіг означав би, що знання адмінського пароля видає пароль дошки.
		expect(await deriveAdminKey(BOARD, ADMIN)).not.toBe(BOARD);
	});

	it('порожній пароль — відмова, а не спільний канал', async () => {
		await expect(deriveAdminKey(BOARD, '')).rejects.toThrow(EmptySecretError);
		await expect(deriveAdminKey(BOARD, '---')).rejects.toThrow(EmptySecretError);
	});

	it('ідентифікатор замість адреси — відмова, а не інший хеш', async () => {
		/*
		 * Поля `key` й `id` лежать поруч у кожному місцевому записі, обидва —
		 * рядки, і компілятор їх не розрізняє. Переплутані, вони дають не
		 * помилку, а ІНШУ адресу: `remove` б'є в порожнечу, правило «знести
		 * може лише господар» бачить порожнечу без господаря й відмовляє — і
		 * через ту відмову не видаляється вже й сама дошка.
		 *
		 * Саме так і було у двох місцях із чотирьох, тож тут перевіряється не
		 * гіпотеза.
		 */
		await expect(deriveAdminKey('EYE75', ADMIN)).rejects.toThrow(NotABoardKeyError);
		await expect(deriveAdminKey('A'.repeat(32), ADMIN)).rejects.toThrow(NotABoardKeyError);
		await expect(deriveAdminKey('', ADMIN)).rejects.toThrow(NotABoardKeyError);
	});
});

describe('adminPath', () => {
	it('складає шлях до адмінського каналу', () => {
		expect(adminPath('deadbeef')).toBe('admin/deadbeef');
	});
});
