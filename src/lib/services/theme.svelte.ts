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

	/** Такт спалаху, який ще не завершився. `null` — не блимаємо. */
	private flashing: number | null = null;

	/** Що зараз бачить око: показане має пріоритет над обраним. */
	get effective(): Theme | null {
		return this.previewed ?? this.chosen;
	}

	/**
	 * Чи темно ЗАРАЗ — з урахуванням системної переваги.
	 *
	 * Потрібне тугалу: він двопозиційний, тож мусить показувати не «що обрано»
	 * (обраного може й не бути), а що людина бачить. Доки вибору немає,
	 * відповідь дає система.
	 */
	get isDark(): boolean {
		const current = this.effective;
		if (current !== null) return current === 'dark';
		return typeof window !== 'undefined'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: false;
	}

	/**
	 * Перемкнути на протилежну від ВИДИМОЇ.
	 *
	 * Перший клік на системній темі робить вибір явним — і це правильно: людина
	 * щойно сказала, чого хоче. Повернутися до «як у пристрої» можна в
	 * налаштуваннях; двопозиційний перемикач третього стану не має за побудовою.
	 */
	toggle(): void {
		this.choose(this.isDark ? 'light' : 'dark');
	}

	/**
	 * СПАЛАХНУТИ ПРОТИЛЕЖНОЮ ТЕМОЮ — і повернутися.
	 *
	 * Потрібне інфодошці: віджет, позначений важливим, мусить бути помітним
	 * тому, хто на екран НЕ дивиться. Яскрава рамка на самому віджеті цього не
	 * робить — її видно лише тоді, коли вже дивишся. Мить, у яку весь екран
	 * став протилежним, ловиться краєм ока через увесь зал.
	 *
	 * Це ПОКАЗ, а не вибір: пишеться в `previewed`, не торкається сховища й
	 * лишає позначку «обрана тема» там, де вона й була. Тому ж повторний спалах
	 * спершу знімає попередній — інакше «протилежна» рахувалася б від уже
	 * перевернутої, і друге натискання поверталo б тему назад замість спалаху.
	 */
	flash(ms: number): void {
		if (typeof window === 'undefined') return;

		if (this.flashing !== null) {
			window.clearTimeout(this.flashing);
			this.previewed = null;
		}

		this.previewed = this.isDark ? 'light' : 'dark';
		this.applyTheme(this.previewed, { animate: true });

		this.flashing = window.setTimeout(() => {
			this.flashing = null;
			this.previewed = null;
			this.applyTheme(this.chosen, { animate: true });
		}, ms);
	}

	/** Прочитати збережений вибір. Атрибут уже виставив скрипт у `app.html`. */
	init(): void {
		const saved = readItem(STORAGE_KEY);
		if (isTheme(saved)) {
			this.chosen = saved;
			return;
		}
		if (this.shouldDefaultDark()) {
			this.chosen = 'dark';
			this.applyTheme('dark', { animate: false });
		}
	}

	/** Чи виставляти темну тему за замовчуванням: для емулятора та в тестах. */
	private shouldDefaultDark(): boolean {
		if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') return true;
		if (import.meta.env.MODE === 'test') return true;
		if (typeof window !== 'undefined') {
			const isLocal =
				window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
			const isPreview = window.location.port === '4173';
			if (isLocal && !isPreview) return true;
		}
		return false;
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
