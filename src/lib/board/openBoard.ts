import { deriveBoardKey } from './boardPath';
import { findBoard, rememberBoard } from './myBoards';
import { normalizeBoardId, normalizePassword } from './secret';
import { boardSession, type ActiveBoard } from './session.svelte';

/**
 * Відкрити дошку приймача за парою (ідентифікатор, пароль).
 *
 * Спільне для двох місць: кнопки «Створити» і запуску застосунку зі сталою
 * парою. Кроків тут чотири — вивести ключ, запам'ятати, відкрити сесію,
 * повернути, — і пропущений третій дає сторінку плеєра, яка одразу викидає
 * назад у меню. Тримати їх у двох файлах означало б чекати, доки вони
 * розійдуться.
 *
 * НАЗВА БЕРЕТЬСЯ ЗІ ЗБЕРЕЖЕНОЇ ДОШКИ. Та сама пара — та сама адреса, тобто та
 * сама дошка, якій людина колись дала назву. Затирати її порожнім рядком при
 * автоматичному відкритті означало б щоранку губити «Зал 2».
 */
export async function openPlayerBoard(
	rawId: string,
	rawPassword: string,
	name?: string
): Promise<ActiveBoard> {
	const id = normalizeBoardId(rawId);
	const password = normalizePassword(rawPassword);
	const key = await deriveBoardKey(id, password);

	const board: ActiveBoard = {
		key,
		id,
		name: (name ?? findBoard(key)?.name ?? '').trim(),
		role: 'player',
		password
	};

	rememberBoard(board);
	boardSession.open(board);
	return board;
}
