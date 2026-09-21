import {
	MAX_BUTTONS,
	PANEL_CELLS,
	PANEL_COLS,
	PANEL_ROWS,
	type Panel,
	type PanelCell
} from '$lib/net/panelTypes';

/**
 * СКІЛЬКИ МІСЦЯ ЗАЙМАЄ ВІДЖЕТ — і де саме воно є.
 *
 * Доти будь-який віджет сидів в одній клітинці: три кнопки ділили 122 точки
 * висоти на трьох, і кожна виходила 102×34 при стандарті 44. Тепер клітинка —
 * це одиниця ВИМІРУ, а не межа: віджет бере стільки клітинок, скільки в ньому
 * органів, і кнопка отримує цілу.
 *
 * | Віджет | Клітинок |
 * |---|---|
 * | кнопки | скільки кнопок |
 * | повзунок | дві (більше, менше) |
 * | перемикач | одна |
 *
 * ## Поворот
 *
 * Той самий віджет стоїть або стовпчиком (займає рядки), або рядком (займає
 * стовпці). Вибір не косметичний: три кнопки стовпчиком — це третина висоти
 * однієї колонки, три кнопки рядком — цілий ряд сітки на всю ширину. Що з
 * цього зручніше, знає той, хто складає панель для свого залу.
 *
 * ## Віджет НІКОЛИ не зникає
 *
 * Якщо в запитаному повороті місця немає, пробується протилежний; якщо немає й
 * там — віджет стає в саму лише клітинку-якір, тобто повертається до старого
 * тісного вигляду. Панелі, складені до появи розмірів, саме так і виглядають:
 * гірше, ніж могли б, але цілі. Мовчазне зникнення віджета було б гіршим за
 * будь-яку тісноту: людина в залі натисла б порожнє місце.
 */

export interface Placed {
	/** Ключ комірки-якоря, `'0'`…`'14'`. */
	cell: string;
	/** Рядок і стовпець якоря, з нуля. */
	row: number;
	col: number;
	/** Скільки рядів і стовпців зайнято НАСПРАВДІ. */
	rows: number;
	cols: number;
	/** Чи стоять органи стовпчиком. */
	vertical: boolean;
}

/** Скільки клітинок просить віджет. */
export function spanOf(cell: PanelCell): number {
	if (cell.kind === 'slider') return 2;
	if (cell.kind === 'check') return 1;
	return Math.min(MAX_BUTTONS, Math.max(1, cell.buttons?.length ?? 1));
}

/** Типовий поворот — стовпчиком: так віджет на п'ять кнопок улазить завжди. */
export const isVertical = (cell: PanelCell): boolean => cell.vertical !== false;

/** Клітинки, які зайняв би віджет. `null` — не влазить або місце зайняте. */
function areaOf(at: number, span: number, vertical: boolean, taken: ReadonlySet<number>) {
	const row = Math.floor(at / PANEL_COLS);
	const col = at % PANEL_COLS;
	if (vertical ? row + span > PANEL_ROWS : col + span > PANEL_COLS) return null;

	const cells: number[] = [];
	for (let step = 0; step < span; step += 1) {
		cells.push(vertical ? at + step * PANEL_COLS : at + step);
	}
	return cells.some((cell) => taken.has(cell)) ? null : cells;
}

/**
 * Розкласти панель: де стоїть кожен віджет і які клітинки лишилися вільними.
 *
 * Порядок обходу — за номером якоря, і це важить: він робить розкладку
 * ОДНОЗНАЧНОЮ. Два віджети, що претендують на ту саму клітинку (а таке дають
 * лише зіпсуті дані — складальник цього не створить), розводяться завжди
 * однаково, і на двох екранах панель виглядає однаково.
 */
export function layoutPanel(panel: Panel): { placed: Placed[]; free: string[] } {
	const taken = new Set<number>();
	const placed: Placed[] = [];

	for (let index = 0; index < PANEL_CELLS; index += 1) {
		const cell = panel.cells[String(index)];
		if (!cell) continue;

		const span = spanOf(cell);
		const wanted = isVertical(cell);
		const cells =
			areaOf(index, span, wanted, taken) ??
			areaOf(index, span, !wanted, taken) ??
			areaOf(index, 1, wanted, taken);
		// Якір зайняв сусід — малювати нема де. Буває лише на зіпсутих даних.
		if (!cells) continue;

		for (const at of cells) taken.add(at);
		const vertical = cells.length < 2 ? wanted : cells[1] === index + PANEL_COLS;
		placed.push({
			cell: String(index),
			row: Math.floor(index / PANEL_COLS),
			col: index % PANEL_COLS,
			rows: vertical ? cells.length : 1,
			cols: vertical ? 1 : cells.length,
			vertical
		});
	}

	const free: string[] = [];
	for (let index = 0; index < PANEL_CELLS; index += 1) {
		if (!taken.has(index)) free.push(String(index));
	}

	return { placed, free };
}

/**
 * Чи стане віджет такого розміру в цю клітинку — і чи не наступить на сусіда.
 *
 * `ignore` — віджет, який ЗАРАЗ правлять: його власне місце не вважається
 * зайнятим, інакше зміна повороту на місці була б неможлива завжди.
 */
export function fits(
	panel: Panel,
	at: string,
	span: number,
	vertical: boolean,
	ignore?: string
): boolean {
	const others: Panel = { rev: panel.rev, cells: { ...panel.cells } };
	if (ignore !== undefined) delete others.cells[ignore];
	delete others.cells[at];

	const taken = new Set<number>();
	for (const spot of layoutPanel(others).placed) {
		for (let step = 0; step < Math.max(spot.rows, spot.cols); step += 1) {
			taken.add(
				spot.vertical
					? (spot.row + step) * PANEL_COLS + spot.col
					: spot.row * PANEL_COLS + spot.col + step
			);
		}
	}

	return areaOf(Number(at), span, vertical, taken) !== null;
}

/**
 * ПЕРЕСУНУТИ ВІДЖЕТ — або помінятися місцями, якщо там уже хтось є.
 *
 * Повертає НОВУ мапу комірок, або `null`, коли так не вийде. `null` означає
 * «нічого не сталося», і саме тому перевірок тут дві, а не одна: віджет мусить
 * стати на нове місце, а той, кого він звідти зрушив, — на звільнене. Одна
 * перевірка дала б обмін, після якого другий віджет не влазить і мовчки
 * зникає.
 *
 * Обидві перевірки робляться на панелі БЕЗ обох учасників: інакше кожен із них
 * заважав би сам собі — свої ж клітинки рахувалися б за зайняті.
 */
export function moveTo(panel: Panel, from: string, to: string): Panel['cells'] | null {
	if (from === to) return null;

	const source = panel.cells[from];
	if (!source) return null;
	const target = panel.cells[to];

	const rest: Panel = { rev: panel.rev, cells: { ...panel.cells } };
	delete rest.cells[from];
	delete rest.cells[to];

	const landed = turnedInto(rest, to, source);
	if (!landed) return null;

	let swapped: PanelCell | null = null;
	if (target) {
		// Джерело вже на новому місці — звідти й дивимося, чи стане другий.
		const moved: Panel = { rev: rest.rev, cells: { ...rest.cells, [to]: landed } };
		swapped = turnedInto(moved, from, target);
		if (!swapped) return null;
	}

	const cells = { ...panel.cells };
	delete cells[from];
	cells[to] = landed;
	if (swapped) cells[from] = swapped;
	return cells;
}

/**
 * Віджет у новому місці — із поворотом, у якому він туди стає.
 *
 * Спершу пробується той поворот, який у віджета вже є: переїзд не мусить
 * міняти його вигляд без потреби. Якщо так не влазить — протилежний, бо
 * відмовити в переїзді на вільне місце лише через поворот означало б вимагати
 * від людини спершу повернути, а потім тягнути. `null` — не влазить ніяк.
 */
function turnedInto(panel: Panel, at: string, cell: PanelCell): PanelCell | null {
	const span = spanOf(cell);
	const wanted = isVertical(cell);

	if (fits(panel, at, span, wanted)) return cell;
	if (fits(panel, at, span, !wanted)) return { ...cell, vertical: !wanted };
	return null;
}
