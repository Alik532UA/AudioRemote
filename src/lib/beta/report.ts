import { ALL_CHECKS, BETA_TABS, type BetaCheck, type BetaTab } from './checks';

/**
 * ЗВІТ І ФІЛЬТР СХОВИЩА — чиста частина чеклиста, без рун.
 *
 * Окремо від `marks.svelte.ts` не з охайності. По-перше, сюди не тягнеться
 * реактивність: складання тексту й перевірка форми прочитаного — звичайні
 * функції від аргументів, і кожну гілку видно в тесті без монтування чогось.
 * По-друге, руни тягнуть за собою правила саме про реактивний стан: `new Date`
 * у файлі з рунами лінт вимагає замінити на реактивний варіант — цілком
 * слушно там, де дата ЗМІНЮЄТЬСЯ, і безглуздо тут, де вона один раз друкується
 * в рядок.
 */

export type Vote = 'fail' | 'weird' | 'ok';

export interface Mark {
	vote: Vote;
	/** Версія збірки, на якій поставили. */
	version: string;
}

export type Marks = Record<string, Mark>;

/**
 * Версія цієї збірки — з єдиного джерела версії проєкту.
 *
 * Вписана руками, вона розсинхронізувалася б із релізом і почала б брехати
 * саме там, де від неї залежить сенс УСІХ позначок одразу.
 */
export const VERSION: string = __APP_VERSION__;

const VOTES: readonly string[] = ['fail', 'weird', 'ok'];

const isMark = (value: unknown): value is Mark => {
	if (typeof value !== 'object' || value === null) return false;
	const mark = value as Record<string, unknown>;
	return VOTES.includes(mark.vote as string) && typeof mark.version === 'string';
};

const KNOWN: ReadonlySet<string> = new Set(ALL_CHECKS.map((check) => check.id));

/**
 * Лишити тільки те, що і відоме, і правильної форми. Решта = позначки немає.
 *
 * Сховище переживає і зміну чеклиста, і зміну формату позначки, і сусідні
 * проєкти на тому самому origin, тож прочитане звідти не є тим, що туди писали.
 * Найчастіший випадок безневинний і найгірший: пункт прибрали з чеклиста, а
 * позначка лишилася — вона рахується в поступі, і сторінка показує «40 / 37»,
 * число, яке не означає нічого й не має де виправитися.
 */
export function trusted(raw: unknown, known: ReadonlySet<string> = KNOWN): Marks {
	if (typeof raw !== 'object' || raw === null) return {};
	const out: Marks = {};
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (known.has(id) && isMark(value)) out[id] = value;
	}
	return out;
}

/** Пункти вкладки одного рівня, у порядку оголошення: він тематичний. */
export const byLevel = (tab: BetaTab, level: BetaCheck['coverage']): BetaCheck[] =>
	tab.checks.filter((check) => check.coverage === level);

/**
 * ЗВІТ — ТЕКСТОМ, і лише про позначене.
 *
 * Перелік недивленого зробив би звіт нечитним: людина надсилає те, що знайшла,
 * а не те, чого не відкривала. Поламане йде вгору, і окремим рядком — поламане
 * в місці, яке ПОКРИТЕ автотестом: це звіт про дефект тесту, а не застосунку, і
 * новина гірша за звичайний баг, бо знецінює всі зелені прогони.
 */
export function reportText(marks: Marks, lang: 'uk' | 'en', extra: string[] = []): string {
	const order: Record<Vote, number> = { fail: 0, weird: 1, ok: 2 };
	const label: Record<Vote, string> = {
		fail: lang === 'uk' ? 'НЕ ПРАЦЮЄ' : 'BROKEN',
		weird: lang === 'uk' ? 'ПРАЦЮЄ, АЛЕ ДИВНО' : 'WORKS, BUT ODD',
		ok: lang === 'uk' ? 'ПРАЦЮЄ' : 'WORKS'
	};
	const stale = lang === 'uk' ? 'позначено на версії' : 'marked on version';
	const covered =
		lang === 'uk'
			? 'ПУНКТ ПОКРИТО АВТОТЕСТОМ — тест не побачив цієї помилки:'
			: 'THIS ITEM IS COVERED BY A TEST — the test missed this:';

	const lines: string[] = [`AudioRemote ${VERSION}`, new Date().toISOString(), ...extra, ''];

	const marked = BETA_TABS.flatMap((tab) =>
		tab.checks.filter((check) => marks[check.id]).map((check) => ({ tab, check }))
	).sort((a, b) => order[marks[a.check.id].vote] - order[marks[b.check.id].vote]);

	for (const { tab, check } of marked) {
		const mark = marks[check.id];
		const age = mark.version === VERSION ? '' : ` (${stale} ${mark.version})`;
		lines.push(`[${label[mark.vote]}] ${check.id} — ${tab.title[lang]}${age}`);
		lines.push(`    ${check.text[lang]}`);
		if (mark.vote === 'fail' && check.coverage === 'covered') {
			lines.push(`    !!! ${covered} ${check.test}`);
		}
		lines.push('');
	}

	if (marked.length === 0) lines.push(lang === 'uk' ? '(нічого не позначено)' : '(nothing marked)');
	return lines.join('\n');
}
