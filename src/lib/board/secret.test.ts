import { describe, expect, it } from 'vitest';
import {
	BOARD_ID_ALPHABET,
	BOARD_ID_LENGTH,
	makeBoardId,
	makePassword,
	MIN_PASSWORD_LENGTH,
	normalizeBoardId,
	normalizePassword,
	passwordEntropyBits
} from './secret';
import { WORDS } from './words';

/** Передбачуваний «випадок»: послідовність значень по колу. */
const sequence = (values: number[]) => {
	let index = 0;
	return () => values[index++ % values.length];
};

describe('словник', () => {
	it('без дублікатів', () => {
		expect(new Set(WORDS).size).toBe(WORDS.length);
	});

	it('без апострофа й дефіса — саме вони ламають введення', () => {
		const bad = WORDS.filter((word) => /['\u2019\u02BC-]/.test(word));
		expect(bad).toEqual([]);
	});

	it('усі слова великими літерами — нормалізація дає саме такий вигляд', () => {
		const bad = WORDS.filter((word) => word !== word.toUpperCase().normalize('NFC'));
		expect(bad).toEqual([]);
	});

	it('довжина слів у межах, які не важко продиктувати', () => {
		const bad = WORDS.filter((word) => word.length < 4 || word.length > 10);
		expect(bad).toEqual([]);
	});
});

describe('passwordEntropyBits', () => {
	/*
	 * ЧИСЛО ПІД ГЕЙТОМ, А НЕ В ПРОЗІ.
	 *
	 * Запас пароля — єдине, що стоїть між дошкою й перебором, бо адреса в базі
	 * виводиться саме з нього. Зменшений словник або одне слово замість трьох
	 * не зламали б жодного тесту й не змінили б жодного екрана — вони просто
	 * тихо зробили б дошку відкритою. Тому поріг стоїть тут.
	 *
	 * 36 біт при перевірці ЛИШЕ мережевим читанням: навіть 500 спроб на секунду
	 * дають понад чотири роки на простір.
	 */
	it('не нижче 36 біт', () => {
		expect(passwordEntropyBits()).toBeGreaterThanOrEqual(36);
	});
});

describe('makeBoardId', () => {
	it('має задану довжину й лише літери алфавіту', () => {
		const id = makeBoardId(sequence([0.01, 0.3, 0.5, 0.7, 0.99]));
		expect(id).toHaveLength(BOARD_ID_LENGTH);
		expect([...id].every((char) => BOARD_ID_ALPHABET.includes(char))).toBe(true);
	});

	it('алфавіт не містить сплутуваних символів', () => {
		for (const char of '01OIL') {
			expect(BOARD_ID_ALPHABET).not.toContain(char);
		}
	});

	it('переживає власну нормалізацію без змін', () => {
		const id = makeBoardId(sequence([0.02, 0.44, 0.61, 0.83, 0.95]));
		expect(normalizeBoardId(id)).toBe(id);
	});
});

describe('makePassword', () => {
	it('три слова й чотири цифри через дефіс', () => {
		const password = makePassword(sequence([0, 0.5, 0.9, 0.1, 0.2, 0.3, 0.4]));
		expect(password).toMatch(/^[А-ЯҐЄІЇ]+-[А-ЯҐЄІЇ]+-[А-ЯҐЄІЇ]+-\d{4}$/u);
	});

	it('переживає власну нормалізацію без змін', () => {
		const password = makePassword(sequence([0.11, 0.33, 0.77, 0.05, 0.25, 0.45, 0.65]));
		expect(normalizePassword(password)).toBe(password);
	});

	it('довший за поріг для власного пароля', () => {
		const password = makePassword(sequence([0.5]));
		expect(password.length).toBeGreaterThan(MIN_PASSWORD_LENGTH);
	});
});

describe('normalizeBoardId', () => {
	it.each([
		['abcde', 'ABCDE'],
		[' AB-CD E ', 'ABCDE'],
		['АВСDЕ', 'ABCDE'], // кирилиця з розкладки, що не перемкнулася
		['ab0cd', 'ABCD'], // нуля в алфавіті немає — відкидається
		['', '']
	])('%s → %s', (raw, expected) => {
		expect(normalizeBoardId(raw)).toBe(expected);
	});
});

describe('normalizePassword', () => {
	it.each([
		['кава-вікно', 'КАВА-ВІКНО'],
		['  КАВА   ВІКНО  ', 'КАВА-ВІКНО'],
		['КАВА__ВІКНО', 'КАВА-ВІКНО'],
		['-КАВА-ВІКНО-', 'КАВА-ВІКНО'],
		['КАВА — ВІКНО', 'КАВА-ВІКНО'],
		['KABA-ВІКНО', 'КАВА-ВІКНО'], // латинські омоглифи
		['кава 42', 'КАВА-42'],
		['---', '']
	])('%s → %s', (raw, expected) => {
		expect(normalizePassword(raw)).toBe(expected);
	});

	it('ідемпотентна: другий прохід нічого не міняє', () => {
		const once = normalizePassword(' кава __ вікно — 42 ');
		expect(normalizePassword(once)).toBe(once);
	});
});
