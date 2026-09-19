import { readJson, writeJson } from './storage';

/**
 * ЖУРНАЛ, ЯКИЙ ПЕРЕЖИВАЄ АВАРІЮ БРАУЗЕРА.
 *
 * ## Навіщо він узагалі
 *
 * Коли рендерер гине, консоль зникає разом із ним: у DevTools немає ні
 * повідомлення, ні стека, ні натяку. Саме так виглядала аварія з дескриптором
 * теки — браузер просто закривався, і сказати про неї можна було рівно одне:
 * «падає».
 *
 * Тому важливі кроки лишають слід у `localStorage`. Його пише не сторінка, а
 * процес браузера, і він переживає смерть вкладки. Після наступного відкриття
 * слід попереднього сеансу лежить на місці — його видно в налаштуваннях і
 * можна скопіювати одним натисканням.
 *
 * ## Чому `localStorage`, а не файл
 *
 * Сторінка не пише у файли без діалогу збереження, а діалог посеред аварії —
 * це не журнал. `localStorage` синхронний: запис доходить ДО того, як вкладка
 * встигне вмерти. Асинхронне сховище (IndexedDB) такої обіцянки не дає — і,
 * як з'ясувалося, саме воно цю аварію й спричиняло.
 *
 * ## Чому межа в тридцять записів
 *
 * Журнал має відповідати на питання «що робилося перед падінням», а не «що
 * робилося взагалі». Тридцять кроків — це кілька останніх дій; довший журнал
 * витісняв би корисне й займав квоту сховища.
 */

const CURRENT = 'trail';
const PREVIOUS = 'trail.prev';
const LIMIT = 30;

export interface Crumb {
	/** Скільки мілісекунд від початку цього сеансу. */
	at: number;
	step: string;
}

const started = Date.now();

/**
 * Позначити крок. Кидати звідси не можна НІЧОГО: журнал не має права стати
 * причиною падіння, яке він же й покликаний пояснити.
 */
export function mark(step: string): void {
	try {
		const trail = readJson<Crumb[]>(CURRENT, []);
		trail.push({ at: Date.now() - started, step });
		writeJson(CURRENT, trail.slice(-LIMIT));
	} catch {
		/* сховище недоступне — журналу просто не буде */
	}
}

/**
 * Почати новий сеанс: те, що записано доти, стає «попереднім».
 *
 * Саме попередній слід і цікавий — він обривається на тому кроці, після якого
 * вкладка не вижила.
 */
export function rotate(): void {
	try {
		const trail = readJson<Crumb[]>(CURRENT, []);
		if (trail.length > 0) writeJson(PREVIOUS, trail);
		writeJson(CURRENT, []);
	} catch {
		/* те саме */
	}
}

export const currentTrail = (): Crumb[] => readJson<Crumb[]>(CURRENT, []);
export const previousTrail = (): Crumb[] => readJson<Crumb[]>(PREVIOUS, []);

/** Журнал одним текстом — щоб його можна було скопіювати й надіслати. */
export function trailAsText(): string {
	const lines = (label: string, trail: Crumb[]) =>
		trail.length === 0 ? [] : [label, ...trail.map((crumb) => `  +${crumb.at}ms  ${crumb.step}`)];

	return [
		`AudioRemote ${__APP_VERSION__}`,
		navigator.userAgent,
		...lines('— попередній сеанс (обривається там, де впало) —', previousTrail()),
		...lines('— цей сеанс —', currentTrail())
	].join('\n');
}
