import { readJson, writeJson } from '$lib/services/storage';

export type BoardRole = 'player' | 'remote';

export interface SavedBoard {
	/** Адреса дошки в базі — хеш від пари (ідентифікатор, пароль). */
	key: string;
	/** Ідентифікатор, як його показують людині. */
	id: string;
	/** Назва, яку дала людина. Порожня — покажемо ідентифікатор. */
	name: string;
	role: BoardRole;
	/**
	 * Пароль — ЛИШЕ для дощок, які створені тут.
	 *
	 * Ключа досить, щоб зайти, тож для підключення пароль не потрібен і не
	 * зберігається. Але господар мусить мати змогу продиктувати його завтра, а
	 * відновити з хеша неможливо за побудовою — отже або зберігати, або людина
	 * втрачає власну дошку через тиждень.
	 *
	 * Ризик названо: хто має доступ до цього браузера, той бачить пароль. Він і
	 * так має `key`, тобто вже всередині, — тобто зберігання пароля не відкриває
	 * нічого нового, а лише робить видимим те, що вже доступне.
	 */
	password?: string;
	/** Коли востаннє відкривали. Список сортується за цим. */
	at: number;
}

const STORAGE_KEY = 'boards';
/** Скільки дощок тримати в списку. Далі найстаріші випадають. */
const LIMIT = 12;

export function listBoards(): SavedBoard[] {
	return readJson<SavedBoard[]>(STORAGE_KEY, [])
		.filter((board) => typeof board?.key === 'string' && board.key.length > 0)
		.sort((left, right) => right.at - left.at);
}

/**
 * Запам'ятати дошку. Той самий `key` оновлюється, а не дублюється.
 *
 * `key` — природний ідентифікатор запису: дві дошки з однаковою адресою це та
 * сама дошка, навіть якщо людина дала їй іншу назву.
 */
export function rememberBoard(board: Omit<SavedBoard, 'at'>): void {
	const rest = listBoards().filter((saved) => saved.key !== board.key);
	writeJson(STORAGE_KEY, [{ ...board, at: Date.now() }, ...rest].slice(0, LIMIT));
}

export function forgetBoard(key: string): void {
	writeJson(
		STORAGE_KEY,
		listBoards().filter((board) => board.key !== key)
	);
}

export function findBoard(key: string): SavedBoard | null {
	return listBoards().find((board) => board.key === key) ?? null;
}
