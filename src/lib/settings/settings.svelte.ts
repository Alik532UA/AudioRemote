import { normalizeBoardId, normalizePassword } from '$lib/board/secret';
import { readJson, writeJson } from '$lib/services/storage';

/**
 * НАЛАШТУВАННЯ — і головне з них: СТАЛА ПАРА (ідентифікатор, пароль).
 *
 * ## Навіщо це взагалі
 *
 * Типовий шлях створює нову дошку щоразу: новий ідентифікатор, новий пароль, і
 * колегам треба диктувати їх заново. Для школи, де «Зал 2» — це та сама кімната
 * щодня, це зайва робота на порожньому місці. Стала пара робить дошку постійною:
 * один раз записали на папірці біля комп'ютера — і все.
 *
 * ## Що з цього випливає, і це треба казати людині прямо
 *
 * Адреса дошки виводиться з пари. Отже стала пара означає СТАЛУ АДРЕСУ: кнопка
 * «Створити» більше нічого не створює, вона відкриває ту саму дошку. Це не
 * побічний ефект, а рівно те, чого просили, — але людина, яка цього не знає,
 * вирішить, що застосунок зламався й «не створює нову».
 *
 * Друге: один пароль на всі дошки означає, що витік одного відкриває всі. Для
 * однієї кімнати на школу це прийнятно; сторінка налаштувань каже про це рядком,
 * а не мовчить.
 *
 * ## Чому порожнє поле — це теж відповідь
 *
 * Порожній рядок означає «генерувати щоразу», тобто типову поведінку. Окремого
 * прапорця «використовувати сталу пару» немає навмисно: він був би другим
 * джерелом того самого факту й неминуче розійшовся б із самими значеннями.
 */

const STORAGE_KEY = 'settings';

export interface StoredSettings {
	/** Сталий ідентифікатор. Порожній — генерувати щоразу. */
	fixedBoardId: string;
	/** Сталий пароль. Порожній — генерувати щоразу. */
	fixedPassword: string;
}

const EMPTY: StoredSettings = { fixedBoardId: '', fixedPassword: '' };

class SettingsState {
	fixedBoardId = $state('');
	fixedPassword = $state('');

	/**
	 * Чи налаштована стала пара.
	 *
	 * ОБИДВА значення, а не будь-яке: адреса виводиться з пари, тож половина
	 * пари не дає нічого. Заповнене одне поле означало б дошку, у якої стала
	 * половина адреси, — тобто той самий випадковий результат щоразу, але з
	 * відчуттям, що налаштування діє.
	 */
	get hasFixedPair(): boolean {
		return (
			normalizeBoardId(this.fixedBoardId).length > 0 &&
			normalizePassword(this.fixedPassword).length > 0
		);
	}

	load(): void {
		const stored = readJson<StoredSettings>(STORAGE_KEY, EMPTY);
		this.fixedBoardId = typeof stored.fixedBoardId === 'string' ? stored.fixedBoardId : '';
		this.fixedPassword = typeof stored.fixedPassword === 'string' ? stored.fixedPassword : '';
	}

	save(boardId: string, password: string): void {
		this.fixedBoardId = boardId;
		this.fixedPassword = password;
		writeJson(STORAGE_KEY, { fixedBoardId: boardId, fixedPassword: password });
	}

	clear(): void {
		this.save('', '');
	}
}

export const settings = new SettingsState();
