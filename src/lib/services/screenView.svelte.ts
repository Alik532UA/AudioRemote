import { readItem, writeItem } from './storage';

/**
 * ЩО ПОКАЗУВАТИ НА ЦІЙ СТОРІНЦІ — вибір, який переживає перезавантаження.
 *
 * ## Чому одна річ на дві дошки
 *
 * Питання в обох те саме: на екрані стоять дві великі речі — орган керування й
 * журнал, — і людині за пультом потрібна то одна, то обидві. В інфодошки вибір
 * був, в аудіодошки журнал висів завжди. Два різні рішення на одне питання
 * розходяться на першій же правці; заразом друге з них узагалі не було
 * рішенням — воно було відсутністю вибору.
 *
 * ## Чому в сховищі, а не в полі сторінки
 *
 * Вибір на інфодошці доти не зберігався ніде й скидався на кожному
 * перезавантаженні — при тому, що сусідній вибір у тій самій картці
 * («привертання уваги») зберігався. Це вибір про ЦЕЙ екран, як і решта в
 * картці керування: монітор за пультом не міняється між перезавантаженнями,
 * а от сторінку перезавантажують щовечора.
 */

export const VIEWS = ['both', 'main', 'log'] as const;
export type View = (typeof VIEWS)[number];

/** Яка дошка. Вибір у них окремий: екрани різні, і потреби різні. */
export type Board = 'audio' | 'info';

const isView = (value: unknown): value is View => VIEWS.includes(value as View);

class ScreenView {
	private chosen = $state<Record<Board, View>>({ audio: 'both', info: 'both' });

	/**
	 * Підняти збережене. Кличуть сторінки після монтування.
	 *
	 * Не в оголошенні: під передрендером `localStorage` існує (node 22+ кладе
	 * його в глобальну область) і НЕ порожній, тож читання запекло б у HTML
	 * вибір машини збірки.
	 */
	init(): void {
		for (const board of ['audio', 'info'] as const) {
			const saved = readItem(`view.${board}`);
			if (isView(saved)) this.chosen = { ...this.chosen, [board]: saved };
		}
	}

	of(board: Board): View {
		return this.chosen[board];
	}

	set(board: Board, view: View): void {
		this.chosen = { ...this.chosen, [board]: view };
		writeItem(`view.${board}`, view);
	}
}

export const screenView = new ScreenView();
