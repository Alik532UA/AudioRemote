/**
 * ЧИ ВУЗЬКИЙ ЕКРАН — у JS, а не лише в CSS.
 *
 * Майже все розводиться медіазапитом, і так краще: CSS не залежить від того, чи
 * встиг виконатися скрипт. Але одну річ медіазапитом не зробити — ПЕРЕНЕСТИ
 * вузол в інше місце сторінки. Шапка дошки на телефоні мусить опинитися в
 * смузі застосунку, тобто в іншому компоненті, а `display: none` там і тут
 * означав би два однакові вузли з одними й тими самими `data-testid`.
 *
 * Межа збігається з тією, на якій розкладка перестає бути одноколонковою:
 * тримати дві різні межі — це один рефакторинг до того, як вони розійдуться.
 */
export const NARROW_QUERY = '(max-width: 899px)';

class NarrowState {
	/** До ініціалізації — `false`: на сервері вікна немає, і ширини теж. */
	matches = $state(false);

	/** Підписатися на зміну ширини. Повертає функцію, яка відписує. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};

		const query = window.matchMedia(NARROW_QUERY);
		this.matches = query.matches;

		const onChange = (event: MediaQueryListEvent) => (this.matches = event.matches);
		query.addEventListener('change', onChange);
		return () => query.removeEventListener('change', onChange);
	}
}

export const narrow = new NarrowState();
