// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MemorySource } from '$lib/audio/source';
import { PlayerController } from './controller.svelte';
import type { ActiveBoard } from '$lib/board/session.svelte';

/**
 * ПОРЯДОК, КЛАВІШІ Й КОЛЬОРИ — без мережі й без діалогу вибору теки.
 *
 * Саме заради цього джерело сховане за інтерфейсом: справжнє відкриває вікно
 * браузера, у яке не заходить жоден автотест. Підставне тримає той самий
 * контракт, включно з файлом налаштувань, тож перевіряється рівно та логіка,
 * якою піде застосунок.
 *
 * `owned = false` вимикає оголошення в базу: ці правила про суміш «файли теки
 * плюс рішення людини», і мережі для них не треба.
 */
const board: ActiveBoard = { key: 'k'.repeat(32), id: 'ZAL2', name: 'Зал 2', role: 'player' };

const withFiles = (...names: string[]) => {
	const source = new MemorySource();
	for (const name of names) source.add(name, 'x');
	return source;
};

const build = (source: MemorySource) => {
	const controller = new PlayerController(board, source);
	controller.owned = false;
	return controller;
};

const titles = (controller: PlayerController) => controller.entries.map((entry) => entry.title);

describe('порядок треків', () => {
	it('без налаштувань — за абеткою', async () => {
		const controller = build(withFiles('Ялина.mp3', 'Автобус.mp3', 'Криниця.mp3'));
		await controller.rescan();
		expect(titles(controller)).toEqual(['Автобус', 'Криниця', 'Ялина']);
	});

	it('порядок із файлу налаштувань перемагає абетку', async () => {
		const source = withFiles('Ялина.mp3', 'Автобус.mp3', 'Криниця.mp3');
		await source.writeConfig({
			schema: 1,
			tracks: [{ path: 'Ялина.mp3' }, { path: 'Криниця.mp3' }, { path: 'Автобус.mp3' }]
		});

		const controller = build(source);
		await controller.rescan();
		expect(titles(controller)).toEqual(['Ялина', 'Криниця', 'Автобус']);
	});

	it('щойно докинутий файл стає в ХВІСТ, нічого не переставляючи', async () => {
		/*
		 * Інакше кожен новий трек перетасовував би те, що людина вже розклала, —
		 * і розкладати довелося б після кожного поповнення теки.
		 */
		const source = withFiles('Ялина.mp3', 'Автобус.mp3');
		await source.writeConfig({
			schema: 1,
			tracks: [{ path: 'Ялина.mp3' }, { path: 'Автобус.mp3' }]
		});
		source.add('Нове.mp3', 'x');

		const controller = build(source);
		await controller.rescan();
		expect(titles(controller)).toEqual(['Ялина', 'Автобус', 'Нове']);
	});

	it('зниклий файл випадає зі списку, а не лишається рядком у порожнечу', async () => {
		const source = withFiles('Ялина.mp3');
		await source.writeConfig({
			schema: 1,
			tracks: [{ path: 'Ялина.mp3' }, { path: 'Зникле.mp3' }]
		});

		const controller = build(source);
		await controller.rescan();
		expect(titles(controller)).toEqual(['Ялина']);
	});

	it('move переставляє сусідів і не виходить за межі', async () => {
		const controller = build(withFiles('Автобус.mp3', 'Криниця.mp3', 'Ялина.mp3'));
		await controller.rescan();

		controller.move(controller.entries[2].id, -1);
		expect(titles(controller)).toEqual(['Автобус', 'Ялина', 'Криниця']);

		// Перший угору нікуди не рухається.
		controller.move(controller.entries[0].id, -1);
		expect(titles(controller)).toEqual(['Автобус', 'Ялина', 'Криниця']);
	});
});

describe('гарячі клавіші треків', () => {
	let controller: PlayerController;

	beforeEach(async () => {
		controller = build(withFiles('Автобус.mp3', 'Криниця.mp3', 'Ялина.mp3'));
		await controller.rescan();
	});

	it('клавіша УНІКАЛЬНА: попередній власник її втрачає', async () => {
		/*
		 * Альтернатива — «зайнято, оберіть іншу» — змушувала б людину спершу
		 * звільняти клавішу, тобто робити два кроки замість одного.
		 */
		const [first, second] = controller.entries;
		controller.setHotkey(first.id, 3);
		controller.setHotkey(second.id, 3);

		expect(controller.entries.find((entry) => entry.id === first.id)?.hotkey).toBeNull();
		expect(controller.entries.find((entry) => entry.id === second.id)?.hotkey).toBe(3);
	});

	it('поза межами 1…9 не приймається', () => {
		const [first] = controller.entries;
		controller.setHotkey(first.id, 0);
		controller.setHotkey(first.id, 10);
		expect(controller.entries[0].hotkey).toBeNull();
	});

	it('знімається нулем', () => {
		const [first] = controller.entries;
		controller.setHotkey(first.id, 5);
		controller.setHotkey(first.id, null);
		expect(controller.entries[0].hotkey).toBeNull();
	});
});

describe('приховані треки', () => {
	it('не потрапляють у список для пульта й для клавіш', async () => {
		const controller = build(withFiles('Автобус.mp3', 'Криниця.mp3'));
		await controller.rescan();

		controller.toggleHidden(controller.entries[0].id);

		expect(controller.hiddenCount).toBe(1);
		expect(controller.visible.map((entry) => entry.title)).toEqual(['Криниця']);
	});
});

describe('файл налаштувань', () => {
	it('переживає перечитування теки', async () => {
		const source = withFiles('Автобус.mp3', 'Криниця.mp3');
		const first = build(source);
		await first.rescan();
		first.setHotkey(first.entries[1].id, 7);
		first.setColor(first.entries[1].id, 'azure');
		first.move(first.entries[1].id, -1);

		// Записується відкладено — чекаємо, як це робить сама сторінка.
		await new Promise((resolve) => setTimeout(resolve, 700));

		// Друге завантаження сторінки: новий контролер, та сама тека.
		const second = build(source);
		await second.rescan();

		expect(second.entries.map((entry) => entry.title)).toEqual(['Криниця', 'Автобус']);
		expect(second.entries[0].hotkey).toBe(7);
		expect(second.entries[0].color).toBe('azure');
	});
});
