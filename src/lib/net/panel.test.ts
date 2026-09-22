// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ПАНЕЛЬ ПИШЕТЬСЯ ТУДИ, КУДИ ДИВЛЯТЬСЯ ПРАВИЛА, І ЧАС У НІЙ СЕРВЕРНИЙ.
 *
 * Модуль тонкий — три записи й три підписки, — і саме тому лежав на нулі: на
 * вигляд перевіряти нема чого. Але обидва його рішення тихі.
 *
 * ВУЗОЛ. Помилка в рядку шляху не кидає нічого: запис лягає поруч, правило
 * `$other: false` його відкидає, і на екрані це виглядає як «не долетіло».
 * Шлях звіряється з тим самим `boardPath`, на який спираються правила.
 *
 * ЧАС СТАВИТЬ БАЗА. Годинник планшета в залі розходиться з годинником за
 * пультом на хвилини, а помічник по мітці вирішує, чи відповідь стосується
 * ЙОГО прохання. Підставити тут `Date.now()` можна непомітно: прогін на одній
 * машині зеленого кольору не змінить.
 *
 * ## Чому база підставна
 *
 * Питання не про базу, а про те, що ЦЕЙ модуль у неї кладе. Справжня вимагала б
 * емулятора й хвилини на прогін.
 */

const set = vi.fn((_node: string, _value: unknown) => Promise.resolve());
const onValue = vi.fn((_node: string, _hear: (snapshot: unknown) => void) => () => {});
const STAMP = Symbol('серверний час');

vi.mock('./firebase', () => ({
	connect: () => Promise.resolve({ db: { name: 'підставна' }, uid: 'господар' })
}));

vi.mock('firebase/database', () => ({
	ref: (_db: unknown, path: string) => ({ path }),
	set: (node: { path: string }, value: unknown) => set(node.path, value),
	onValue: (node: { path: string }, hear: (snapshot: unknown) => void) => onValue(node.path, hear),
	serverTimestamp: () => STAMP
}));

const { emptyPanel, publishPanel, publishPanelState, publishVerdict, watchPanel, watchVerdict } =
	await import('./panel');

beforeEach(() => {
	set.mockClear();
	onValue.mockClear();
});

describe('куди саме лягає запис', () => {
	it.each([
		['панель', () => publishPanel('КЛЮЧ', emptyPanel()), 'boards/КЛЮЧ/panel'],
		['положення', () => publishPanelState('КЛЮЧ', {}), 'boards/КЛЮЧ/panelState'],
		['відповідь', () => publishVerdict('КЛЮЧ', 'done', '0', 'Вода'), 'boards/КЛЮЧ/panelVerdict']
	])('%s — у свій вузол', async (_what, write, node) => {
		await write();
		expect(set).toHaveBeenCalledWith(node, expect.anything());
	});

	it('підписки слухають ті самі вузли, що й записи', async () => {
		await watchPanel('КЛЮЧ', () => {});
		await watchVerdict('КЛЮЧ', () => {});
		expect(onValue.mock.calls.map((call) => call[0])).toEqual([
			'boards/КЛЮЧ/panel',
			'boards/КЛЮЧ/panelVerdict'
		]);
	});
});

describe('що саме лягає', () => {
	it('час ставить БАЗА, а не пристрій', async () => {
		await publishPanelState('КЛЮЧ', {});
		await publishVerdict('КЛЮЧ', 'no', '3', 'Світло');

		expect(set).toHaveBeenNthCalledWith(1, expect.anything(), { atServer: STAMP });
		expect(set).toHaveBeenNthCalledWith(2, expect.anything(), {
			kind: 'no',
			cell: '3',
			caption: 'Світло',
			at: STAMP
		});
	});

	/*
	 * RTDB не зберігає порожній об'єкт: вузол із ним просто не з'являється.
	 * Тобто запис із `levels: {}` при читанні виглядав би інакше, ніж при
	 * записі, — і перший, хто на це обіпреться, дістане розбіжність, якої в
	 * коді не видно.
	 */
	it('порожні мапи не пишуться зовсім, а непорожні пишуться', async () => {
		await publishPanelState('КЛЮЧ', { levels: {}, flags: {} });
		expect(set).toHaveBeenCalledWith(expect.anything(), { atServer: STAMP });

		await publishPanelState('КЛЮЧ', { levels: { '2': 40 }, flags: {} });
		expect(set).toHaveBeenLastCalledWith(expect.anything(), {
			atServer: STAMP,
			levels: { '2': 40 }
		});
	});

	it('порожня панель щоразу СВОЯ, а не одна на застосунок', () => {
		// Спільний об'єкт-константа: перший редактор, що допише в нього
		// комірку, змінив би «порожню панель» для всіх наступних.
		const first = emptyPanel();
		first.cells['0'] = { kind: 'check', caption: 'Вода' };
		expect(emptyPanel().cells).toEqual({});
	});
});
