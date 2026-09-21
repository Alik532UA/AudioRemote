import { deriveBoardKey } from './boardPath';
import { findBoard, rememberBoard, type BoardKind, type BoardRole } from './myBoards';
import { normalizeBoardId, normalizePassword } from './secret';
import { boardSession, type ActiveBoard } from './session.svelte';

/**
 * Відкрити дошку за парою (ідентифікатор, пароль).
 *
 * Спільне для трьох місць: кнопки «Створити», запуску застосунку зі сталою
 * парою і запуску в названу дошку пульта. Кроків тут чотири — вивести ключ,
 * запам'ятати, відкрити сесію, повернути, — і пропущений третій дає сторінку,
 * яка одразу викидає назад у меню. Тримати їх у трьох файлах означало б
 * чекати, доки вони розійдуться.
 *
 * НАЗВА БЕРЕТЬСЯ ЗІ ЗБЕРЕЖЕНОЇ ДОШКИ. Та сама пара — та сама адреса, тобто та
 * сама дошка, якій людина колись дала назву. Затирати її порожнім рядком при
 * автоматичному відкритті означало б щоранку губити «Зал 2».
 */
export async function openBoard(
	role: BoardRole,
	rawId: string,
	rawPassword: string,
	name?: string,
	/** Вид дошки. Типово звук: так поводилася ця функція, поки вид був один. */
	kind: BoardKind = 'audio'
): Promise<ActiveBoard> {
	const id = normalizeBoardId(rawId);
	const password = normalizePassword(rawPassword);
	const key = await deriveBoardKey(id, password);

	const board: ActiveBoard = {
		key,
		id,
		name: (name ?? findBoard(key)?.name ?? '').trim(),
		role,
		kind,
		/*
		 * Пароль зберігається лише в господаря дошки: йому завтра її диктувати, а
		 * з ключа пароль не відновити за побудовою. Пульту досить ключа, тож
		 * тримати в нього ще й пароль означало б зберігати зайве.
		 */
		...(role === 'player' ? { password } : {})
	};

	rememberBoard(board);
	boardSession.open(board);
	return board;
}
