/**
 * ГАРЯЧІ КЛАВІШІ
 *
 * | Клавіші | Дія |
 * |---|---|
 * | `1`…`9` | запустити трек за номером |
 * | `0` | зупинити |
 * | `-` / `+`, стрілки вгору/вниз | гучність |
 * | стрілки ліворуч/праворуч | перемотка на 5 секунд |
 * | `m` | тиша |
 *
 * Стрілки такі самі, як у плеєрі YouTube: людина вже знає, куди тиснути, і
 * вигадувати тут своє означало б вимагати вчити те, що вона вміє.
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
	/** Зупинити те, що грає. */
	| { kind: 'stop' }
	/** Перемотати на стільки мілісекунд. Відʼємне — назад. */
	| { kind: 'seek'; deltaMs: number }
	/** Змінити гучність на стільки відсотків. */
	| { kind: 'volume'; delta: number }
	/** Тиша / повернути звук. */
	| { kind: 'mute' };

/**
 * Скільки треків можна запустити з клавіатури: 1…9. Нуль сюди НЕ входить.
 *
 * Нуль — це «зупинити», і це не економія клавіші. Зупинка потрібна частіше за
 * десятий трек і потрібна ТЕРМІНОВО: коли в залі грає не те, рука має лягти на
 * клавішу, не рахуючи. Нуль стоїть скраю ряду й намацується наосліп — десятому
 * треку таке місце ні до чого.
 */
export const HOTKEY_SLOTS = 9;

/** На скільки відсотків міняє гучність одне натискання. */
export const VOLUME_STEP = 5;

/** На скільки мілісекунд перемотує одне натискання стрілки. */
export const SEEK_STEP_MS = 5000;

/**
 * Підпис клавіші для порядкового номера. `null` — для решти треків клавіші
 * немає, і показувати порожній значок не треба.
 */
export function hotkeyLabel(index: number): string | null {
	if (index < 0 || index >= HOTKEY_SLOTS) return null;
	return String(index + 1);
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
		// Нуль зупиняє, а не запускає десятий — див. `HOTKEY_SLOTS`.
		return digit === 0 ? { kind: 'stop' } : { kind: 'play', index: digit - 1 };
	}

	switch (event.code) {
		case 'Minus':
		case 'NumpadSubtract':
			return { kind: 'volume', delta: -VOLUME_STEP };
		case 'Equal':
		case 'NumpadAdd':
			return { kind: 'volume', delta: VOLUME_STEP };
		case 'ArrowUp':
			return { kind: 'volume', delta: VOLUME_STEP };
		case 'ArrowDown':
			return { kind: 'volume', delta: -VOLUME_STEP };
		case 'ArrowLeft':
			return { kind: 'seek', deltaMs: -SEEK_STEP_MS };
		case 'ArrowRight':
			return { kind: 'seek', deltaMs: SEEK_STEP_MS };
		case 'KeyM':
			return { kind: 'mute' };
		default:
			return null;
	}
}
