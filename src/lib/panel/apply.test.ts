import { describe, expect, it } from 'vitest';
import { applyPanelCommand, refused, type Levels } from './apply';
import { DEFAULT_LEVEL, type Panel, type PanelCommand } from '$lib/net/panelTypes';

/**
 * ТУТ ПЕРЕВІРЯЄТЬСЯ РІВНО ТЕ, ЩО ПРИХОДИТЬ ІЗ МЕРЕЖІ.
 *
 * Прохання надсилає чужий пристрій, а панель тим часом могла змінитися: кнопку
 * прибрали, комірку переклали на інший вид, крок підкрутили. Правила бази
 * стережуть ФОРМУ (число, межі, довжина рядка) і не знають нічого про те, що
 * саме стоїть у цій комірці ЗАРАЗ. Отже єдине місце, де «кнопка №2 у комірці,
 * де кнопок одна» перетворюється на відмову, а не на падіння, — тут.
 */

const panel: Panel = {
	rev: 3,
	cells: {
		'0': {
			kind: 'buttons',
			caption: 'фонограма',
			buttons: [{ label: 'гучніше' }, { label: 'ок' }, { label: 'тихіше' }]
		},
		'4': { kind: 'slider', caption: 'мікрофон', step: 10 },
		'7': { kind: 'check', caption: 'ревербація' }
	}
};

const command = (over: Partial<PanelCommand>): PanelCommand => ({
	by: 'uid',
	type: 'press',
	at: 0,
	cell: '0',
	...over
});

const EMPTY: Levels = {};

describe('прохання з інфодошки', () => {
	it('натискання кнопки бере підпис із ПАНЕЛІ, а не з прохання', () => {
		const result = applyPanelCommand(panel, EMPTY, command({ type: 'press', value: 2 }));
		if (refused(result)) throw new Error(result);

		expect(result.notice).toMatchObject({
			cell: '0',
			caption: 'фонограма',
			label: 'тихіше',
			move: null
		});
		// Кнопка стану не тримає: вона лише просить.
		expect(result.next).toBe(EMPTY);
	});

	it('кнопки, якої вже немає, не існує — це відмова, а не перша-ліпша', () => {
		expect(applyPanelCommand(panel, EMPTY, command({ type: 'press', value: 3 }))).toBe(
			'panel.badValue'
		);
		expect(applyPanelCommand(panel, EMPTY, command({ type: 'press', value: -1 }))).toBe(
			'panel.badValue'
		);
	});

	it('комірки, якої немає в панелі, теж', () => {
		expect(applyPanelCommand(panel, EMPTY, command({ cell: '9' }))).toBe('panel.noCell');
	});

	it('прохання не того роду відхиляється, а не тлумачиться', () => {
		// Господар перескладав комірку, поки прохання летіло.
		expect(applyPanelCommand(panel, EMPTY, command({ cell: '4', type: 'press', value: 0 }))).toBe(
			'panel.wrongKind'
		);
		expect(applyPanelCommand(panel, EMPTY, command({ cell: '0', type: 'bump', value: 5 }))).toBe(
			'panel.wrongKind'
		);
	});

	it('повзунок рахується від того, що вже є, і каже «було → стало»', () => {
		const state: Levels = { levels: { '4': 40 } };
		const result = applyPanelCommand(panel, state, command({ cell: '4', type: 'bump', value: 10 }));
		if (refused(result)) throw new Error(result);

		expect(result.notice).toMatchObject({ caption: 'мікрофон', move: 'up', from: 40, to: 50 });
		expect(result.next.levels).toEqual({ '4': 50 });
	});

	it('нечіпаний повзунок починає з середини, а не з нуля', () => {
		const result = applyPanelCommand(
			panel,
			EMPTY,
			command({ cell: '4', type: 'bump', value: -10 })
		);
		if (refused(result)) throw new Error(result);

		expect(result.notice).toMatchObject({ move: 'down', from: DEFAULT_LEVEL });
		expect(result.notice.to).toBe(DEFAULT_LEVEL - 10);
	});

	it('за межі 0…100 не виходить, і журнал каже правду про це', () => {
		const state: Levels = { levels: { '4': 95 } };
		const result = applyPanelCommand(panel, state, command({ cell: '4', type: 'bump', value: 20 }));
		if (refused(result)) throw new Error(result);

		expect(result.notice).toMatchObject({ from: 95, to: 100 });
	});

	it('крок поза межами правил бази не приймається', () => {
		for (const value of [0, 51, -51, 2.5, 'гучніше', undefined]) {
			expect(
				applyPanelCommand(panel, EMPTY, command({ cell: '4', type: 'bump', value })),
				`крок ${String(value)}`
			).toBe('panel.badValue');
		}
	});

	it('перемикач знає лише «навпаки» — і тому два натискання повертають назад', () => {
		const first = applyPanelCommand(panel, EMPTY, command({ cell: '7', type: 'toggle' }));
		if (refused(first)) throw new Error(first);
		expect(first.notice.move).toBe('on');
		expect(first.next.flags).toEqual({ '7': true });

		const second = applyPanelCommand(panel, first.next, command({ cell: '7', type: 'toggle' }));
		if (refused(second)) throw new Error(second);
		expect(second.notice.move).toBe('off');
		expect(second.next.flags).toEqual({ '7': false });
	});

	it('сусідні органи не зачіпаються', () => {
		const state: Levels = { levels: { '4': 30 }, flags: { '7': true } };
		const result = applyPanelCommand(panel, state, command({ cell: '4', type: 'bump', value: 10 }));
		if (refused(result)) throw new Error(result);

		expect(result.next.flags).toEqual({ '7': true });
		// Вхідний стан не переписується на місці: сторінка тримає його в `$state`.
		expect(state.levels).toEqual({ '4': 30 });
	});
});
