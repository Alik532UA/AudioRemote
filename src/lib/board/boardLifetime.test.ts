// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BOARD_TTL_MS, isBoardExpired, lastUsedAt } from './boardLifetime';
import { rememberBoard, listBoards, type SavedBoard } from './myBoards';

/**
 * ВІК ДОШКИ Й МЕЖА ВИТІСНЕННЯ — дві половини одного дефекту.
 *
 * Покинуті дошки не прибирав ніхто, і причин було ДВІ, а не одна:
 *
 *   1. не існувало ні поняття віку, ні того, хто прибирає;
 *   2. місцевий список різався до дванадцяти записів БЕЗ розбору, і разом із
 *      тринадцятим зникала єдина в світі адреса власної дошки. Далі її не
 *      знайшов би ніхто: `boards` не перелічується за побудовою.
 *
 * Друга половина тиха повністю: нічого не падає, у базі просто лишається
 * вузол, який ніхто вже не бачить.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 21);

describe('вік дошки', () => {
	it('рахується від останнього відкриття, а не від створення', () => {
		/*
		 * Інакше дошка, яку відкривають щотижня третій рік, виглядала б
		 * найстарішою з усіх — і прибиральний прогін зніс би саме ту, якою
		 * користуються найбільше.
		 */
		const old = { createdAt: NOW - 3 * 365 * DAY, seenAt: NOW - DAY };
		expect(lastUsedAt(old)).toBe(NOW - DAY);
		expect(isBoardExpired(old, NOW)).toBe(false);
	});

	it('дошка без seenAt судиться за createdAt', () => {
		// Дошки, створені до появи поля, його не мають — і прибирати їх
		// найпотрібніше.
		expect(isBoardExpired({ createdAt: NOW - 200 * DAY }, NOW)).toBe(true);
		expect(isBoardExpired({ createdAt: NOW - 10 * DAY }, NOW)).toBe(false);
	});

	it('дошка без жодної позначки часу НЕ вважається простроченою', () => {
		/*
		 * Відсутність даних — не доказ віку. Найімовірніше це недописаний
		 * запис або зміна схеми, а видалення тут незворотне: адресу дошки
		 * відновити неможливо за побудовою.
		 */
		expect(isBoardExpired({ createdAt: 0 }, NOW)).toBe(false);
		expect(isBoardExpired({ createdAt: 0, seenAt: 0 }, NOW)).toBe(false);
	});

	it('межа саме на 180 днях, і вона переживає літні канікули', () => {
		expect(BOARD_TTL_MS).toBe(180 * DAY);
		// Канікули в школі — близько трьох місяців. Будь-яка межа коротша за
		// них зносила б робочі дошки до 1 вересня.
		expect(isBoardExpired({ createdAt: NOW - 92 * DAY }, NOW)).toBe(false);
		expect(isBoardExpired({ createdAt: NOW - 181 * DAY }, NOW)).toBe(true);
	});
});

/**
 * СВОЄ СХОВИЩЕ, а не те, що дає середовище.
 *
 * `window.localStorage` під тутешнім jsdom — порожній обʼєкт без `getItem` і
 * `setItem`. `storage.ts` це переживає (він і мусить: у приватному режимі
 * звернення кидає), але мовчки: запис нікуди не йде, читання завжди порожнє.
 * Тобто перевірка на такому середовищі була б ЗЕЛЕНОЮ, не перевіривши нічого.
 *
 * Тому сховище тут своє, у пам'яті, і залежність від нього названа явно.
 */
function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		key: (index: number) => [...data.keys()][index] ?? null,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, String(value)),
		removeItem: (key: string) => void data.delete(key),
		clear: () => data.clear()
	} as Storage;
}

describe('список збережених дощок не губить своїх', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'localStorage', {
			value: memoryStorage(),
			configurable: true
		});
	});

	const board = (index: number, mine: boolean): Omit<SavedBoard, 'at'> => ({
		key: String(index).padStart(32, '0'),
		id: `board-${index}`,
		name: `Зал ${index}`,
		role: mine ? 'player' : 'remote',
		...(mine ? { password: 'секрет' } : {})
	});

	it('своя дошка не витісняється навіть тринадцятою', () => {
		// Одна своя, далі двадцять чужих: доти своя випала б після дванадцятої.
		rememberBoard(board(0, true));
		for (let index = 1; index <= 20; index++) rememberBoard(board(index, false));

		const saved = listBoards();
		expect(
			saved.some((entry) => entry.key === board(0, true).key),
			'власна дошка випала зі списку — її адреси більше немає ніде, ' +
				'і знести її з бази тепер не зможе ніхто'
		).toBe(true);
	});

	it('чужі все-таки витісняються — інакше список росте без меж', () => {
		for (let index = 1; index <= 30; index++) rememberBoard(board(index, false));

		expect(listBoards().filter((entry) => !entry.password)).toHaveLength(12);
	});

	it('своїх багато — межа не діє на них зовсім', () => {
		for (let index = 1; index <= 15; index++) rememberBoard(board(index, true));

		expect(listBoards()).toHaveLength(15);
	});
});
