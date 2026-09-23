import { isColorSlug } from '$lib/config/trackColors';
import { readJson, writeJson } from '$lib/services/storage';
import {
	MAX_BUTTONS,
	MAX_CAPTION,
	MAX_LABEL,
	MAX_PANEL_ICON,
	MAX_SHEET,
	MAX_STEP,
	MIN_STEP,
	gridOf,
	MAX_PANEL_CELLS,
	MAX_PANEL_COLS,
	MAX_PANEL_ROWS,
	type CellKind,
	type Panel,
	type PanelButton,
	type PanelCell
} from '$lib/net/panelTypes';

/**
 * ПАНЕЛЬ ПЕРЕЖИВАЄ ВСЕ — перезавантаження, порожню базу, переїзд у інший зал.
 *
 * Панель складають раз і надовго: підписи, кольори, розміри, розташування під
 * руку конкретної людини. Досі єдиною її копією був вузол у базі, і цього
 * виявилося мало одразу двічі.
 *
 * ## Дзеркало в браузері
 *
 * Якщо вузол зник (база чиста, дошку перестворили, запис колись відкинули
 * правила), табло показувало порожню сітку й слово «складіть панель» — тобто
 * пропонувало зробити наново роботу, яку вже зробили. Тепер кожен знімок
 * лягає копією в локальне сховище, і коли вузла НЕМАЄ ЗОВСІМ, панель
 * повертається туди сама.
 *
 * Саме «немає зовсім», а не «порожня». Спорожнити панель — законна дія, і
 * відновлювати її після цього означало б не давати її стерти. Різницю видно в
 * даних: стерта панель лишає по собі вузол із номером редакції, а зниклої
 * немає взагалі.
 *
 * ## Файл
 *
 * Дзеркало прив'язане до браузера, а панель — ні. Її возять між залами,
 * показують колезі, тримають кілька варіантів на різні вистави. Для цього
 * потрібен файл, який можна покласти куди завгодно, — звичайний JSON.
 *
 * ## Прочитане З ФАЙЛУ — чуже, і перевіряється як чуже
 *
 * Файл міг прийти поштою, лежати рік або бути зіпсутим наполовину. Тому звідси
 * НЕ виходить нічого, чого не прийняли б правила бази: кожне поле звіряється з
 * тими самими межами, що записані в `database.rules.json`. Інакше перший же
 * підроблений файл дав би запис, який база відкине цілком, — і панель зникла
 * б замість того, щоб не завантажитися.
 */

const mirrorKey = (boardKey: string) => `panel.${boardKey}`;

/** Запам'ятати знімок панелі в цьому браузері. */
export function keepPanel(boardKey: string, panel: Panel): void {
	writeJson(mirrorKey(boardKey), panel);
}

/** Копія панелі цієї дошки. `null` — копії немає або вона порожня. */
export function recallPanel(boardKey: string): Panel | null {
	const kept = readJson<Panel | null>(mirrorKey(boardKey), null);
	if (!kept || typeof kept !== 'object') return null;
	const panel = cleanPanel(kept);
	return Object.keys(panel.cells).length > 0 ? panel : null;
}

/** Текст файлу панелі. Відступи — щоб у нього можна було заглянути очима. */
export const panelToText = (panel: Panel): string =>
	JSON.stringify(
		{ kind: 'audioremote.panel', rev: panel.rev, ...gridOf(panel), cells: panel.cells },
		null,
		'\t'
	);

/** Панель із тексту файлу. `null` — це не панель або в ній не лишилося комірок. */
export function panelFromText(text: string): Panel | null {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return null;
	}

	if (!raw || typeof raw !== 'object') return null;
	const panel = cleanPanel(raw as Partial<Panel>);
	return Object.keys(panel.cells).length > 0 ? panel : null;
}

const KINDS: readonly CellKind[] = ['buttons', 'slider', 'check'];

const text = (value: unknown, max: number): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.slice(0, max);
	return trimmed.length > 0 ? trimmed : undefined;
};

// Форма — з `trackColors.ts`: там вона звірена з правилом бази, а тут потрібна
// відповідь «нема чого класти», а не «ні».
const slug = (value: unknown): string | undefined => (isColorSlug(value) ? value : undefined);

const whole = (value: unknown, min: number, max: number): number | undefined => {
	if (!Number.isInteger(value)) return undefined;
	const number = value as number;
	return number >= min && number <= max ? number : undefined;
};

/** Кнопки: підпис обов'язковий, решта — як вийде. Без підпису кнопки немає. */
function cleanButtons(value: unknown): PanelButton[] | undefined {
	if (!Array.isArray(value)) return undefined;

	const buttons: PanelButton[] = [];
	for (const item of value.slice(0, MAX_BUTTONS)) {
		if (!item || typeof item !== 'object') continue;
		const label = text((item as PanelButton).label, MAX_LABEL);
		if (label === undefined) continue;

		const color = slug((item as PanelButton).color);
		const hidden = (item as PanelButton).hidden === true ? true : undefined;
		buttons.push({ label, ...(color ? { color } : {}), ...(hidden ? { hidden } : {}) });
	}
	return buttons.length > 0 ? buttons : undefined;
}

function cleanCell(value: unknown): PanelCell | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Partial<PanelCell>;
	if (!KINDS.includes(raw.kind as CellKind)) return null;

	const rows = whole(raw.rows, 1, MAX_PANEL_ROWS);
	const cols = whole(raw.cols, 1, MAX_PANEL_COLS);

	return {
		kind: raw.kind as CellKind,
		caption: text(raw.caption, MAX_CAPTION) ?? '',
		...(slug(raw.color) ? { color: slug(raw.color) } : {}),
		...(text(raw.icon, MAX_PANEL_ICON) ? { icon: text(raw.icon, MAX_PANEL_ICON) } : {}),
		...(text(raw.sheet, MAX_SHEET) ? { sheet: text(raw.sheet, MAX_SHEET) } : {}),
		...(cleanButtons(raw.buttons) ? { buttons: cleanButtons(raw.buttons) } : {}),
		...(whole(raw.step, MIN_STEP, MAX_STEP) ? { step: raw.step as number } : {}),
		...(typeof raw.vertical === 'boolean' ? { vertical: raw.vertical } : {}),
		// Половина розміру — не розмір: обидва числа або жодного (`layout.ts`).
		...(rows !== undefined && cols !== undefined ? { rows, cols } : {}),
		...(raw.important === true ? { important: true } : {})
	};
}

function cleanPanel(raw: Partial<Panel>): Panel {
	const cells: Panel['cells'] = {};
	const from = raw.cells;

	if (from && typeof from === 'object') {
		for (let index = 0; index < MAX_PANEL_CELLS; index += 1) {
			const cell = cleanCell(from[String(index)]);
			if (cell) cells[String(index)] = cell;
		}
	}

	// Розмір дошки теж приїжджає з файлу — інакше панель на шість стовпців
	// розклалася б у трьох, і половина віджетів просто не з'явилася б.
	const grid = gridOf({
		rows: whole(raw.rows, 1, MAX_PANEL_ROWS),
		cols: whole(raw.cols, 1, MAX_PANEL_COLS)
	});

	return { rev: whole(raw.rev, 0, Number.MAX_SAFE_INTEGER) ?? 0, ...grid, cells };
}
