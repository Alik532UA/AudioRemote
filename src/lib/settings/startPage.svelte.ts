import type { SavedBoard } from '$lib/board/myBoards';

/**
 * ЩО РОБИТИ, КОЛИ ЗАСТОСУНОК ВІДКРИВАЮТЬ.
 *
 * ## Чому це не просто «яка адреса»
 *
 * Спокуса зберегти шлях рядком і зробити `goto(шлях)` велика — і вона не
 * працює. `/player` і `/remote` не відкриваються самі: їм потрібна активна
 * дошка в `sessionStorage`, а у свіжій вкладці її немає НІКОЛИ. Тобто вибір
 * «плеєр» без додаткової роботи означав би «меню», а гвардія тієї сторінки
 * відправила б назад на корінь — і вийшла б петля.
 *
 * Тому налаштування описує НАМІР, а рішення обчислюється тут: узяти останню
 * збережену дошку потрібної ролі, або створити сталу, або показати меню.
 *
 * ## Чому функція чиста
 *
 * Усе, чого вона торкається, приходить аргументами: браузера тут немає, і саме
 * тому кожну гілку видно в тесті. Виконує рішення сторінка-стрілочник `/`.
 */

/** Порядок тут — це порядок у налаштуваннях. */
export const START_PAGES = ['menu', 'create', 'player', 'connect', 'remote'] as const;

export type StartPage = (typeof START_PAGES)[number];

export const isStartPage = (value: unknown): value is StartPage =>
	typeof value === 'string' && (START_PAGES as readonly string[]).includes(value);

/**
 * Чому замість обіцяної сторінки показали меню.
 *
 * Мовчазне меню замість плеєра людина читає як «налаштування не зберігається».
 * Один рядок пояснення коштує дешевше за це непорозуміння.
 */
export type StartNotice = 'noPlayerBoard' | 'noRemoteBoard' | 'createFailed';

export type StartDecision =
	/** Меню. `notice` — якщо туди потрапили не за бажанням, а через брак дошки. */
	| { kind: 'menu'; notice?: StartNotice }
	/** Звичайна сторінка, якій нічого не треба. */
	| { kind: 'page'; page: 'create' | 'connect' }
	/** Стала пара є — відкрити ту саму дошку приймача, не питаючи. */
	| { kind: 'createFixed' }
	/** Повернутися в збережену дошку: роль бере з неї самої. */
	| { kind: 'board'; board: SavedBoard };

/**
 * `boards` очікується відсортованим за «коли востаннє відкривали» — саме таким
 * його віддає `listBoards()`.
 */
export function decideStart(
	start: StartPage,
	boards: readonly SavedBoard[],
	hasFixedPair: boolean
): StartDecision {
	switch (start) {
		case 'create':
			/*
			 * Зі сталою парою кнопка «Створити» однаково щоразу відкриває ТУ САМУ
			 * дошку — натискати її нема заради чого. Без сталої пари автоматичне
			 * створення сипало б нову дошку з новим паролем на кожен запуск.
			 */
			return hasFixedPair ? { kind: 'createFixed' } : { kind: 'page', page: 'create' };

		case 'connect':
			return { kind: 'page', page: 'connect' };

		case 'player':
		case 'remote': {
			const board = boards.find((saved) => saved.role === start);
			if (board) return { kind: 'board', board };
			return {
				kind: 'menu',
				notice: start === 'player' ? 'noPlayerBoard' : 'noRemoteBoard'
			};
		}

		default:
			return { kind: 'menu' };
	}
}

/**
 * Причина, з якою прийшли в меню. Живе до першого показу.
 *
 * Не через параметр адреси навмисно: `?from=player` лишався б у рядку після
 * перезавантаження й обіцяв би пояснення, якого вже нема чому стосуватися.
 */
class StartNoticeState {
	reason = $state<StartNotice | null>(null);

	/** Прочитати й одразу забути: напис показується один раз. */
	take(): StartNotice | null {
		const reason = this.reason;
		this.reason = null;
		return reason;
	}
}

export const startNotice = new StartNoticeState();
