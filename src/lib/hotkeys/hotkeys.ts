/**
 * ГАРЯЧІ КЛАВІШІ
 *
 * | Клавіші | Дія |
 * |---|---|
 * | пробіл | пауза / продовжити |
 * | `0` | зупинити |
 * | `-` / `+`, стрілки вгору-вниз | гучність |
 * | стрілки ліворуч-праворуч | перемотка на 5 секунд |
 * | `m` | тиша |
 * | будь-яка інша | трек, якому її призначили |
 * | `1`…`9` | трек за порядком — ЗАВЖДИ, а не лише доти, доки нічого не призначено |
 *
 * Пробіл і стрілки — такі самі, як у плеєрі YouTube: людина вже знає, куди
 * тиснути, і вигадувати тут своє означало б вимагати вчити те, що вона вміє.
 *
 * ## Чому `event.code`, а не `event.key`
 *
 * `key` віддає символ, який дала РОЗКЛАДКА. У школі розкладка українська, і
 * клавіша `m` там дає `ь` — тобто перевірка `event.key === 'm'` не спрацювала б
 * саме там, де цим користуються. `code` називає фізичну клавішу: `KeyM`
 * лишається `KeyM` за будь-якої розкладки. З цієї ж причини призначені трекам
 * клавіші зберігаються КОДОМ, а не символом: інакше зміна розкладки
 * перемішала б усю дошку.
 *
 * ## Чому цифровий блок теж
 *
 * Комп'ютер у залі — стаціонарний, із повною клавіатурою, і рука лягає саме на
 * цифровий блок. `Numpad*` коштують одного рядка й знімають питання «чому не
 * працює».
 */

import type { TranslationKey } from '$lib/i18n/i18n.svelte';

export type HotkeyAction =
	/** Запустити трек за порядковим номером серед показаних, з нуля. */
	| { kind: 'play'; index: number }
	/** Пауза або продовження — одна клавіша на обидва стани. */
	| { kind: 'playPause' }
	/** Зупинити те, що грає. */
	| { kind: 'stop' }
	/** Перемотати на стільки мілісекунд. Відʼємне — назад. */
	| { kind: 'seek'; deltaMs: number }
	/** Змінити гучність на стільки відсотків. */
	| { kind: 'volume'; delta: number }
	/** Тиша / повернути звук. */
	| { kind: 'mute' };

/** Скільки перших треків списку беруть цифри за порядком. */
export const HOTKEY_SLOTS = 9;

/** На скільки відсотків міняє гучність одне натискання. */
export const VOLUME_STEP = 5;

/** На скільки мілісекунд перемотує одне натискання стрілки. */
export const SEEK_STEP_MS = 5000;

/**
 * Клавіші, які НЕ можна віддати треку.
 *
 * Це не обмеження заради обмеження: кожна з них уже щось робить, і віддати її
 * треку означає забрати в людини керування. Пробіл, відданий треку, — це плеєр
 * без паузи; `Escape` — вікно, яке не закрити; `Tab` — сторінка без
 * клавіатурної навігації.
 *
 * Решта клавіатури вільна: літери, `F1`…`F12`, розділові, цифровий блок.
 */
export const RESERVED_CODES: readonly string[] = [
	'Space',
	'Escape',
	'Tab',
	'Enter',
	'NumpadEnter',
	'Backspace',
	'Delete',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Minus',
	'Equal',
	'NumpadSubtract',
	'NumpadAdd',
	'KeyM',
	'Digit0',
	'Numpad0'
];

/**
 * ФОРМА КОДУ КЛАВІШІ — ТА САМА, ЩО В ПРАВИЛІ БАЗИ.
 *
 * `KeyboardEvent.code` завжди складається з латиниці й цифр: `KeyQ`, `F5`,
 * `Numpad3`, `IntlBackslash`, найдовший — `MediaTrackPrevious` (18). Тому
 * `database.rules.json` і приймає рівно `/^[A-Za-z0-9]{1,20}$/`, і ту саму
 * форму фільтрує читання файлу налаштувань.
 *
 * Тут вона потрібна тому, що клавіша приходить НЕ ЛИШЕ з події: адміністратор
 * надсилає її рядком із чужого пристрою. Рядок іншої форми правило бази
 * відкидає разом з УСІМ записом бібліотеки — тобто ціна не «клавіша не
 * призначилася», а «бібліотеки на пульті немає».
 */
export const KEY_CODE = /^[A-Za-z0-9]{1,20}$/;

/** Чи можна віддати цю клавішу треку. */
export const isAssignable = (code: string): boolean =>
	KEY_CODE.test(code) && !RESERVED_CODES.includes(code);

/**
 * Підпис клавіші для екрана.
 *
 * `code` — це назва ФІЗИЧНОЇ клавіші, тобто `KeyQ` навіть тоді, коли на ній
 * намальовано «Й». Показувати людині `KeyQ` не можна; показувати символ із
 * розкладки теж не можна — він зміниться разом із нею. Береться латинський
 * напис: він на клавіші є завжди.
 */
export function labelForCode(code: string): string {
	const named: Record<string, string> = {
		Space: 'Space',
		Minus: '-',
		Equal: '=',
		BracketLeft: '[',
		BracketRight: ']',
		Semicolon: ';',
		Quote: "'",
		Backquote: '`',
		Backslash: '\\',
		Comma: ',',
		Period: '.',
		Slash: '/',
		NumpadAdd: 'Num +',
		NumpadSubtract: 'Num -',
		NumpadMultiply: 'Num *',
		NumpadDivide: 'Num /',
		NumpadDecimal: 'Num .'
	};
	if (named[code]) return named[code];

	const digit = /^Digit([0-9])$/.exec(code);
	if (digit) return digit[1];

	const numpad = /^Numpad([0-9])$/.exec(code);
	if (numpad) return `Num ${numpad[1]}`;

	const letter = /^Key([A-Z])$/.exec(code);
	if (letter) return letter[1];

	// `F5`, `Insert`, `Home` та інші приходять назвою й читаються як є.
	return code;
}

/**
 * ПІДПИСИ КЛАВІШ ДЛЯ СПИСКУ — призначені плюс цифри за порядком.
 *
 * Правило тут одне на весь застосунок, і саме тому воно винесене: підпис на
 * екрані й те, що станеться від натискання, — дві половини однієї домовленості,
 * і розійтися вони можуть тихо.
 *
 * ЦИФРИ ЗА ПОРЯДКОМ ПРАЦЮЮТЬ ЗАВЖДИ. Спершу вони вимикалися, щойно комусь
 * призначали свою клавішу, — і людина, яка дала одному треку `Q`, раптом
 * лишалася без решти дев'яти. Одна дія забирала те, чого не чіпала.
 *
 * Призначена клавіша не замінює цифру, а ДОДАЄТЬСЯ до неї: трек на третьому
 * місці з клавішею `Q` запускається і з `Q`, і з `3`. У підписі стоїть `Q` —
 * бо це вибір людини, і саме його вона шукає очима.
 *
 * Єдиний виняток — цифра, яку забрали собі явно. Якщо комусь призначено
 * `Digit3`, то третій у списку цією трійкою вже не запускається (призначену
 * питають першою), і показувати йому `3` означало б брехати.
 *
 * Приймає ЛИШЕ показані треки: прихованих немає ні в пульті, ні під клавішами.
 */
export function keyLabelsFor(
	visible: readonly { id: string; hotkey?: string | null }[]
): Record<string, string> {
	const labels: Record<string, string> = {};
	const claimed = new Set(visible.map((entry) => entry.hotkey).filter(Boolean));

	visible.forEach((entry, index) => {
		if (entry.hotkey) {
			labels[entry.id] = labelForCode(entry.hotkey);
			return;
		}

		const digit = index + 1;
		if (digit > HOTKEY_SLOTS) return;
		if (claimed.has(`Digit${digit}`) || claimed.has(`Numpad${digit}`)) return;
		labels[entry.id] = String(digit);
	});

	return labels;
}

/**
 * Ключ порядкового числівника для цифри за порядком: `'3'` → `'ordinal.3'`.
 *
 * Живе тут, а не у вікні треку, з тієї ж причини, що й `keyLabelsFor`: межа
 * «лише перші дев'ять» задана саме тут (`HOTKEY_SLOTS`), і перелік слів у
 * словнику мусить збігатися з нею, а не з чиїмось припущенням.
 */
export const ordinalKey = (digit: string): TranslationKey => `ordinal.${digit}` as TranslationKey;

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
export function isTyping(target: EventTarget | null): boolean {
	// `HTMLElement` береться з глобального, і в прогоні без DOM
	// (`@vitest-environment node`) його там немає — звернення впало б замість
	// того, щоб чесно сказати «ніхто нічого не набирає». Та сама обережність, що
	// й у `isCovered` нижче, і з тієї ж причини: обидві функції читає перевірка,
	// якій DOM не потрібен.
	if (typeof HTMLElement === 'undefined') return false;
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * ЧИ ЛЕЖИТЬ НАД СТОРІНКОЮ МОДАЛЬНЕ ВІКНО.
 *
 * `showModal()` робить решту сторінки інертною для миші й фокуса — але НЕ для
 * слухача на вікні: подія клавіші однаково доходить до нього. Через це пробіл,
 * натиснутий на кнопці у відкритому вікні налаштувань, робив дві речі
 * одночасно: сторінка ставила музику на паузу, а `preventDefault()` заразом
 * з'їдав саме натискання кнопки. Тобто в залі змовкав звук, а кнопка, яку
 * тиснули, не спрацьовувала — і читалося це як «вікно зависло».
 *
 * Шукається `dialog[open]` у ВСЬОМУ документі, а не під подією: коли фокус ще
 * на `<body>`, шлях від події до вікна не веде нікуди, а вікно однаково зверху.
 *
 * Документ береться з події, а не з глобального: у прогоні без DOM
 * (`@vitest-environment node`) глобального немає, і звернення до нього впало б
 * замість того, щоб чесно сказати «нічого не перекрито».
 */
export function isCovered(target: EventTarget | null): boolean {
	// Обережність поширюється й на сам `Node`: без DOM його в глобальному немає
	// так само, як і `document`, тож `target instanceof Node` кидав би рівно
	// там, де опис вище обіцяє чесну відповідь. Обіцянка була, перевірки — ні.
	if (typeof Node === 'undefined') return globalThis.document?.querySelector('dialog[open]') != null;
	const doc = target instanceof Node ? target.ownerDocument : (globalThis.document ?? null);
	return doc?.querySelector('dialog[open]') != null;
}

/**
 * Чи взагалі варто дивитися на це натискання.
 *
 * Shift дозволений навмисно: на багатьох розкладках `+` набирається саме з ним.
 * Ctrl, Alt і Meta заборонені: за ними стоять команди браузера й системи, і
 * перехоплювати їх означає ламати те, чого ми не писали.
 */
export function isHotkeyEvent(event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.altKey || event.metaKey) return false;
	if (event.repeat) return false;
	if (isTyping(event.target)) return false;
	return !isCovered(event.target);
}

/**
 * Вбудована дія для цього натискання. `null` — вбудованої немає.
 *
 * Призначені трекам клавіші сюди НЕ входять: про них знає лише той, хто має
 * список треків. Тому порядок такий — спершу питають про призначену клавішу, і
 * лише потім про вбудовану.
 */
export function builtinFor(event: KeyboardEvent): HotkeyAction | null {
	if (!isHotkeyEvent(event)) return null;

	switch (event.code) {
		case 'Space':
			return { kind: 'playPause' };
		case 'Minus':
		case 'NumpadSubtract':
		case 'ArrowDown':
			return { kind: 'volume', delta: -VOLUME_STEP };
		case 'Equal':
		case 'NumpadAdd':
		case 'ArrowUp':
			return { kind: 'volume', delta: VOLUME_STEP };
		case 'ArrowLeft':
			return { kind: 'seek', deltaMs: -SEEK_STEP_MS };
		case 'ArrowRight':
			return { kind: 'seek', deltaMs: SEEK_STEP_MS };
		case 'KeyM':
			return { kind: 'mute' };
		default:
			break;
	}

	const digit = digitFromCode(event.code);
	if (digit === 0) return { kind: 'stop' };
	if (digit !== null) return { kind: 'play', index: digit - 1 };

	return null;
}

/**
 * ЯКИЙ ТРЕК ХОВАЄТЬСЯ ЗА ЦИФРОЮ, коли підписи порахував хтось інший.
 *
 * На приймачі цифра — це місце в списку, і шукати трек можна за індексом. На
 * пульті так більше не можна: трек «лише приймач» займає свою цифру там і сюди
 * не приїжджає, тож у списку пульта цифри йдуть із пропусками. Пошук за
 * індексом дав би зсув — рівно ту помилку, через яку колись з'явився `order`,
 * тільки тепер непомітну на око: цифра є, трек під нею інший.
 *
 * Пропущена цифра не робить нічого, і це правильно: пульт не мусить запускати
 * те, чого йому не показали.
 */
export function trackForDigit(
	tracks: readonly { id: string }[],
	labels: Record<string, string>,
	index: number
): string | null {
	const digit = String(index + 1);
	return tracks.find((track) => labels[track.id] === digit)?.id ?? null;
}
