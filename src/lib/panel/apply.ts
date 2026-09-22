import {
	DEFAULT_LEVEL,
	MAX_STEP,
	type Panel,
	type PanelCommand,
	type PanelState
} from '$lib/net/panelTypes';

/**
 * ЩО РОБИТЬ ПРОХАННЯ З ПАНЕЛЛЮ — однією чистою функцією.
 *
 * Тут сходяться дві речі, які легко розвести мовчки: нове положення органа й
 * рядок, що з'явиться на табло. Порахувати їх окремо означало б дозволити їм
 * розійтися — журнал казав би «стало 60», а повзунок показував би 55.
 *
 * ## Рахує ГОСПОДАР, а не той, хто натиснув
 *
 * Помічник шле НАМІР («гучніше»), а не нове значення. Причина в правилі, на
 * якому тримається вся схема доступу: у кожного вузла один письменник (див.
 * `panelTypes.ts`). Наслідок приємний: двоє помічників, що тиснуть «гучніше»
 * водночас, дають +2 кроки, а не затирають один одного.
 *
 * ## Чому окремо від сторінки
 *
 * Бо це єдине місце, де зустрічаються межі. Номер кнопки, якої в комірці вже
 * немає (господар перескладав панель, поки прохання летіло), крок за межами
 * дозволеного, комірка не того виду — усе це приходить із мережі й мусить
 * давати ВІДМОВУ, а не тихо змінене значення. У розмітці такі гілки читаються
 * як шум і зникають при першому переписуванні.
 */

/** Чому прохання не виконане. Ключі перекладу — показує їх той, хто натиснув. */
export type PanelRefusal = 'panel.noCell' | 'panel.wrongKind' | 'panel.badValue';

/**
 * Що сталося — рівно стільки, щоб скласти рядок журналу.
 *
 * Підпис кнопки береться з панелі, а не з прохання: прохання несе номер, і
 * саме тому рядок журналу однаковий у всіх, хто дивиться на ту саму панель.
 */
export interface PanelNotice {
	/** Номер комірки, `'0'`…`'14'`. */
	cell: string;
	/** Підпис комірки, як його написав господар. Порожній — його немає. */
	caption: string;
	/** Підпис натиснутої кнопки. `null` — дія без підпису (повзунок, чекбокс). */
	label: string | null;
	/** Напрямок або новий стан, коли підпису немає. */
	move: 'up' | 'down' | 'on' | 'off' | null;
	/** Було → стало. Лише повзунок: у кнопки стану немає, у чекбокса він у `move`. */
	from: number | null;
	to: number | null;
	/** Заготовка кольору: колір кнопки або колір віджета. */
	color?: string;
}

export interface PanelOutcome {
	notice: PanelNotice;
	/**
	 * Нове положення органів.
	 *
	 * Повертається ЗАВЖДИ, навіть коли нічого не змінилося (натиснули кнопку):
	 * тоді це той самий стан. Інакше кожен, хто кличе, мусив би пам'ятати, для
	 * яких видів комірок стан буває, а для яких ні.
	 */
	next: Levels;
}

/** Положення органів без серверної мітки: її ставить база при запису. */
export type Levels = Omit<PanelState, 'atServer'>;

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** Ціле число в межах — і нічого іншого з мережі не приймається. */
const whole = (value: unknown, min: number, max: number): number | null => {
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isInteger(number) || number < min || number > max) return null;
	return number;
};

export function applyPanelCommand(
	panel: Panel,
	state: Levels,
	command: PanelCommand
): PanelOutcome | PanelRefusal {
	const cell = panel.cells[command.cell];
	if (!cell) return 'panel.noCell';

	const caption = cell.caption ?? '';
	const levels = state.levels ?? {};
	const flags = state.flags ?? {};

	if (command.type === 'press') {
		if (cell.kind !== 'buttons') return 'panel.wrongKind';
		const buttons = cell.buttons ?? [];
		const index = whole(command.value, 0, buttons.length - 1);
		if (index === null) return 'panel.badValue';
		const color = buttons[index].color ?? cell.color;
		return {
			notice: {
				cell: command.cell,
				caption,
				label: buttons[index].label,
				move: null,
				from: null,
				to: null,
				...(color ? { color } : {})
			},
			next: state
		};
	}

	if (command.type === 'bump') {
		if (cell.kind !== 'slider') return 'panel.wrongKind';
		const step = whole(command.value, -MAX_STEP, MAX_STEP);
		if (step === null || step === 0) return 'panel.badValue';

		const from = clamp(levels[command.cell] ?? DEFAULT_LEVEL);
		const to = clamp(from + step);
		return {
			notice: {
				cell: command.cell,
				caption,
				label: null,
				move: step > 0 ? 'up' : 'down',
				from,
				to,
				...(cell.color ? { color: cell.color } : {})
			},
			next: { levels: { ...levels, [command.cell]: to }, flags }
		};
	}

	if (cell.kind !== 'check') return 'panel.wrongKind';
	/*
	 * Значення в `toggle` немає НАВМИСНО: перемикач знає лише «навпаки».
	 * Прохання «увімкни», надіслане двічі, при другому разі не зробило б нічого
	 * і виглядало б як кнопка, що не спрацювала.
	 */
	const was = flags[command.cell] === true;
	return {
		notice: {
			cell: command.cell,
			caption,
			label: null,
			move: was ? 'off' : 'on',
			from: null,
			to: null,
			...(cell.color ? { color: cell.color } : {})
		},
		next: { levels, flags: { ...flags, [command.cell]: !was } }
	};
}

/** Чи це відмова. Звуження типу — щоб гілки не писалися рядком щоразу. */
export const refused = (result: PanelOutcome | PanelRefusal): result is PanelRefusal =>
	typeof result === 'string';
