import type { BoardKind, BoardRole, SavedBoard } from './myBoards';

/**
 * ЯКА ДОШКА ЗАРАЗ ВІДКРИТА — і чому цього немає в адресі сторінки.
 *
 * Спокуса зробити `/board/{key}` велика: тоді сторінку можна перезавантажити,
 * поділитися посиланням, відкрити в другій вкладці. Саме тому так і НЕ
 * зроблено: `key` — це і є пароль дошки у виведеній формі. В адресному рядку
 * він потрапляє в історію браузера, у знімок екрана, у заголовок `Referer` при
 * переході за будь-яким зовнішнім посиланням і в журнал будь-якого проксі.
 *
 * Тому адреса сторінки не несе нічого, а дошка живе в `sessionStorage`: вона
 * переживає перезавантаження вкладки (саме цього й бракувало б найбільше) і
 * зникає разом із нею.
 */
const SESSION_KEY = 'audioremote_active';

export interface ActiveBoard {
	key: string;
	id: string;
	name: string;
	role: BoardRole;
	/** Звук чи підказки. Немає — дошка з часів, коли вид був один, тобто аудіо. */
	kind?: BoardKind;
	password?: string;
	/** Другий пароль — право міняти налаштування з пульта. Див. `SavedBoard`. */
	adminPassword?: string;
	/**
	 * АДРЕСА АДМІНСЬКОГО КАНАЛУ — на боці ПУЛЬТА.
	 *
	 * Пульт пароля не зберігає взагалі: він міняє його на адресу каналу раз, при
	 * вході, і далі тримає саму адресу. Живе вона тут, у сеансі вкладки, з тієї
	 * самої причини, що й дошка: перезавантаження сторінки не має викидати з
	 * режиму, а закриття вкладки — має.
	 */
	adminKey?: string;
}

const readSession = (): ActiveBoard | null => {
	try {
		const raw = window.sessionStorage.getItem(SESSION_KEY);
		return raw ? (JSON.parse(raw) as ActiveBoard) : null;
	} catch {
		return null;
	}
};

class BoardSession {
	current = $state<ActiveBoard | null>(null);

	/** Підняти дошку, відкриту до перезавантаження вкладки. */
	restore(): void {
		this.current = readSession();
	}

	open(board: ActiveBoard): void {
		this.current = board;
		try {
			window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(board));
		} catch {
			/* приватний режим — дошка проживе до перезавантаження */
		}
	}

	close(): void {
		this.current = null;
		try {
			window.sessionStorage.removeItem(SESSION_KEY);
		} catch {
			/* нічого прибирати */
		}
	}
}

export const boardSession = new BoardSession();

export const toActive = (board: SavedBoard): ActiveBoard => ({
	key: board.key,
	id: board.id,
	name: board.name,
	role: board.role,
	password: board.password,
	adminPassword: board.adminPassword
});
