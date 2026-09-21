import { readItem, writeItem } from '$lib/services/storage';
import { uk, type TranslationKey } from './uk';

export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * АНГЛІЙСЬКИЙ СЛОВНИК ПРИЇЖДЖАЄ ОКРЕМО, і це замір, а не смак.
 *
 * Обидва словники разом важили 15.7 КБ gzip і лежали в чанку, який тягне КОЖНА
 * сторінка — включно з тією, де дві кнопки. Бюджет сторінки (`check:bundle`)
 * від цього перейшов межу: 132.6 КБ при стелі 132, і найважчою половиною був
 * текст мови, якої в цьому залі ніхто не бачить.
 *
 * Українська лишається статичною з двох причин. Вона типова — отже майже
 * завжди потрібна одразу. І саме з неї виводиться `TranslationKey`, тобто
 * відкласти її означало б відкласти перевірку типів.
 *
 * ЦІНА НАЗВАНА: той, хто обрав англійську, на першому кадрі побачить
 * українську, доки не приїде чанк. Це один кадр і один невеликий запит, і
 * саме так у цьому проєкті й розставлені пріоритети: «англійська тут —
 * запасна, а не основна».
 */
const loadEnglish = () => import('./en').then((module) => module.en);

const STORAGE_KEY = 'lang';

const isLocale = (value: unknown): value is Locale =>
	typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * МОВА. Власна, без бібліотеки, і причина проста: словників два, підстановка
 * одна, а `svelte-i18n` тягне за собою асинхронну ініціалізацію, через яку на
 * першому кадрі видно ключі замість тексту.
 *
 * Типовою лишається українська: інструментом користуються працівники школи, і
 * англійська тут — запасна, а не основна.
 */
class I18nState {
	locale = $state<Locale>('uk');

	/**
	 * Словник НЕтипової мови, коли він уже приїхав.
	 *
	 * `null` означає «ще не приїхав», а не «немає»: доти показується українська,
	 * і текст сам зміниться, щойно чанк дійде.
	 */
	private other = $state<Record<TranslationKey, string> | null>(null);
	/** Щоб не замовляти той самий чанк двічі, поки перший у дорозі. */
	private pending: Promise<void> | null = null;

	/** Словник, яким перекладати ЗАРАЗ. */
	readonly dictionary: Record<TranslationKey, string> = $derived(
		this.locale === 'uk' ? uk : (this.other ?? uk)
	);

	/**
	 * Порядок джерел: збережений вибір → `?lang=` → мова браузера → українська.
	 *
	 * `?lang=` стоїть ПІСЛЯ сховища й нічого в нього не пише — це міжсайтовий
	 * сигнал від сусіднього проєкту, а не команда змінити вибір людини
	 * (I18N-v9 § 3.1). Хто вже обрав мову тут, той її й бачить.
	 */
	init(): void {
		const saved = readItem(STORAGE_KEY);
		if (isLocale(saved)) {
			void this.apply(saved);
			return;
		}

		const fromUrl = new URLSearchParams(window.location.search).get('lang');
		if (isLocale(fromUrl)) {
			void this.apply(fromUrl);
			return;
		}

		const fromBrowser = navigator.language.slice(0, 2);
		void this.apply(isLocale(fromBrowser) ? fromBrowser : 'uk');
	}

	/**
	 * Обрати мову. Обіцянка виконується, коли текст уже справді той.
	 *
	 * Натисканню на неї чекати не треба — екран перемалюється сам. Чекають ті,
	 * кому потрібен ГОТОВИЙ переклад одразу: перевірки.
	 */
	set(locale: Locale): Promise<void> {
		writeItem(STORAGE_KEY, locale);
		return this.apply(locale);
	}

	private async apply(locale: Locale): Promise<void> {
		this.locale = locale;
		// Мова документа — не косметика: від неї залежать читалка й перенесення.
		if (typeof document !== 'undefined') document.documentElement.lang = locale;
		if (locale === 'uk') return;

		/*
		 * Мов рівно дві, тож «не українська» означає англійську. Третя мова
		 * зробить із цього перелік — і зробить це видимо, бо тип `Locale`
		 * перестане звужуватися сам.
		 */
		this.pending ??= loadEnglish().then((dictionary) => {
			this.other = dictionary;
		});
		await this.pending;
	}
}

export const i18n = new I18nState();

/**
 * Переклад із підстановкою `{ім'я}`.
 *
 * Відсутнього ключа бути не може — тип не дозволить, — тож запасного шляху
 * «повернути ключ» тут немає навмисно: він приховав би помилку, якої система
 * типів уже не пропускає.
 */
export function t(key: TranslationKey, values?: Record<string, string | number>): string {
	const template = i18n.dictionary[key];
	if (!values) return template;

	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in values ? String(values[name]) : whole
	);
}

/**
 * ЧИСЛО ЗІ СЛОВОМ: «1 трек», «3 треки», «8 треків».
 *
 * Доти всі лічильники були написані так, щоб множини уникнути: «Знайдено
 * треків: 8» тримає одну форму за будь-якого числа. Це законний спосіб —
 * рівно доти, доки число стоїть ПІСЛЯ слова. У рядку «AudioRemote-folder 8
 * треків» воно стоїть перед ним, і обійти множину нема куди.
 *
 * Форми обирає `Intl.PluralRules`, а не власна перевірка останньої цифри:
 * саме така перевірка й дає «11 треки» замість «11 треків». Українська має
 * три форми, англійська дві — тому форма, якої в наборі немає, падає на
 * `other`.
 */
export function plural(
	forms: Partial<Record<Intl.LDMLPluralRule, TranslationKey>> & { other: TranslationKey },
	count: number
): string {
	const form = new Intl.PluralRules(i18n.locale).select(count);
	return t(forms[form] ?? forms.other, { count });
}

export type { TranslationKey };
