import { readItem, removeItem, writeItem } from './storage';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'theme';
/** Скільки триває плавний перехід у `tokens.css`. Клас знімається після нього. */
const TRANSITION_MS = 180;

const isTheme = (value: unknown): value is Theme =>
	typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/**
 * ТЕМА: що ОБРАНО й що ПОКАЗАНО — два різні поля.
 *
 * Це не мікрооптимізація стану, а вимога поведінки (THEME-SWITCHER § 2.1).
 * Наведення на кнопку теми показує цю тему на всій сторінці; якби показ писав у
 * те саме поле, що й вибір, то:
 *
 *  1. позначка «обрана» переїжджала б за курсором;
 *  2. після відведення сторінка лишалася б у чужій темі — назавжди;
 *  3. курсор, який просто перетнув панель, потрапляв би у сховище.
 *
 * Тому `chosen` — це вибір (він у сховищі, ним світиться позначка), а
 * `previewed` — тимчасовий показ, який не зберігається ніде.
 */
class ThemeState {
	/** Що обрано. `null` — вибору не робили, діє системна перевага. */
	chosen = $state<Theme | null>(null);

	/** Що показано на наведенні. Не зберігається. */
	previewed = $state<Theme | null>(null);

	/** Триває перемикання: доти прев'ю не знімається (§ 2.2). */
	private changing = false;

	/** Що зараз бачить око: показане має пріоритет над обраним. */
	get effective(): Theme | null {
		return this.previewed ?? this.chosen;
	}

	/** Прочитати збережений вибір. Атрибут уже виставив скрипт у `app.html`. */
	init(): void {
		const saved = readItem(STORAGE_KEY);
		if (isTheme(saved)) this.chosen = saved;
	}

	/**
	 * Повернутися до системної переваги.
	 *
	 * Це не «третя тема», а ВІДМОВА від вибору: запис прибирається зі сховища, а
	 * атрибут — з <html>, після чого схему знову вирішує `color-scheme: light dark`
	 * у токенах. Без цієї кнопки перший же клік був би незворотним — повернути
	 * «як у пристрої» не було б чим.
	 */
	chooseSystem(): void {
		this.changing = true;
		this.chosen = null;
		this.previewed = null;
		removeItem(STORAGE_KEY);
		this.applyTheme(null, { animate: true });

		window.setTimeout(() => {
			this.changing = false;
		}, TRANSITION_MS);
	}

	choose(theme: Theme): void {
		this.changing = true;
		this.chosen = theme;
		this.previewed = null;
		writeItem(STORAGE_KEY, theme);
		this.applyTheme(theme, { animate: true });

		window.setTimeout(() => {
			this.changing = false;
		}, TRANSITION_MS);
	}

	/**
	 * Показати тему на наведенні — ЛИШЕ для миші.
	 *
	 * На дотику `pointerenter` приходить, а `pointerleave` — ні, і тема
	 * застрягла б показаною. Палець і так «наводиться» тільки натискаючи, тож
	 * прев'ю там не дає нічого (§ 3).
	 */
	preview(theme: Theme, pointerType: string): void {
		if (pointerType !== 'mouse' || this.changing) return;
		this.previewed = theme;
		this.applyTheme(theme, { animate: false });
	}

	/**
	 * Зняти показ. Джерел ДВА, і друге — прибирання компонента.
	 *
	 * Панель зникає разом із курсором — від клавіші Esc, від кліку поза нею, від
	 * переходу на іншу сторінку. У всіх цих випадках `pointerleave` не приходить
	 * узагалі, і без другого джерела сторінка лишилася б у показаній темі
	 * (§ 3.1).
	 */
	endPreview(): void {
		if (this.previewed === null || this.changing) return;
		this.previewed = null;
		this.applyTheme(this.chosen, { animate: false });
	}

	/**
	 * Поставити атрибут на <html>. Тема — це токени, тож одного атрибута досить:
	 * сторінка перемальовується сама, без мережі й без перезавантаження.
	 */
	private applyTheme(theme: Theme | null, options: { animate: boolean }): void {
		const root = document.documentElement;

		if (options.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
			root.classList.add('theme-changing');
			window.setTimeout(() => root.classList.remove('theme-changing'), TRANSITION_MS);
		}

		if (theme === null) root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', theme);
	}
}

export const themeState = new ThemeState();
