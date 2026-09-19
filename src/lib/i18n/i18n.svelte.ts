import { readItem, writeItem } from '$lib/services/storage';
import { en } from './en';
import { uk, type TranslationKey } from './uk';

export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { uk, en };
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
	 * Порядок джерел: збережений вибір → `?lang=` → мова браузера → українська.
	 *
	 * `?lang=` стоїть ПІСЛЯ сховища й нічого в нього не пише — це міжсайтовий
	 * сигнал від сусіднього проєкту, а не команда змінити вибір людини
	 * (I18N-v9 § 3.1). Хто вже обрав мову тут, той її й бачить.
	 */
	init(): void {
		const saved = readItem(STORAGE_KEY);
		if (isLocale(saved)) {
			this.apply(saved);
			return;
		}

		const fromUrl = new URLSearchParams(window.location.search).get('lang');
		if (isLocale(fromUrl)) {
			this.apply(fromUrl);
			return;
		}

		const fromBrowser = navigator.language.slice(0, 2);
		this.apply(isLocale(fromBrowser) ? fromBrowser : 'uk');
	}

	set(locale: Locale): void {
		writeItem(STORAGE_KEY, locale);
		this.apply(locale);
	}

	private apply(locale: Locale): void {
		this.locale = locale;
		// Мова документа — не косметика: від неї залежать читалка й перенесення.
		if (typeof document !== 'undefined') document.documentElement.lang = locale;
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
	const template = DICTIONARIES[i18n.locale][key];
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
