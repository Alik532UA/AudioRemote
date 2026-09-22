// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { attentionState } from './attention.svelte';
import { colorOf } from '$lib/config/trackColors';
import { PREFIX } from './storage';
import { memoryStorage } from '../../gates/storage';

describe('attentionState — привертання уваги', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('localStorage', memoryStorage());
		attentionState.choose('min');
		attentionState.paint(null);
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('початковий стан: тихий режим min та дефолтний колір null (протилежна тема)', () => {
		attentionState.init();
		expect(attentionState.mode).toBe('min');
		expect(attentionState.color).toBeNull();
		expect(attentionState.lit).toBeNull();
	});

	it('зберігає та відновлює вибір режиму', () => {
		attentionState.choose('head');
		expect(attentionState.mode).toBe('head');
		expect(window.localStorage.getItem(`${PREFIX}attention.mode`)).toBe('head');

		attentionState.choose('page');
		expect(attentionState.mode).toBe('page');
		expect(window.localStorage.getItem(`${PREFIX}attention.mode`)).toBe('page');
	});

	it('зберігає та відновлює вибір кольору, включно з дефолтом (none)', () => {
		attentionState.paint('emerald');
		expect(attentionState.color).toBe('emerald');
		expect(window.localStorage.getItem(`${PREFIX}attention.color`)).toBe('emerald');

		attentionState.paint(null);
		expect(attentionState.color).toBeNull();
		expect(window.localStorage.getItem(`${PREFIX}attention.color`)).toBe('none');

		attentionState.init();
		expect(attentionState.color).toBeNull();

		attentionState.paint('amber');
		attentionState.init();
		expect(attentionState.color).toBe('amber');
	});

	it('відкидає невалідні назви кольорів', () => {
		attentionState.paint('emerald');
		attentionState.paint('not-a-real-color');
		expect(attentionState.color).toBe('emerald');
	});

	it('у режимі min метод ask() не вмикає спалах шапки чи тла', () => {
		attentionState.choose('min');
		attentionState.paint('ruby');
		attentionState.ask('sky');
		expect(attentionState.lit).toBeNull();
		expect(attentionState.activeHex).toBeNull();
	});

	it('у режимі head спалахує шапка: пріоритет sourceColor > attentionState.color > head-flip', () => {
		attentionState.choose('head');

		// 1. sourceColor має найвищий пріоритет
		attentionState.paint('ruby');
		attentionState.ask('emerald');
		expect(attentionState.lit).toBe('head');
		expect(attentionState.activeHex).toBe(colorOf('emerald'));

		// 2. якщо sourceColor немає, береться колір налаштування уваги
		attentionState.ask(null);
		expect(attentionState.lit).toBe('head');
		expect(attentionState.activeHex).toBe(colorOf('ruby'));

		// 3. якщо і там null (дефолт), спалахує протилежна тема head-flip
		attentionState.paint(null);
		attentionState.ask(null);
		expect(attentionState.lit).toBe('head-flip');
		expect(attentionState.activeHex).toBeNull();
	});

	it('у режимі page спалахує тло: пріоритет sourceColor > attentionState.color > flip', () => {
		attentionState.choose('page');

		// 1. sourceColor
		attentionState.paint('amber');
		attentionState.ask('violet');
		expect(attentionState.lit).toBe('page');
		expect(attentionState.activeHex).toBe(colorOf('violet'));

		// 2. attentionState.color
		attentionState.ask(null);
		expect(attentionState.lit).toBe('page');
		expect(attentionState.activeHex).toBe(colorOf('amber'));

		// 3. flip (дефолт протилежної теми)
		attentionState.paint(null);
		attentionState.ask(null);
		expect(attentionState.lit).toBe('flip');
		expect(attentionState.activeHex).toBeNull();
	});

	it('shout() завжди викликає спалах на весь екран: з власним кольором або flip', () => {
		attentionState.choose('min');
		attentionState.shout('emerald');
		expect(attentionState.lit).toBe('page');
		expect(attentionState.activeHex).toBe(colorOf('emerald'));

		attentionState.shout(null);
		expect(attentionState.lit).toBe('flip');
		expect(attentionState.activeHex).toBeNull();
	});

	it('спалах гасне через 1000 мс', () => {
		attentionState.choose('head');
		attentionState.ask('coral');
		expect(attentionState.lit).toBe('head');

		vi.advanceTimersByTime(999);
		expect(attentionState.lit).toBe('head');

		vi.advanceTimersByTime(1);
		expect(attentionState.lit).toBeNull();
		expect(attentionState.activeHex).toBeNull();
	});

	it('повторне прохання подовжує спалах, а не створює подвійне миготіння', () => {
		attentionState.choose('head');
		attentionState.ask('coral');
		expect(attentionState.lit).toBe('head');

		vi.advanceTimersByTime(600);
		expect(attentionState.lit).toBe('head');

		// Повторне прохання на 600 мс — продовжує ще на 1000 мс від цього моменту
		attentionState.ask('coral');

		vi.advanceTimersByTime(600);
		expect(attentionState.lit).toBe('head');

		vi.advanceTimersByTime(400);
		expect(attentionState.lit).toBeNull();
	});
});
