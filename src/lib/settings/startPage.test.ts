import { describe, expect, it } from 'vitest';
import type { SavedBoard } from '$lib/board/myBoards';
import { decideStart, isStartPage, START_PAGES } from './startPage.svelte';

/**
 * РІШЕННЯ ПРО ЗАПУСК — чиста функція, і саме тому кожну гілку видно тут.
 *
 * Найдорожча з них — «плеєр без збереженої дошки»: сторінка плеєра без дошки
 * сама відправляє назад, і якби корінь відправляв на неї беззастережно, то
 * вийшла б петля, яку в браузері видно як застосунок, що не відкривається.
 */
const board = (role: 'player' | 'remote', at: number, id: string = role): SavedBoard => ({
	key: `${id}-${at}`,
	id,
	name: '',
	role,
	at
});

describe('рішення про запуск', () => {
	it('меню — це меню', () => {
		expect(decideStart('menu', [], false)).toEqual({ kind: 'menu' });
	});

	it('підключення — просто сторінка, їй нічого не треба', () => {
		expect(decideStart('connect', [], false)).toEqual({ kind: 'page', page: 'connect' });
	});

	it('створення без сталої пари — форма', () => {
		expect(decideStart('create', [], false)).toEqual({ kind: 'page', page: 'create' });
	});

	it('створення зі сталою парою — одразу та сама дошка', () => {
		/*
		 * Зі сталою парою кнопка «Створити» однаково відкриває ТУ САМУ дошку:
		 * адреса виводиться з пари. Тиснути її нема заради чого.
		 */
		expect(decideStart('create', [], true)).toEqual({ kind: 'createFixed' });
	});

	it('плеєр бере останню збережену дошку САМЕ ЦІЄЇ ролі', () => {
		const newer = board('remote', 300);
		const older = board('player', 200);
		expect(decideStart('player', [newer, older], false)).toEqual({ kind: 'board', board: older });
	});

	it('пульт так само', () => {
		const newer = board('player', 300);
		const older = board('remote', 200);
		expect(decideStart('remote', [newer, older], false)).toEqual({ kind: 'board', board: older });
	});

	it('порядок списку вирішує, яка з двох дощок однієї ролі', () => {
		// `listBoards()` уже відсортований за «коли востаннє відкривали».
		const first = board('player', 300, 'A');
		const second = board('player', 200, 'B');
		expect(decideStart('player', [first, second], false)).toEqual({
			kind: 'board',
			board: first
		});
	});

	it('без збереженої дошки — меню, і меню знає чому', () => {
		expect(decideStart('player', [], false)).toEqual({
			kind: 'menu',
			notice: 'noPlayerBoard'
		});
		expect(decideStart('remote', [board('player', 1)], false)).toEqual({
			kind: 'menu',
			notice: 'noRemoteBoard'
		});
	});

	it('стала пара не рятує вибір «плеєр» — це інша дія', () => {
		// Спокуса «є пара, отже створимо» тут хибна: людина просила ВІДКРИТИ
		// останню дошку, а не створити нову.
		expect(decideStart('player', [], true)).toEqual({
			kind: 'menu',
			notice: 'noPlayerBoard'
		});
	});
});

describe('названа дошка', () => {
	const pinned = { id: 'ZAL2', password: 'МУШЛЯ-ОРБІТА-КАВА-7788' };

	it('«моя дошка» з названою парою заходить у неї, а не в останню', () => {
		/*
		 * Пару вказали руками саме для цього: комп'ютер у залі щовечора той самий,
		 * і історія відкриттів тут нічого не вирішує.
		 */
		expect(decideStart('player', [board('player', 900)], false, 'fixed', pinned)).toEqual({
			kind: 'fixedBoard',
			role: 'player',
			id: 'ZAL2',
			password: 'МУШЛЯ-ОРБІТА-КАВА-7788'
		});
	});

	it('«віддалена дошка» так само', () => {
		expect(decideStart('remote', [], false, 'fixed', pinned)).toEqual({
			kind: 'fixedBoard',
			role: 'remote',
			id: 'ZAL2',
			password: 'МУШЛЯ-ОРБІТА-КАВА-7788'
		});
	});

	it('половина пари не рахується — повертаємось до останньої', () => {
		// Адреса виводиться з пари цілком, тож половина не дає нічого.
		const half = { id: 'ZAL2', password: '' };
		const last = board('player', 900);
		expect(decideStart('player', [last], false, 'fixed', half)).toEqual({
			kind: 'board',
			board: last
		});
	});

	it('«підключення» цього вибору не має взагалі', () => {
		// Це форма, і вибирати дошку — її власна робота.
		expect(decideStart('connect', [], false, 'fixed', pinned)).toEqual({
			kind: 'page',
			page: 'connect'
		});
	});
});

describe('розбір збереженого значення', () => {
	it('усі свої значення приймаються', () => {
		for (const page of START_PAGES) expect(isStartPage(page)).toBe(true);
	});

	it('чуже значення відкидається', () => {
		// Зіпсуте сховище або чужа версія — меню безпечне в обох випадках.
		for (const value of ['', 'home', 'PLAYER', null, 7, undefined]) {
			expect(isStartPage(value)).toBe(false);
		}
	});
});
