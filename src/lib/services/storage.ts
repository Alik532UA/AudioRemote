/**
 * Локальне сховище — і ЄДИНЕ місце, де пишеться його префікс.
 *
 * ## Навіщо префікс
 *
 * Застосунок живе на `alik532ua.github.io/AudioRemote/`, тобто ділить origin із
 * рештою проєктів автора. Спільний origin означає спільний `localStorage`: ключ
 * без префікса перетинається з чужим, а `localStorage.clear()` у сусіда стирає
 * наші дані (STORAGE-NAMESPACE-v9). Префікс лишається й після переїзду на
 * власний домен — переїхати можна й назад.
 *
 * Те саме слово в слово стосується `sessionStorage`: «сеансовий» він за
 * ЧАСОМ життя, а не за межею — простір імен у нього той самий, спільний на
 * весь origin, і `sessionStorage.clear()` у сусідньому проєкті витер би
 * відкриту тут дошку так само легко.
 *
 * ## Чому все через ці функції, а не `localStorage` напряму
 *
 * Крім префікса, тут два факти, про які легко забути в місці виклику:
 * звернення до сховища КИДАЄ у приватному режимі й при заблокованих даних
 * сайту, а на сервері (пререндер) `window` не існує взагалі. Обидва випадки
 * означають «значення немає», а не «застосунок зламався».
 */

export const PREFIX = 'audioremote_';

const store = (): Storage | null => {
	try {
		return typeof window === 'undefined' ? null : window.localStorage;
	} catch {
		// Доступ до сховища заблоковано політикою браузера.
		return null;
	}
};

/** Те саме для сховища вкладки. Причини впасти в нього ті самі. */
const sessionStore = (): Storage | null => {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage;
	} catch {
		return null;
	}
};

export function readItem(key: string): string | null {
	try {
		return store()?.getItem(PREFIX + key) ?? null;
	} catch {
		return null;
	}
}

export function writeItem(key: string, value: string): void {
	try {
		store()?.setItem(PREFIX + key, value);
	} catch {
		/* приватний режим або переповнена квота — не привід ламати екран */
	}
}

export function removeItem(key: string): void {
	try {
		store()?.removeItem(PREFIX + key);
	} catch {
		/* те саме */
	}
}

/**
 * Прибрати з одного сховища все, що почалося з нашого префікса.
 *
 * `clear()` тут заборонений категорично: origin спільний із рештою проєктів
 * автора, тож `clear()` витирає їхні дані теж. Саме тому префікс і існує — і
 * саме тому перелік ключів збирається ЗАЗДАЛЕГІДЬ: під час `removeItem`
 * індекси зсуваються, і цикл по `key(i)` з видаленням усередині пропускає
 * половину.
 */
function sweep(storage: Storage | null): number {
	if (!storage) return 0;

	try {
		const mine: string[] = [];
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index);
			if (key?.startsWith(PREFIX)) mine.push(key);
		}
		for (const key of mine) storage.removeItem(key);
		return mine.length;
	} catch {
		return 0;
	}
}

/** Прибрати ВСЕ, що записав цей застосунок надовго. Повертає, скільки було. */
export const clearOwn = (): number => sweep(store());

/**
 * Те саме у сховищі ВКЛАДКИ — і це не косметична пара до `clearOwn`.
 *
 * Тут лежить рівно один запис, `audioremote_active`, і це ВІДКРИТА ЗАРАЗ
 * дошка: її ключ, роль, обидва паролі. Аварійне скидання не закриває вкладку —
 * воно перезавантажує ту саму, — а `sessionStorage` вкладку переживає. Тобто
 * без цього прибирання скидання поверталося в ту саму дошку, з якої його й
 * натиснули.
 */
export const clearOwnSession = (): number => sweep(sessionStore());

/**
 * Прочитати JSON. Пошкоджене значення трактується як відсутнє й ПРИБИРАЄТЬСЯ.
 *
 * Прибирається навмисно: інакше один зіпсований запис ламав би той самий екран
 * при кожному відкритті, і людина не мала б способу з цього вийти.
 */
export function readJson<T>(key: string, fallback: T): T {
	const raw = readItem(key);
	if (raw === null) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		removeItem(key);
		return fallback;
	}
}

export function writeJson(key: string, value: unknown): void {
	writeItem(key, JSON.stringify(value));
}
