// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	builtinFor,
	HOTKEY_SLOTS,
	isAssignable,
	isHotkeyEvent,
	keyLabelsFor,
	labelForCode,
	RESERVED_CODES,
	SEEK_STEP_MS,
	VOLUME_STEP
} from './hotkeys';

/**
 * Події збираються вручну: `code` тут головне поле, і саме його легко забути
 * поставити, якщо покластися на бібліотеку, що вміє «натиснути клавішу».
 */
const press = (init: Partial<KeyboardEvent> & { code: string }, target?: HTMLElement) => {
	const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
	if (target) Object.defineProperty(event, 'target', { value: target });
	return event;
};

describe('вбудовані дії', () => {
	it('пробіл — пауза або продовження', () => {
		// Одна клавіша на обидва стани, як у YouTube: людина не мусить пам'ятати,
		// що зараз відбувається, щоб знати, куди натиснути.
		expect(builtinFor(press({ code: 'Space' }))).toEqual({ kind: 'playPause' });
	});

	it.each(['Digit0', 'Numpad0'])('%s зупиняє', (code) => {
		expect(builtinFor(press({ code }))).toEqual({ kind: 'stop' });
	});

	it.each([
		['Minus', -VOLUME_STEP],
		['NumpadSubtract', -VOLUME_STEP],
		['ArrowDown', -VOLUME_STEP],
		['Equal', VOLUME_STEP],
		['NumpadAdd', VOLUME_STEP],
		['ArrowUp', VOLUME_STEP]
	])('%s міняє гучність на %i', (code, delta) => {
		expect(builtinFor(press({ code }))).toEqual({ kind: 'volume', delta });
	});

	it.each([
		['ArrowRight', SEEK_STEP_MS],
		['ArrowLeft', -SEEK_STEP_MS]
	])('%s перемотує на %i мс', (code, deltaMs) => {
		expect(builtinFor(press({ code }))).toEqual({ kind: 'seek', deltaMs });
	});

	it('українська розкладка не ламає нічого', () => {
		/*
		 * НАЙВАЖЛИВІШИЙ ВИПАДОК ФАЙЛУ. У школі розкладка українська, і фізична
		 * клавіша `m` дає символ `ь`. Перевірка по `event.key` не спрацювала б
		 * саме там, де цим користуються.
		 */
		expect(builtinFor(press({ code: 'KeyM', key: 'ь' }))).toEqual({ kind: 'mute' });
	});

	it.each([
		['Digit1', 0],
		['Digit9', 8],
		['Numpad3', 2]
	])('%s запускає трек №%i за порядком', (code, index) => {
		expect(builtinFor(press({ code }))).toEqual({ kind: 'play', index });
	});

	it('літера вбудованої дії не має — вона вільна для треку', () => {
		expect(builtinFor(press({ code: 'KeyQ' }))).toBeNull();
	});
});

describe('коли НЕ реагувати', () => {
	it.each(['ctrlKey', 'altKey', 'metaKey'] as const)('%s вимикає гарячу клавішу', (modifier) => {
		expect(isHotkeyEvent(press({ code: 'Digit1', [modifier]: true }))).toBe(false);
	});

	it('автоповтор від затиснутої клавіші ігнорується', () => {
		// Інакше затиснутий пробіл смикав би паузу десятки разів на секунду.
		expect(isHotkeyEvent(press({ code: 'Space', repeat: true }))).toBe(false);
	});

	it.each([
		['input', document.createElement('input')],
		['textarea', document.createElement('textarea')],
		['select', document.createElement('select')]
	])('набір у %s не є гарячою клавішею', (_name, element) => {
		expect(isHotkeyEvent(press({ code: 'Digit1' }, element))).toBe(false);
	});

	it('набір у редагованому блоці теж', () => {
		const editable = document.createElement('div');
		editable.contentEditable = 'true';
		// jsdom не виводить `isContentEditable` з атрибута — ставимо явно.
		Object.defineProperty(editable, 'isContentEditable', { value: true });
		expect(isHotkeyEvent(press({ code: 'Digit1' }, editable))).toBe(false);
	});

	it('Shift не заважає', () => {
		// На більшості розкладок `+` набирається саме з ним.
		expect(builtinFor(press({ code: 'Equal', shiftKey: true }))).toEqual({
			kind: 'volume',
			delta: VOLUME_STEP
		});
	});
});

describe('які клавіші можна віддати треку', () => {
	it('літери, функційні й розділові — можна', () => {
		for (const code of ['KeyQ', 'KeyZ', 'F5', 'Semicolon', 'Numpad7', 'Digit3']) {
			expect(isAssignable(code)).toBe(true);
		}
	});

	it('зайняті керуванням — не можна', () => {
		/*
		 * Кожна з них уже щось робить, і віддати її треку означає забрати в
		 * людини керування: пробіл — плеєр без паузи, Escape — вікно, яке не
		 * закрити.
		 */
		for (const code of RESERVED_CODES) {
			expect(isAssignable(code)).toBe(false);
		}
	});

	it('жодна вбудована дія не лишилася поза переліком зайнятих', () => {
		/*
		 * Інакше клавішу можна було б віддати треку, і два обробники змагалися б
		 * за одне натискання. Перевіряється не список, а ПОВЕДІНКА: клавіша, яка
		 * має вбудовану дію, мусить бути в переліку.
		 */
		const everyCode = [
			'Space',
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'Minus',
			'Equal',
			'NumpadSubtract',
			'NumpadAdd',
			'KeyM',
			'Digit0',
			'Numpad0'
		];
		for (const code of everyCode) {
			expect(builtinFor(press({ code }))).not.toBeNull();
			expect(isAssignable(code)).toBe(false);
		}
	});
});

describe('keyLabelsFor', () => {
	const track = (id: string, hotkey?: string) => ({ id, hotkey: hotkey ?? null });

	it('без призначень — цифри за порядком', () => {
		/*
		 * Саме цього бракувало: цифри працювали, а в списку біля кожного треку
		 * стояла крапка. Екран казав «клавіші немає» про клавішу, яка працює.
		 */
		const labels = keyLabelsFor([track('a'), track('b'), track('c')]);
		expect(labels).toEqual({ a: '1', b: '2', c: '3' });
	});

	it('цифр за порядком рівно девʼять', () => {
		const many = Array.from({ length: 12 }, (_, index) => track(`t${index}`));
		const labels = keyLabelsFor(many);
		expect(Object.keys(labels)).toHaveLength(HOTKEY_SLOTS);
		expect(labels.t8).toBe('9');
		expect(labels.t9).toBeUndefined();
	});

	it('призначена клавіша НЕ гасить цифри в решти', () => {
		/*
		 * НАЙВАЖЛИВІШЕ ПРАВИЛО ЦЬОГО НАБОРУ. Спершу гасила — і людина, яка дала
		 * одному треку `Q`, лишалася без решти дев'яти. Одна дія забирала те,
		 * чого не чіпала.
		 */
		const labels = keyLabelsFor([track('a'), track('b', 'KeyQ'), track('c')]);
		expect(labels).toEqual({ a: '1', b: 'Q', c: '3' });
	});

	it('цифра, яку забрали собі явно, зникає в того, хто стояв на цьому місці', () => {
		/*
		 * Призначену клавішу питають першою, тож `3` піде до `a`, а не до третього
		 * у списку. Показувати третьому трійку означало б пообіцяти чуже.
		 */
		const labels = keyLabelsFor([track('a', 'Digit3'), track('b'), track('c')]);
		expect(labels).toEqual({ a: '3', b: '2' });
	});
});

describe('labelForCode', () => {
	it.each([
		['KeyQ', 'Q'],
		['Digit7', '7'],
		['Numpad4', 'Num 4'],
		['Semicolon', ';'],
		['F5', 'F5'],
		['NumpadAdd', 'Num +']
	])('%s показується як «%s»', (code, label) => {
		expect(labelForCode(code)).toBe(label);
	});

	it('латинський напис, а не символ розкладки', () => {
		/*
		 * На клавіші `KeyQ` в українській розкладці намальовано «Й», але
		 * латинський напис на ній теж є завжди — а символ розкладки змінився б
		 * разом із нею, і підпис на екрані почав би брехати.
		 */
		expect(labelForCode('KeyQ')).toBe('Q');
	});
});
