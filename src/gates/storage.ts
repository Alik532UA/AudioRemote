/**
 * СХОВИЩЕ НА `Map` ДЛЯ ПЕРЕВІРОК — і чому воно взагалі потрібне.
 *
 * `storage.ts` ходить у `window.localStorage` і `window.sessionStorage`. Під
 * jsdom їх там немає в робочому вигляді: node 22+ кладе на глобальний обʼєкт
 * власний `localStorage`, а без `--localstorage-file` це заглушка, у якої
 * немає навіть `removeItem` (той самий рядок «`--localstorage-file` was
 * provided without a valid path», що друкується на кожному прогоні). Звернення
 * падає з `is not a function`, тобто зовсім не так, як у браузері.
 *
 * Заразом це те, чого й просить канон (CODE-QUALITY-v9 § 3.2): перевірка не
 * залежить від того, що лишив по собі сусідній опис.
 *
 * ## Чому в `gates/`, а не в кожному файлі перевірок
 *
 * Бо файлів уже два, а копій має бути нуль. Тека `gates/` для цього й існує:
 * у збірку вона не їде, шляху з маршрутів до неї немає, а `structure.test.ts`
 * стереже, що кожен файл звідси кличе бодай один гейт.
 */
export function memoryStorage(): Storage {
	const box = new Map<string, string>();
	return {
		get length() {
			return box.size;
		},
		key: (index: number) => [...box.keys()][index] ?? null,
		getItem: (key: string) => box.get(key) ?? null,
		setItem: (key: string, value: string) => void box.set(key, String(value)),
		removeItem: (key: string) => void box.delete(key),
		clear: () => box.clear()
	};
}
