// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Оголошення в базу підмінене на весь файл, і це не обхід перевірки.
 *
 * Мережі тут не буде в жодному разі — без емулятора `connect()` падає ще на
 * конфігу. Підміна дає інше: можливість сказати «база ВІДМОВИЛА» й подивитися,
 * що з цього побачить людина за компʼютером.
 */
const net = vi.hoisted(() => ({ denied: false }));

vi.mock('$lib/net/board', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/net/board')>()),
	publishLibrary: async () => {
		if (!net.denied) return;
		throw Object.assign(new Error('permission_denied at /library'), {
			code: 'PERMISSION_DENIED'
		});
	}
}));
import { MemorySource, titleLines } from '$lib/audio/source';
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

describe('назва в рядки', () => {
	it('ділить «Виконавець - Пісня» надвоє', () => {
		expect(titleLines('Бумбокс - Безодня')).toEqual(['Бумбокс', 'Безодня']);
	});

	it('дефіс УСЕРЕДИНІ слова не роздільник', () => {
		/*
		 * Головний випадок. Ділити за кожним дефісом означало б різати «Non-Stop»
		 * і «Happy End» навпіл — тобто ламати саме ті назви, заради читабельності
		 * яких усе й робиться.
		 */
		expect(titleLines('Happy End - Non-Stop')).toEqual(['Happy End', 'Non-Stop']);
	});

	it('ділить лише перший роздільник', () => {
		expect(titleLines('А - Б - В')).toEqual(['А', 'Б - В']);
	});

	it('назва без роздільника лишається одним рядком', () => {
		expect(titleLines('Калина')).toEqual(['Калина']);
	});

	it('довге тире й коротке — обидва роздільники', () => {
		expect(titleLines('Гурт – Пісня')).toEqual(['Гурт', 'Пісня']);
		expect(titleLines('Гурт — Пісня')).toEqual(['Гурт', 'Пісня']);
	});
});

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

describe('підпис клавіші в списку', () => {
	let controller: PlayerController;

	beforeEach(async () => {
		controller = build(withFiles('Автобус.mp3', 'Криниця.mp3', 'Ялина.mp3'));
		await controller.rescan();
	});

	it('без призначень — стоять цифри за порядком', () => {
		/*
		 * Це не про красу підпису, а про правду: цифри в цьому стані СПРАЦЬОВУЮТЬ,
		 * а в списку біля кожного треку стояла крапка. Екран заперечував клавішу,
		 * яка є.
		 */
		const [first, second, third] = controller.entries;
		expect(controller.keyLabels).toEqual({
			[first.id]: '1',
			[second.id]: '2',
			[third.id]: '3'
		});
	});

	it('призначена клавіша не чіпає цифр у решти', () => {
		const [first, second, third] = controller.entries;
		controller.setHotkey(second.id, 'KeyQ');

		expect(controller.keyLabels).toEqual({
			[first.id]: '1',
			[second.id]: 'Q',
			[third.id]: '3'
		});
	});

	it('цифра лишається робочою після того, як треку дали свою клавішу', () => {
		/*
		 * Перевіряється ПОВЕДІНКА, а не підпис: `2` мусить і далі означати другий
		 * трек списку. Саме це зникало — призначив одну клавішу й лишився без
		 * цифр.
		 */
		const [first, second] = controller.entries;
		controller.setHotkey(first.id, 'KeyQ');

		const pressed = controller.resolveKey(
			new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true })
		);
		expect(pressed).toEqual({ kind: 'play', index: 1 });
		expect(controller.visible[1].id).toBe(second.id);
	});

	it('прихований зовсім трек підпису не має — і не зсуває чужі номери', () => {
		const [first, second, third] = controller.entries;
		controller.setVisibility(second.id, 'none');

		expect(controller.keyLabels[second.id]).toBeUndefined();
		expect(controller.keyLabels[first.id]).toBe('1');
		expect(controller.keyLabels[third.id]).toBe('2');
	});

	it('«лише тут» СВОЮ цифру зберігає — і чужі не зсуває', () => {
		/*
		 * У цьому вся різниця між двома видами «приховано»: від пульта ховають
		 * трек, який запускають саме з цього комп'ютера, тож клавіша мусить
		 * лишитися на місці.
		 */
		const [first, second, third] = controller.entries;
		controller.setVisibility(second.id, 'player');

		expect(controller.keyLabels[second.id]).toBe('2');
		expect(controller.keyLabels[first.id]).toBe('1');
		expect(controller.keyLabels[third.id]).toBe('3');
	});
});

describe('проба звуку', () => {
	it('після озброєння плеєр НЕ вважає, що грає', async () => {
		/*
		 * Проба вмикає тихий файл і одразу ставить на паузу, а тоді знімає
		 * джерело через `load()`. За специфікацією `load()` викидає з черги ще не
		 * доставлені події елемента — і `pause` туди не доїжджала. Виходило, що
		 * `play` порахували, а `pause` ні: над написом «Нічого не грає» світилася
		 * зелена «Пауза».
		 *
		 * Підставка відтворює саме це: `play` подію шле, `pause` — ні.
		 */
		const media = window.HTMLMediaElement.prototype;
		const play = media.play;
		const pause = media.pause;
		media.play = function (this: HTMLMediaElement) {
			this.dispatchEvent(new Event('play'));
			return Promise.resolve();
		};
		media.pause = function () {};

		try {
			const controller = build(withFiles('Автобус.mp3'));
			await controller.rescan();
			expect(await controller.engine.arm()).toBe(true);

			expect(controller.engine.playing).toBe(false);
			expect(controller.engine.trackId).toBeNull();
		} finally {
			media.play = play;
			media.pause = pause;
		}
	});
});

describe('керування відтворенням', () => {
	/**
	 * Підставний звук: jsdom не вміє відтворювати, а нам потрібні лише прапорці.
	 * `play` шле свою подію, як це робить браузер; `pause` мовчить — див.
	 * пояснення в тесті проби звуку.
	 */
	const stubMedia = () => {
		const media = window.HTMLMediaElement.prototype;
		const play = media.play;
		const pause = media.pause;
		media.play = function (this: HTMLMediaElement) {
			this.dispatchEvent(new Event('play'));
			return Promise.resolve();
		};
		media.pause = function () {};
		return () => {
			media.play = play;
			media.pause = pause;
		};
	};

	const started = async () => {
		const controller = build(withFiles('Автобус.mp3', 'Криниця.mp3', 'Ялина.mp3'));
		await controller.rescan();
		await controller.playLocal(controller.entries[1].id);
		return controller;
	};

	it('пауза знімає «грає» ОДРАЗУ, не чекаючи кінця згасання', async () => {
		/*
		 * Звук гасне секунду, і весь цей час кнопка лишалася зеленою «Пауза»:
		 * людина тиснула, нічого не мінялося — і тиснула вдруге.
		 */
		const restore = stubMedia();
		try {
			const controller = await started();
			expect(controller.engine.playing).toBe(true);

			controller.engine.pause();
			expect(controller.engine.playing).toBe(false);
		} finally {
			restore();
		}
	});

	it('стоп лишає трек обраним', async () => {
		/*
		 * Доти «стоп» скидав і сам трек: щоб заграти те саме ще раз, доводилося
		 * знову шукати його в списку. У залі «стоп» тиснуть між номерами, а не
		 * наприкінці.
		 */
		const restore = stubMedia();
		try {
			const controller = await started();
			const chosen = controller.entries[1].id;

			controller.engine.stop();

			expect(controller.engine.playing).toBe(false);
			expect(controller.engine.trackId).toBe(chosen);
		} finally {
			restore();
		}
	});

	it('натискання на той САМИЙ трек ставить на паузу, а не починає спочатку', async () => {
		/*
		 * Людина тикає в трек, що вже грає, щоб його спинити. Доти він стрибав на
		 * нуль і грав далі — у залі це чути.
		 */
		const restore = stubMedia();
		try {
			const controller = await started();
			const playingId = controller.entries[1].id;
			expect(controller.engine.playing).toBe(true);

			await controller.toggleLocal(playingId);
			expect(controller.engine.playing).toBe(false);
			expect(controller.engine.trackId).toBe(playingId);

			await controller.toggleLocal(playingId);
			expect(controller.engine.playing).toBe(true);
		} finally {
			restore();
		}
	});

	it('натискання на ІНШИЙ трек запускає його', async () => {
		const restore = stubMedia();
		try {
			const controller = await started();
			const other = controller.entries[2].id;

			await controller.toggleLocal(other);
			expect(controller.engine.trackId).toBe(other);
			expect(controller.engine.playing).toBe(true);
		} finally {
			restore();
		}
	});

	it('«попередній» і «наступний» ходять по колу', async () => {
		const restore = stubMedia();
		try {
			const controller = await started();
			const [first, second, third] = controller.entries.map((entry) => entry.id);

			expect(controller.engine.trackId).toBe(second);
			expect(controller.engine.prevTrackId()).toBe(first);
			expect(controller.engine.nextTrackId()).toBe(third);

			await controller.playLocal(first);
			// З першого назад — на останній: саме там список закінчується, якщо йти
			// проти течії.
			expect(controller.engine.prevTrackId()).toBe(third);
		} finally {
			restore();
		}
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

describe('кому показувати трек', () => {
	const board = async () => {
		const controller = build(withFiles('Автобус.mp3', 'Криниця.mp3'));
		await controller.rescan();
		return controller;
	};

	it('прихований зовсім зникає звідусіль', async () => {
		const controller = await board();
		controller.setVisibility(controller.entries[0].id, 'none');

		expect(controller.hiddenCount).toBe(1);
		expect(controller.visible.map((entry) => entry.title)).toEqual(['Криниця']);
		expect(controller.forRemote.map((entry) => entry.title)).toEqual(['Криниця']);
		expect(controller.hiddenTracks.map((entry) => entry.title)).toEqual(['Автобус']);
	});

	it('«лише тут» лишається у списку приймача й зникає лише з пульта', async () => {
		const controller = await board();
		controller.setVisibility(controller.entries[0].id, 'player');

		expect(controller.visible.map((entry) => entry.title)).toEqual(['Автобус', 'Криниця']);
		expect(controller.forRemote.map((entry) => entry.title)).toEqual(['Криниця']);
		expect(controller.hiddenCount).toBe(0);
		expect(controller.playerOnlyCount).toBe(1);
	});

	it('рішення переживає перечитування папки', async () => {
		const source = withFiles('Автобус.mp3', 'Криниця.mp3');
		const first = build(source);
		await first.rescan();
		first.setVisibility(first.entries[0].id, 'player');

		// Записується відкладено — чекаємо, як це робить сама сторінка.
		await new Promise((resolve) => setTimeout(resolve, 700));

		const second = build(source);
		await second.rescan();
		expect(second.entries[0].visibility).toBe('player');
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

describe('відмова бази в записі списку', () => {
	/**
	 * ЦЕ ТРЕТЯ ПОЯВА ОДНІЄЇ Й ТІЄЇ САМОЇ ПОМИЛКИ, і саме тому на неї тест.
	 *
	 * Правило `$other: false` відкидає незнане поле разом з УСІМ записом. Отже
	 * поле, додане в коді раніше, ніж у правилах, зупиняє бібліотеку цілком —
	 * мовчки, бо відмова прилітала в `void this.persist()` і зникала. Симптом
	 * зʼявлявся за два екрани звідси: пульт писав «на плеєрі ще не обрано папку»,
	 * хоч папка обрана й список на екрані.
	 */
	it('плеєр каже про відмову, а не мовчить', async () => {
		const controller = build(withFiles('Гонг.mp3'));
		controller.owned = true;
		Reflect.set(controller, 'ownershipKnown', true);

		net.denied = true;
		await Reflect.get(controller, 'publish').call(controller);
		expect(controller.libraryTrouble).toBe('player.libraryDenied');

		// І зникає, щойно запис пройшов: скарга, яка лишається назавжди, — це не
		// попередження, а декорація.
		net.denied = false;
		await Reflect.get(controller, 'publish').call(controller);
		expect(controller.libraryTrouble).toBeNull();
	});
});
