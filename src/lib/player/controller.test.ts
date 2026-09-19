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

	it('клавіша УНІКАЛЬНА: попередній власник її втрачає', () => {
		/*
		 * Альтернатива — «зайнято, оберіть іншу» — змушувала б людину спершу
		 * звільняти клавішу, тобто робити два кроки замість одного.
		 */
		const [first, second] = controller.entries;
		controller.setHotkey(first.id, 'KeyQ');
		controller.setHotkey(second.id, 'KeyQ');

		expect(controller.entries.find((entry) => entry.id === first.id)?.hotkey).toBeNull();
		expect(controller.entries.find((entry) => entry.id === second.id)?.hotkey).toBe('KeyQ');
	});

	it('будь-яка вільна клавіша приймається, не лише цифра', () => {
		const [first] = controller.entries;
		controller.setHotkey(first.id, 'F5');
		expect(controller.entries[0].hotkey).toBe('F5');
	});

	it('зайнята керуванням не приймається', () => {
		// Пробіл, відданий треку, — це плеєр без паузи.
		const [first] = controller.entries;
		controller.setHotkey(first.id, 'Space');
		controller.setHotkey(first.id, 'ArrowLeft');
		expect(controller.entries[0].hotkey).toBeNull();
	});

	it('знімається порожнім значенням', () => {
		const [first] = controller.entries;
		controller.setHotkey(first.id, 'KeyZ');
		controller.setHotkey(first.id, null);
		expect(controller.entries[0].hotkey).toBeNull();
	});
});

describe('власний підпис треку', () => {
	it('замінює імʼя файлу, не чіпаючи самого файлу', async () => {
		const source = withFiles('Автобус.mp3');
		const controller = build(source);
		await controller.rescan();

		controller.setTitle(controller.entries[0].id, '  Вихід на поклони  ');
		expect(controller.entries[0].title).toBe('Вихід на поклони');
		// Імʼя файлу лишається тим самим — застосунок нічого не перейменовує.
		expect(controller.entries[0].fileName).toBe('Автобус');
		expect(controller.entries[0].path).toBe('Автобус.mp3');
	});

	it('порожній підпис повертає імʼя файлу', async () => {
		const controller = build(withFiles('Автобус.mp3'));
		await controller.rescan();

		controller.setTitle(controller.entries[0].id, 'Своє');
		controller.setTitle(controller.entries[0].id, '   ');
		expect(controller.entries[0].title).toBe('Автобус');
	});

	it('переживає перечитування теки', async () => {
		const source = withFiles('Автобус.mp3');
		const first = build(source);
		await first.rescan();
		first.setTitle(first.entries[0].id, 'Вихід на поклони');
		await new Promise((resolve) => setTimeout(resolve, 700));

		const second = build(source);
		await second.rescan();
		expect(second.entries[0].title).toBe('Вихід на поклони');
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
		first.setHotkey(first.entries[1].id, 'KeyP');
		first.setColor(first.entries[1].id, 'azure');
		first.move(first.entries[1].id, -1);

		// Записується відкладено — чекаємо, як це робить сама сторінка.
		await new Promise((resolve) => setTimeout(resolve, 700));

		// Друге завантаження сторінки: новий контролер, та сама тека.
		const second = build(source);
		await second.rescan();

		expect(second.entries.map((entry) => entry.title)).toEqual(['Криниця', 'Автобус']);
		expect(second.entries[0].hotkey).toBe('KeyP');
		expect(second.entries[0].color).toBe('azure');
	});
});
