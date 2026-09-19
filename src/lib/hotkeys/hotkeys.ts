/**
 * ГАРЯЧІ КЛАВІШІ: 1…9, 0 — треки; `-` і `+` — гучність; `m` — тиша.
 *
 * ## Чому `event.code`, а не `event.key`
 *
 * `key` віддає символ, який дала РОЗКЛАДКА. У школі розкладка українська, і
 * клавіша `m` там дає `ь` — тобто перевірка `event.key === 'm'` не спрацювала б
 * саме там, де цим користуються. `code` називає фізичну клавішу: `KeyM`
 * лишається `KeyM` за будь-якої розкладки.
 *
 * Те саме з `-` і `+`: `Minus` і `Equal` — це клавіші, а не символи, тож
 * тримати Shift для плюса не треба (але й можна — див. нижче).
 *
 * ## Чому цифровий блок теж
 *
 * Комп'ютер у залі — стаціонарний, із повною клавіатурою, і рука лягає саме на
 * цифровий блок. `Numpad*` коштують одного рядка й знімають питання «чому не
 * працює».
 *
 * ## Чому це окремий модуль
 *
 * Розкладка клавіатури, фокус у полі вводу й модифікатори — три речі, у яких
 * легко помилитися тихо, і жодна з них не потребує ні браузера, ні застосунку,
 * щоб її перевірити. Тут вони чистою функцією; сторінки лише виконують дію.
 */

export type HotkeyAction =
	/** Запустити трек за порядковим номером серед ПОКАЗАНИХ, з нуля. */
	| { kind: 'play'; index: number }
	/** Змінити гучність на стільки відсотків. */
	| { kind: 'volume'; delta: number }
	/** Тиша / повернути звук. */
	| { kind: 'mute' };

/** Скільки треків можна запустити з клавіатури: 1…9 плюс 0 як десятий. */
export const HOTKEY_SLOTS = 10;

/** На скільки відсотків міняє гучність одне натискання. */
export const VOLUME_STEP = 5;

/**
 * Підпис клавіші для порядкового номера. `null` — для решти треків клавіші
 * немає, і показувати порожній значок не треба.
 */
export function hotkeyLabel(index: number): string | null {
	if (index < 0 || index >= HOTKEY_SLOTS) return null;
	// Десятий трек — на нулі: так стоять цифри на клавіатурі.
	return index === HOTKEY_SLOTS - 1 ? '0' : String(index + 1);
}

/** Цифра з фізичної клавіші, або `null`. Основний ряд і цифровий блок. */
function digitFromCode(code: string): number | null {
	const main = /^Digit([0-9])$/.exec(code);
	if (main) return Number(main[1]);
	const numpad = /^Numpad([0-9])$/.exec(code);
	if (numpad) return Number(numpad[1]);
	return null;
}

/**
 * Чи набирає людина текст просто зараз.
 *
 * Без цієї перевірки цифра, набрана в полі пароля, запускала б трек — і саме в
 * полі пароля цифри й набирають. `isContentEditable` ловить редактори, які не є
 * `<input>`.
 */
function typing(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Що робити на це натискання. `null` — нічого, і подію чіпати не треба.
 *
 * Shift дозволений навмисно: на багатьох розкладках `+` набирається саме з ним,
 * і вимагати «плюс без Shift» означало б вимагати неможливого. Ctrl, Alt і Meta
 * заборонені: за ними стоять команди браузера й системи, і перехоплювати їх
 * означає ламати те, чого ми не писали.
 */
export function hotkeyFor(event: KeyboardEvent): HotkeyAction | null {
	if (event.ctrlKey || event.altKey || event.metaKey) return null;
	if (event.repeat) return null;
	if (typing(event.target)) return null;

	const digit = digitFromCode(event.code);
	if (digit !== null) {
		// Нуль — десятий слот, а не нульовий: так він стоїть на клавіатурі.
		return { kind: 'play', index: digit === 0 ? HOTKEY_SLOTS - 1 : digit - 1 };
	}

	switch (event.code) {
		case 'Minus':
		case 'NumpadSubtract':
			return { kind: 'volume', delta: -VOLUME_STEP };
		case 'Equal':
		case 'NumpadAdd':
			return { kind: 'volume', delta: VOLUME_STEP };
		case 'KeyM':
			return { kind: 'mute' };
		default:
			return null;
	}
}
