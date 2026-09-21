/**
 * ЗАПУСК ТРЕКУ ЗА ЗОВНІШНІМ API.
 *
 * ## Що це
 *
 * Треку можна дати адресу, яку застосунок опитує, і умову над відповіддю. Коли
 * умова СТАЄ правдивою — трек грає. Приклад, з якого це почалося: публічний API
 * повітряних тривог; але нічого специфічного для тривог тут немає, і не має
 * бути — джерело й умову називає людина.
 *
 * ## Чому не «вставте свій код»
 *
 * Найпростіше було б дати поле й виконати з нього JavaScript. Так зроблено не
 * буде, і причина не в обережності взагалі, а в конкретній речі: політика
 * безпеки цього застосунку не має `unsafe-eval` (див. `svelte.config.js`), бо
 * саме вона тримає весь клас «чужий скрипт виконався на сторінці». Дозволити
 * `eval` заради зручності одного налаштування означало б зняти захист з усього
 * іншого — з дошки, з пароля, з дескриптора теки.
 *
 * Тому замість коду — опис: ЗВІДКИ брати (адреса й заголовки), ЩО читати
 * (шлях у відповіді) і ЯК порівнювати. Цього досить для будь-якого JSON API, а
 * виконувати чуже нічого не треба.
 *
 * ## Що з цього НЕ випливає
 *
 * Опитування йде з браузера, тож чужий сервер мусить дозволити це заголовком
 * `Access-Control-Allow-Origin`. Багато API цього не роблять, і тоді не
 * допоможе жодне налаштування — це рішення їхнього боку, а не наше. Тому
 * помилка запиту показується в тому самому вікні, де тригер налаштовують:
 * мовчазна бездіяльність тут виглядала б як зламаний застосунок.
 */

/** Як порівнювати прочитане значення. */
/**
 * Умови ПАРАМИ: кожна має своє заперечення.
 *
 * Без заперечень половина подій не описується взагалі. Джерело, яке віддає
 * список САМИХ ЛИШЕ активних тривог, каже «тривога в Одесі» тим, що містить
 * її назву, — а «відбій» тим, що більше не містить. Умови «містить» без
 * «не містить» вистачило б рівно на половину задачі.
 */
export const TRIGGER_TESTS = [
	'truthy',
	'falsy',
	'equals',
	'notEquals',
	'contains',
	'notContains'
] as const;

export type TriggerTest = (typeof TRIGGER_TESTS)[number];

export interface TrackTrigger {
	/** Вимкнений тригер лишається записаним, але нічого не опитує. */
	on: boolean;
	/** Адреса, яку опитувати. */
	url: string;
	/** Як часто питати, секунди. */
	everySec: number;
	/** Заголовки запиту — сюди кладуть ключ доступу. */
	headers: Record<string, string>;
	/** Шлях у відповіді: `alerts.0.active`. Порожній — уся відповідь. */
	path: string;
	test: TriggerTest;
	/** З чим порівнювати. Для `truthy` не потрібне. */
	value: string;
	/**
	 * Тижневий розклад. Відсутній — дозволено цілодобово.
	 *
	 * Лежить у самому тригері, а не в налаштуваннях дошки: години в різних
	 * треків різні. Сирена потрібна, поки в залі люди; гонг на початок заняття —
	 * лише вранці.
	 */
	schedule?: WeekSchedule | null;
	/**
	 * Спрацьовувати лише тоді, коли умова ЗМІНИЛАСЯ з «ні» на «так».
	 *
	 * Вимкнене означає «щоразу, поки умова виконується»: так поводиться
	 * джерело, яке віддає разову подію й одразу про неї забуває. Для
	 * тривоги це протилежність потрібного — умова тримається сорок хвилин,
	 * і трек починався б спочатку на кожному опитуванні.
	 */
	onChange: boolean;
}

/** Рідше за це не питаємо: чужий сервер не мусить страждати від нашої зручності. */
export const MIN_INTERVAL_SEC = 5;

/**
 * Частіше за годину питати нема сенсу.
 *
 * Число стояло літералом у розмітці редактора (`max="3600"`), тобто межа поля
 * й межа змісту жили в різних файлах. Тут воно поруч із нижньою межею, і обидві
 * читаються разом.
 */
export const MAX_INTERVAL_SEC = 3600;

/**
 * КОЛИ ТРИГЕРУ ДОЗВОЛЕНО СПРАЦЮВАТИ — тижневий розклад.
 *
 * Без нього трек за зовнішнім API грає цілодобово. Для школи це означає сирену
 * о третій ночі в порожній залі — і, що гірше, у неділю, коли її нема кому
 * вимкнути. Розклад не вимикає тригер, він каже, коли тому дозволено звучати.
 *
 * Тиждень починається з ПОНЕДІЛКА: так його читає людина. `Date.getDay()`
 * рахує з неділі, і зсув робиться в одному місці — нижче.
 */
export interface DayWindow {
	/** Чи дозволено цього дня взагалі. */
	on: boolean;
	/** «ГГ:ХХ» за місцевим часом комп'ютера, який грає. */
	from: string;
	to: string;
}

export type WeekSchedule = DayWindow[];

/** Типовий розклад: щодня з восьмої до дев'ятої вечора. */
export const defaultSchedule = (): WeekSchedule =>
	Array.from({ length: 7 }, () => ({ on: true, from: '08:00', to: '21:00' }));

/** «ГГ:ХХ» у хвилини від півночі. Сміття — `null`. */
const minutesOf = (text: string): number | null => {
	const found = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
	if (!found) return null;

	const hours = Number(found[1]);
	const minutes = Number(found[2]);
	if (hours > 23 || minutes > 59) return null;
	return hours * 60 + minutes;
};

/** Чи потрапляє хвилина в вікно дня. Вікно через північ — окремий випадок. */
const inWindow = (day: DayWindow, minute: number): boolean => {
	if (!day.on) return false;

	const from = minutesOf(day.from);
	const to = minutesOf(day.to);
	if (from === null || to === null) return false;

	// Звичайне вікно: 08:00–21:00.
	if (from <= to) return minute >= from && minute < to;

	// Через північ: 22:00–02:00 — початок належить цьому дню, хвіст наступному.
	return minute >= from;
};

/**
 * Чи дозволено спрацювати ЗАРАЗ.
 *
 * Розклад відсутній — дозволено завжди: так поводилися всі тригери до появи
 * цієї можливості, і мовчки змінити це означало б вимкнути чужі сирени.
 *
 * Вікно через північ перевіряється ДВІЧІ: у поточному дні (чи вже почалося) і
 * у вчорашньому (чи ще триває). Без другої перевірки вікно «22:00–02:00»
 * закінчувалося б опівночі — тобто саме тоді, коли воно потрібне.
 */
export function withinSchedule(
	schedule: WeekSchedule | null | undefined,
	now: Date = new Date()
): boolean {
	if (!schedule || schedule.length !== 7) return true;

	// `getDay()` рахує з неділі, наш тиждень — з понеділка.
	const today = (now.getDay() + 6) % 7;
	const minute = now.getHours() * 60 + now.getMinutes();

	if (inWindow(schedule[today], minute)) return true;

	const yesterday = schedule[(today + 6) % 7];
	const from = minutesOf(yesterday.from);
	const to = minutesOf(yesterday.to);
	const overnight = yesterday.on && from !== null && to !== null && from > to;

	return overnight && minute < to;
}

export const emptyTrigger = (): TrackTrigger => ({
	on: false,
	url: '',
	everySec: 30,
	headers: {},
	path: '',
	test: 'truthy',
	value: '',
	onChange: true
});

/**
 * Значення за шляхом `a.b.0.c`.
 *
 * Числовий крок працює і для масиву, і для об'єкта з числовими ключами: у JSON
 * трапляється і те, і те, а розрізняти їх тут нема заради чого.
 *
 * Порожній шлях означає «уся відповідь» — саме так виглядає API, який віддає
 * просто `true`.
 */
export function readPath(data: unknown, path: string): unknown {
	const steps = path.split('.').filter((step) => step.length > 0);

	let at: unknown = data;
	for (const step of steps) {
		if (at === null || typeof at !== 'object') return undefined;
		at = (at as Record<string, unknown>)[step];
	}
	return at;
}

/**
 * Чи виконалася умова.
 *
 * `equals` порівнює РЯДКАМИ навмисно: у полі налаштувань людина набирає текст,
 * і `true` звідти ніколи не буде булевим. Інакше «порівняти з true» не
 * спрацювало б жодного разу, а причину не було б видно.
 */
export function matches(value: unknown, test: TriggerTest, expected: string): boolean {
	switch (test) {
		case 'equals':
			return same(value, expected);

		case 'notEquals':
			return !same(value, expected);

		case 'contains':
			return has(value, expected);

		case 'notContains':
			return !has(value, expected);

		case 'falsy':
			/*
			 * Дзеркало `truthy`, і воно потрібне не для симетрії.
			 *
			 * «Відбій» — це подія «стало порожньо»: тривога скінчилася, масив
			 * активних став порожнім, прапорець став `false`. Без цієї умови її
			 * довелося б виражати через «дорівнює false», що працює лише там, де
			 * джерело віддає саме прапорець, а не список.
			 */
			return !truthy(value);

		default:
			return truthy(value);
	}
}

/**
 * «Не порожньо» для JSON.
 *
 * Порожній масив мусить читатися як «нічого немає»: у більшості API це
 * саме той вигляд, у якому приходить «жодної тривоги». `Boolean([])` дав би
 * `true`, і тригер спрацьовував би на відповіді, у якій нічого не сталося.
 */
const truthy = (value: unknown): boolean =>
	Array.isArray(value) ? value.length > 0 : Boolean(value);

const same = (value: unknown, expected: string): boolean => String(value) === expected.trim();

/** Пошук по всій гілці як по тексту: підходить і рядку, і списку обʼєктів. */
const has = (value: unknown, expected: string): boolean =>
	JSON.stringify(value ?? null)
		.toLowerCase()
		.includes(expected.trim().toLowerCase());

/**
 * ЧИ ЗАПУСКАТИ ТРЕК НА ЦЬОМУ ОПИТУВАННІ.
 *
 * Винесено окремо й навмисно: саме тут була помилка, через яку сирена
 * починалася спочатку щопівхвилини. Попередній результат зберігався, але з
 * поточним не порівнювався — умова «виконується» видавалася за подію
 * «щойно почала виконуватися». У класі з таймерами й мережею цього не було
 * видно; тут кожен випадок займає рядок у тесті.
 *
 * `before === null` — ще не питали жодного разу. Це НЕ подія: тривога, яка
 * почалася до відкриття застосунку, почалася без нас, і зустрічати її
 * сиреною посеред заняття означало б лякати зал на порожньому місці.
 */
export function shouldFire(before: boolean | null, now: boolean, onChange: boolean): boolean {
	if (before === null) return false;
	return onChange ? !before && now : now;
}

/**
 * ОДИН ЗАПИТ НА АДРЕСУ, А НЕ НА ТРЕК.
 *
 * Доти кожен трек мав власний таймер і питав сам за себе. На десяти треках із
 * однієї адреси це десять однакових запитів, на ста — сто; при опитуванні раз
 * на тридцять секунд виходить понад три запити на секунду, а `ubilling`,
 * наприклад, віддає 429 уже після двох. Тобто складна дошка ламала б сама себе
 * — і чужий сервер заразом.
 *
 * Тут треки збираються в групи за парою (адреса, заголовки): відповідь
 * береться раз, а умову кожен перевіряє свою. Групування, а не кеш із міткою
 * часу: кеш лишає кожному його власний такт, і два треки, що прокинулися
 * одночасно, обидва побачать порожній кеш і обидва підуть у мережу. Спільний
 * таймер такої гонки не має за побудовою.
 *
 * Такт групи — НАЙМЕНШИЙ серед її учасників: той, хто просив частіше, просив
 * не дарма, а зайві опитування для решти нічого не коштують — відповідь уже є.
 */
export interface TriggerGroup {
	/** Адреса плюс заголовки: різні заголовки — різний запит. */
	key: string;
	url: string;
	headers: Record<string, string>;
	everySec: number;
	members: { trackId: string; trigger: TrackTrigger }[];
}

/** Заголовки в сталому порядку: інакше ключ залежав би від порядку набору. */
const headerKey = (headers: Record<string, string>): string =>
	JSON.stringify(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)));

export function groupTriggers(
	entries: readonly { id: string; trigger?: TrackTrigger | null }[]
): TriggerGroup[] {
	const groups = new Map<string, TriggerGroup>();

	for (const entry of entries) {
		const trigger = entry.trigger;
		if (!trigger || !triggerReady(trigger)) continue;

		const url = trigger.url.trim();
		const key = `${url}|${headerKey(trigger.headers)}`;
		const everySec = Math.max(MIN_INTERVAL_SEC, Math.round(trigger.everySec) || MIN_INTERVAL_SEC);

		const group = groups.get(key);
		if (group) {
			group.everySec = Math.min(group.everySec, everySec);
			group.members.push({ trackId: entry.id, trigger });
			continue;
		}

		groups.set(key, {
			key,
			url,
			headers: trigger.headers,
			everySec,
			members: [{ trackId: entry.id, trigger }]
		});
	}

	// Сталий порядок: за ним порівнюють плани, і випадковий порядок давав би
	// перезапуск таймерів на кожному збереженні.
	return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

/** Чи має сенс опитувати: без адреси тригер нічого не означає. */
export const triggerReady = (trigger: TrackTrigger): boolean =>
	trigger.on && /^https?:\/\/\S+$/i.test(trigger.url.trim());
