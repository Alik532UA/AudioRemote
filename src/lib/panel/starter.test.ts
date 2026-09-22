// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { starterPanel } from './starter';
import { fits, sizeOf } from './layout';
import { PANEL_COLS, PANEL_ROWS } from '$lib/net/panelTypes';

/**
 * ТИПОВА ПАНЕЛЬ МУСИТЬ ВМІЩАТИСЯ В ДОШКУ, НА ЯКУ ЇЇ КЛАДУТЬ.
 *
 * Пресет — це єдине місце, де розкладку пишуть РУКАМИ: номери комірок,
 * скільки рядів займає віджет, чи не наступає він на сусіда. Складальник
 * такого не дозволить — він питає `fits()` на кожен рух, — а пресет лягає
 * повз нього, одним записом.
 *
 * Помилка тут тиха вдвічі. Віджет, що не вміщається, не кидає нічого: сітка
 * просто малює його поверх сусіда або зрізає. А побачить це лише той, хто
 * натисне «скласти типову панель» на порожній дошці, тобто найперший
 * відвідувач — і рівно на тому екрані, який мав пояснити, що тут узагалі
 * робити.
 *
 * ## Чому перевіряється ЗМІСТ, а не знімок
 *
 * Знімок («має бути точно такий JSON») червонів би від кожної правки підпису й
 * тому був би не гейтом, а нагадуванням його оновити. Тут питаються рішення,
 * які пресет і робить: шкала, а не три кнопки; по кольору на джерело; окрема
 * важлива дія; вільний ряд унизу.
 */

const panel = starterPanel();
const cells = Object.entries(panel.cells);

describe('типова панель', () => {
	it('уміщається в дошку й не накладається сама на себе', () => {
		for (const [at, cell] of cells) {
			expect(fits(panel, at, sizeOf(cell), at), `комірка ${at} не стає на своє місце`).toBe(true);
		}
	});

	it('усі комірки — в межах сітки', () => {
		const last = PANEL_COLS * PANEL_ROWS - 1;
		for (const [at] of cells) {
			expect(Number(at), `комірка ${at} поза сіткою`).toBeLessThanOrEqual(last);
		}
	});

	/*
	 * ШКАЛА, А НЕ ТРИ КНОПКИ. «Трохи гучніше» й «гучніше» — різні прохання, і
	 * людина в залі розрізняє їх упевнено; панель, яка вміє лише «гучніше», на
	 * це питання відповісти не дає.
	 */
	it('у джерел звуку п\u2019ять сходинок гучності', () => {
		const scales = cells.filter(([, cell]) => (cell.buttons?.length ?? 0) > 1);
		expect(scales.length, 'джерел звуку не двоє').toBe(2);
		for (const [at, cell] of scales) {
			expect(cell.buttons?.length, `у комірки ${at} не п'ять сходинок`).toBe(5);
			expect(cell.color, `комірка ${at} без кольору`).toBeTruthy();
		}
		// Кольори РІЗНІ: однакові не відповідають ні на що.
		expect(new Set(scales.map(([, cell]) => cell.color)).size).toBe(2);
	});

	it('є рівно одна важлива дія, і вона одна кнопка', () => {
		const loud = cells.filter(([, cell]) => cell.important);
		expect(loud.length, 'важливих дій не одна').toBe(1);
		expect(loud[0][1].buttons?.length).toBe(1);
	});

	/*
	 * ВІЛЬНИЙ РЯД УНИЗУ — навмисно: панель починають доповнювати, а не
	 * розбирати, і місце під це має бути видно одразу.
	 */
	it('нижній ряд лишається порожнім', () => {
		const first = PANEL_COLS * (PANEL_ROWS - 1);
		const busy = cells.filter(([at, cell]) => {
			const { rows } = sizeOf(cell);
			const row = Math.floor(Number(at) / PANEL_COLS);
			return row + rows > PANEL_ROWS - 1 || Number(at) >= first;
		});
		expect(
			busy.map(([at]) => at),
			'нижній ряд зайнято'
		).toEqual([]);
	});
});
