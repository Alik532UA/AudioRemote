import { mark } from './breadcrumbs';

/**
 * ПОМИЛКИ, ЯКИХ НЕ ЛОВИТЬ ЖОДНА МЕЖА (ERROR-HANDLING-v9 § 2.3).
 *
 * ## Що лишалося непокритим
 *
 * Сіток безпеки в застосунку дві, і обидві мають вузьку область.
 * `+error.svelte` ловить помилки НАВІГАЦІЇ, `<svelte:boundary>` — помилки
 * РЕНДЕРУ й `$effect`. Поза ними лишається все інше — і саме там цей
 * застосунок і живе: натискання на трек іде в `playLocal` з двома `await`,
 * згасання ходить таймером, база кличе колбеки підписок, опитувач тригерів
 * пускає такт через `void this.poll()`.
 *
 * Виняток звідти не бачить ніхто. Сторінка лишається на місці, кнопка просто
 * не спрацьовує — і в залі це читається як «завис комп'ютер».
 *
 * ## Чому це пишеться саме в журнал
 *
 * [`breadcrumbs.ts`](./breadcrumbs.ts) збудований рівно під питання «що
 * робилося перед падінням» і переживає смерть вкладки. Але доти він відповідав
 * половиною: кроки в ньому були, а причина обриву — ні. Тепер поруч із
 * останнім кроком стоїть те, що саме кинуло, і звіт зі сторінки налаштувань
 * копіюється одним натисканням уже з нею.
 *
 * ## Чого тут немає навмисно
 *
 * `preventDefault()`. Він прибрав би повідомлення з консолі — тобто журнал
 * купувався б ціною DevTools, а це гірший обмін: у консолі є стек, а тут лише
 * рядок.
 *
 * Хука `hooks.client.ts` теж немає: помилки `load` і навігації вже дають
 * ВИДИМУ сторінку з кодом і виходом. Сенс цього модуля саме в тих, що не дають
 * нічого.
 */

/** Те, на що чіпляються слухачі. */
export interface CrashTarget {
	addEventListener(type: string, listener: (event: Event) => void): void;
	removeEventListener(type: string, listener: (event: Event) => void): void;
}

/**
 * Скільки лишити від опису.
 *
 * Журнал тримає тридцять записів у `localStorage`, і довге повідомлення з
 * чужої бібліотеки витіснило б звідти кроки, заради яких він і ведеться.
 */
const CAP = 140;

/** Ім'я файлу без адреси: у зібраному коді це хеш чанка, і шлях до нього довший за саму назву. */
const fileOf = (url: string): string => url.slice(url.lastIndexOf('/') + 1);

/**
 * Текст із того, що кинули. Кидають НЕ ЛИШЕ `Error`: `throw 'рядок'` і
 * відмова проміса будь-яким значенням — законні обидва.
 */
function textOf(value: unknown): string {
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	return String(value);
}

/** Один рядок журналу з події. */
function summarize(event: Event): string {
	if (event.type === 'unhandledrejection') {
		return `unhandled ${textOf((event as PromiseRejectionEvent).reason)}`;
	}

	const failure = event as ErrorEvent;
	const where = failure.filename ? ` @${fileOf(failure.filename)}:${failure.lineno}` : '';
	return `crash ${textOf(failure.error ?? failure.message)}${where}`;
}

/**
 * Записувати в журнал усе, що не впіймала жодна межа. Повертає зняття.
 *
 * `note` — параметр із типовим значенням, а не прямий виклик `mark()`, з тієї
 * самої причини, що й `UpdateHost` в `updateCheck.ts`: `mark()` пише в
 * `localStorage`, якого в прогоні без DOM немає, і перевірити було б нічим.
 */
export function logCrashes(target: CrashTarget, note: (step: string) => void = mark): () => void {
	/*
	 * ОСТАННІЙ ЗАПИСАНИЙ РЯДОК — щоб повтор не з'їв журнал.
	 *
	 * Виняток із таймера чи з `$effect` приходить не раз, а десятки разів на
	 * секунду. Без цієї пам'яті тридцять записів журналу за мить стають
	 * тридцятьма копіями одного рядка — тобто зникає рівно те, заради чого
	 * журнал і ведеться: кроки, які до цього призвели.
	 *
	 * Лічильник повторів не ведеться свідомо: `mark()` уміє лише дописувати, а
	 * переписувати останній запис заради числа «×47» означало б ускладнити
	 * єдине місце, яке не має права впасти. Перше входження — те, що потрібне.
	 */
	let last: string | null = null;

	const onCrash = (event: Event): void => {
		/*
		 * Своє `try` попри те, що `mark()` не кидає: кинути здатне САМЕ
		 * СКЛАДАННЯ рядка — `String()` на символі чи на об'єкті з власним
		 * `toString`. Перехоплювач помилок, який падає сам, лишив би після себе
		 * менше, ніж його відсутність.
		 */
		try {
			const step = summarize(event).slice(0, CAP);
			if (step === last) return;
			last = step;
			note(step);
		} catch {
			/* опис не склався — нехай лишається хоч подія в консолі */
		}
	};

	target.addEventListener('error', onCrash);
	target.addEventListener('unhandledrejection', onCrash);

	return () => {
		target.removeEventListener('error', onCrash);
		target.removeEventListener('unhandledrejection', onCrash);
	};
}
