// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hotkeyFor, hotkeyLabel, HOTKEY_SLOTS, VOLUME_STEP } from './hotkeys';

/**
 * Події збираються вручну: `code` тут головне поле, і саме його легко забути
 * поставити, якщо покластися на бібліотеку, що вміє «натиснути клавішу».
 */
const press = (init: Partial<KeyboardEvent> & { code: string }, target?: HTMLElement) => {
	const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
	if (target) Object.defineProperty(event, 'target', { value: target });
	return event;
};

describe('hotkeyFor: треки', () => {
	it.each([
		['Digit1', 0],
		['Digit5', 4],
		['Digit9', 8],
		['Numpad1', 0],
		['Numpad9', 8]
	])('%s запускає трек №%i', (code, index) => {
		expect(hotkeyFor(press({ code }))).toEqual({ kind: 'play', index });
	});

	it.each(['Digit0', 'Numpad0'])('%s ЗУПИНЯЄ, а не запускає десятий', (code) => {
		/*
		 * Зупинка потрібна частіше за десятий трек і потрібна терміново: коли в
		 * залі грає не те, рука має лягти на клавішу, не рахуючи. Нуль скраю ряду
		 * намацується наосліп.
		 */
		expect(hotkeyFor(press({ code }))).toEqual({ kind: 'stop' });
	});

	it('дев’ятий трек — останній, якому дісталася клавіша', () => {
		expect(HOTKEY_SLOTS).toBe(9);
		expect(hotkeyFor(press({ code: 'Digit9' }))).toEqual({
			kind: 'play',
			index: HOTKEY_SLOTS - 1
		});
	});
});

describe('hotkeyFor: гучність і тиша', () => {
	it.each([
		['Minus', -VOLUME_STEP],
		['NumpadSubtract', -VOLUME_STEP],
		['Equal', VOLUME_STEP],
		['NumpadAdd', VOLUME_STEP]
	])('%s міняє гучність на %i', (code, delta) => {
		expect(hotkeyFor(press({ code }))).toEqual({ kind: 'volume', delta });
	});

	it('Shift не заважає плюсу', () => {
		// На більшості розкладок `+` набирається саме з Shift.
		expect(hotkeyFor(press({ code: 'Equal', shiftKey: true }))).toEqual({
			kind: 'volume',
			delta: VOLUME_STEP
		});
	});

	it('KeyM — тиша', () => {
		expect(hotkeyFor(press({ code: 'KeyM' }))).toEqual({ kind: 'mute' });
	});

	it('українська розкладка не ламає нічого', () => {
		/*
		 * НАЙВАЖЛИВІШИЙ ВИПАДОК ФАЙЛУ. У школі розкладка українська, і фізична
		 * клавіша `m` дає символ `ь`. Перевірка по `event.key` не спрацювала б
		 * саме там, де цим користуються, — і виглядало б це як «гарячі клавіші
		 * не працюють на моєму комп'ютері».
		 */
		expect(hotkeyFor(press({ code: 'KeyM', key: 'ь' }))).toEqual({ kind: 'mute' });
	});
});

describe('hotkeyFor: коли НЕ реагувати', () => {
	it.each(['ctrlKey', 'altKey', 'metaKey'] as const)('%s вимикає гарячу клавішу', (modifier) => {
		// За цими сполученнями стоять команди браузера й системи.
		expect(hotkeyFor(press({ code: 'Digit1', [modifier]: true }))).toBeNull();
	});

	it('автоповтор від затиснутої клавіші ігнорується', () => {
		// Інакше затиснута «1» перезапускала б трек десятки разів на секунду.
		expect(hotkeyFor(press({ code: 'Digit1', repeat: true }))).toBeNull();
	});

	it.each([
		['input', document.createElement('input')],
		['textarea', document.createElement('textarea')],
		['select', document.createElement('select')]
	])('цифра в %s не запускає трек', (_name, element) => {
		expect(hotkeyFor(press({ code: 'Digit1' }, element))).toBeNull();
	});

	it('цифра в редагованому блоці не запускає трек', () => {
		const editable = document.createElement('div');
		editable.contentEditable = 'true';
		// jsdom не виводить `isContentEditable` з атрибута — ставимо явно.
		Object.defineProperty(editable, 'isContentEditable', { value: true });
		expect(hotkeyFor(press({ code: 'Digit1' }, editable))).toBeNull();
	});

	it('стороння клавіша нічого не означає', () => {
		expect(hotkeyFor(press({ code: 'KeyQ' }))).toBeNull();
	});
});

describe('hotkeyLabel', () => {
	it('перші девʼять — свої цифри, далі клавіші немає', () => {
		expect(hotkeyLabel(0)).toBe('1');
		expect(hotkeyLabel(8)).toBe('9');
		expect(hotkeyLabel(9)).toBeNull();
	});

	it('для решти клавіші немає', () => {
		expect(hotkeyLabel(HOTKEY_SLOTS)).toBeNull();
		expect(hotkeyLabel(-1)).toBeNull();
	});

	it('підпис збігається з тим, що повертає сама клавіша', () => {
		/*
		 * Два боки однієї домовленості: що намальовано на екрані й що станеться
		 * від натискання. Розійтися вони можуть тихо — саме тому звіряються тут.
		 */
		for (let index = 0; index < HOTKEY_SLOTS; index++) {
			const label = hotkeyLabel(index);
			expect(label).not.toBeNull();
			const action = hotkeyFor(press({ code: `Digit${label}` }));
			expect(action).toEqual({ kind: 'play', index });
		}
	});
});
