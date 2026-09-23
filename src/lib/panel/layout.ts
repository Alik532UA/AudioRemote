import {
	gridOf,
	MAX_BUTTONS,
	MAX_PANEL_COLS,
	MAX_PANEL_ROWS,
	type Grid,
	type Panel,
	type PanelCell,
	type PanelCommandType
} from '$lib/net/panelTypes';

export type { Grid };

/**
 * ІМ'Я ОРГАНА — не комірки, а того, у що саме тиснуть.
 *
 * У віджеті органів кілька, і підсвітити після натискання треба ОДИН. Комірки
 * для цього не досить: «гучніше» й «тихіше» живуть в одній комірці, а
 * спалахувати мусить та кнопка, якої торкнулися.
 *
 * Формат спільний для обох екранів і для журналу, тому він тут, а не в
 * розмітці: два однакові шаблони в різних файлах розійшлися б мовчки, і
 * підсвітка просто перестала б збігатися.
 */
export const controlOf = (cell: string, type: PanelCommandType, value?: string | number): string =>
	`${cell}|${type}|${value ?? ''}`;

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
}

/** Скільки ОРГАНІВ у віджеті: кнопок, або дві в повзунка, або один. */
export function spanOf(cell: PanelCell): number {
	if (cell.kind === 'slider') return 2;
	if (cell.kind === 'check') return 1;
	return Math.min(MAX_BUTTONS, Math.max(1, cell.buttons?.length ?? 1));
}

/** Типовий поворот — стовпчиком: так віджет на п'ять кнопок улазить завжди. */
export const isVertical = (cell: PanelCell): boolean => cell.vertical !== false;

export interface Size {
	rows: number;
	cols: number;
}

const whole = (value: unknown, max: number): boolean =>
	Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;

/**
 * РОЗМІР ВІДЖЕТА В КЛІТИНКАХ.
 *
 * Названий прямо — беремо названий; не названий — виводимо з кількості органів
 * і повороту. Обидва числа мусять бути разом і в межах сітки: пів розміру
 * («три ряди, а скільки стовпців — як вийде») дало б два джерела правди для
 * однієї відповіді.
 */
export function sizeOf(cell: PanelCell): Size {
	if (whole(cell.rows, MAX_PANEL_ROWS) && whole(cell.cols, MAX_PANEL_COLS)) {
		return { rows: cell.rows as number, cols: cell.cols as number };
	}

	const span = spanOf(cell);
	return isVertical(cell) ? { rows: span, cols: 1 } : { rows: 1, cols: span };
}

/** Той самий розмір, покладений набік. Це і є поворот. */
export const turned = (size: Size): Size => ({ rows: size.cols, cols: size.rows });

/**
 * ЧИ ВИДНО ВІДЖЕТ НА ЦЬОМУ ПУЛЬТІ.
 *
 * `null` означає «показати все» — так дивиться той, хто складає панель: йому
 * треба бачити всі місця одразу, інакше чужий віджет виглядав би вільною
 * клітинкою, і на неї поставили б другий.
 *
 * Віджет без назви бачать усі. Це й є «об'єднати в спільний пульт»: панель, у
 * якій нікого не названо, однакова в усіх — тобто така, як була завжди.
 */
export const onSheet = (cell: PanelCell, sheet: string | null): boolean =>
	sheet === null || !cell.sheet || cell.sheet === sheet;

/**
 * Назви пультів, які трапляються в панелі, — за абеткою й без повторів.
 *
 * Береться з самих віджетів, а не з окремого переліку: другий перелік мусив би
 * жити в базі й розходитися з віджетами щоразу, коли останній віджет пульта
 * прибрали, а назву — ні.
 */
export function sheetsOf(panel: Panel): string[] {
	const names = new Set<string>();
	for (const cell of Object.values(panel.cells)) {
		if (cell.sheet) names.add(cell.sheet);
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

/** Клітинки, які зайняв би прямокутник. `null` — не влазить або зайнято. */
function areaOf(at: number, size: Size, taken: ReadonlySet<number>, grid: Grid) {
	const row = Math.floor(at / grid.cols);
	const col = at % grid.cols;
	if (row + size.rows > grid.rows || col + size.cols > grid.cols) return null;

	const cells: number[] = [];
	for (let down = 0; down < size.rows; down += 1) {
		for (let right = 0; right < size.cols; right += 1) {
			cells.push((row + down) * grid.cols + col + right);
		}
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
export function layoutPanel(
	panel: Panel,
	sheet: string | null = null
): { placed: Placed[]; free: string[]; grid: Grid } {
	const grid = gridOf(panel);
	const cells = grid.rows * grid.cols;
	const taken = new Set<number>();
	const placed: Placed[] = [];

	for (let index = 0; index < cells; index += 1) {
		const cell = panel.cells[String(index)];
		if (!cell || !onSheet(cell, sheet)) continue;

		const wanted = sizeOf(cell);
		const tries: Size[] = [wanted, turned(wanted), { rows: 1, cols: 1 }];
		const size = tries.find((option) => areaOf(index, option, taken, grid) !== null);
		// Якір зайняв сусід — малювати нема де. Буває лише на зіпсутих даних.
		if (!size) continue;

		for (const at of areaOf(index, size, taken, grid) as number[]) taken.add(at);
		placed.push({
			cell: String(index),
			row: Math.floor(index / grid.cols),
			col: index % grid.cols,
			rows: size.rows,
			cols: size.cols
		});
	}

	const free: string[] = [];
	for (let index = 0; index < cells; index += 1) {
		if (!taken.has(index)) free.push(String(index));
	}

	return { placed, free, grid };
}

/**
 * Чи стане віджет такого розміру в цю клітинку — і чи не наступить на сусіда.
 *
 * `ignore` — віджет, який ЗАРАЗ правлять: його власне місце не вважається
 * зайнятим, інакше зміна повороту на місці була б неможлива завжди.
 */
export function fits(panel: Panel, at: string, size: Size, ignore?: string): boolean {
	const others: Panel = { ...panel, cells: { ...panel.cells } };
	if (ignore !== undefined) delete others.cells[ignore];
	delete others.cells[at];

	const board = layoutPanel(others);
	const taken = new Set<number>();
	for (const spot of board.placed) {
		for (let down = 0; down < spot.rows; down += 1) {
			for (let right = 0; right < spot.cols; right += 1) {
				taken.add((spot.row + down) * board.grid.cols + spot.col + right);
			}
		}
	}

	return areaOf(Number(at), size, taken, board.grid) !== null;
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

	const rest: Panel = { ...panel, cells: { ...panel.cells } };
	delete rest.cells[from];
	delete rest.cells[to];

	const landed = turnedInto(rest, to, source);
	if (!landed) return null;

	let swapped: PanelCell | null = null;
	if (target) {
		// Джерело вже на новому місці — звідти й дивимося, чи стане другий.
		const moved: Panel = { ...rest, cells: { ...rest.cells, [to]: landed } };
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
	const wanted = sizeOf(cell);
	if (fits(panel, at, wanted)) return cell;

	const other = turned(wanted);
	if (fits(panel, at, other)) return withSize(cell, other);
	return null;
}

/**
 * Той самий віджет із названим розміром.
 *
 * Коли розмір збігається з типовим, обидва числа НЕ пишуться, лишається сам
 * поворот: інакше віджет, у якого додали кнопку, застряг би в учорашньому
 * розмірі — і людина не зрозуміла б, чому нова кнопка стиснула сусідок.
 */
export function withSize(cell: PanelCell, size: Size): PanelCell {
	const span = spanOf(cell);
	const next: PanelCell = { ...cell };
	delete next.rows;
	delete next.cols;

	if (size.rows === span && size.cols === 1) return { ...next, vertical: true };
	if (size.cols === span && size.rows === 1) return { ...next, vertical: false };
	return { ...next, rows: size.rows, cols: size.cols };
}

/**
 * ЯК ЛЮДИНА ЗАДАЄ ФОРМУ: два звичні повороти й свій прямокутник третім.
 *
 * Типовий розмір рахується з кількості органів, і в дев'яти випадках із десяти
 * саме він і потрібен: п'ять кнопок стовпчиком, повзунок на дві клітинки. Але
 * «п'ять кнопок» буває і квадратом 2×3, і смужкою — а вивести це з самої лише
 * кількості неможливо, бо відповідь залежить від того, що стоїть поруч.
 */
export type Shape = 'down' | 'across' | 'custom';

/**
 * У якій формі віджет стоїть ЗАРАЗ — щоб вікно відкрилося на ній, а не на
 * типовій. Зворотне до `withSize`: та пише розмір у комірку, ця читає його
 * назад у той вибір, який людина колись зробила.
 */
export function shapeOf(cell: PanelCell | null): { shape: Shape; rows: number; cols: number } {
	if (!cell) return { shape: 'down', rows: 1, cols: 1 };

	const size = sizeOf(cell);
	const span = spanOf(cell);
	if (size.rows === span && size.cols === 1) return { shape: 'down', ...size };
	if (size.cols === span && size.rows === 1) return { shape: 'across', ...size };
	return { shape: 'custom', ...size };
}

/**
 * ЗНАЙТИ РОЗМІР, ЯКИЙ ВЛАЗИТЬ НА ЦЕ МІСЦЕ.
 *
 * Спочатку пробується поворот набік; якщо не стає — шукаємо найбільший прямокутник
 * у межах поточного розміру або 1×1. `null` — навіть 1×1 зайнято сусідом.
 */
export function fitInPlace(panel: Panel, at: string, size: Size, ignore?: string): Size | null {
	const sideways = turned(size);
	if (fits(panel, at, sideways, ignore)) return sideways;
	for (let r = size.rows; r >= 1; r -= 1) {
		for (let c = size.cols; c >= 1; c -= 1) {
			if (r === size.rows && c === size.cols) continue;
			if (fits(panel, at, { rows: r, cols: c }, ignore)) return { rows: r, cols: c };
		}
	}
	if (fits(panel, at, { rows: 1, cols: 1 }, ignore)) return { rows: 1, cols: 1 };
	return null;
}

/**
 * ЦІЛЬОВИЙ РОЗМІР ДОШКИ, якщо віджет випирає за край і її можна розширити.
 *
 * `null` — розширення не потрібне, неможливе (перевищує 9×9) або не розв'язує проблему.
 */
export function expansionFor(panel: Panel, at: string, size: Size, ignore?: string): Grid | null {
	const grid = gridOf(panel);
	const start = Number(at);
	const row = Math.floor(start / grid.cols);
	const col = start % grid.cols;
	const neededRows = row + size.rows;
	const neededCols = col + size.cols;
	const targetRows = Math.min(MAX_PANEL_ROWS, Math.max(grid.rows, neededRows));
	const targetCols = Math.min(MAX_PANEL_COLS, Math.max(grid.cols, neededCols));
	if (targetRows <= grid.rows && targetCols <= grid.cols) return null;
	const expanded: Panel = { ...panel, rows: targetRows, cols: targetCols };
	return fits(expanded, at, size, ignore) ? { rows: targetRows, cols: targetCols } : null;
}
