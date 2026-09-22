// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ПРИСУТНІСТЬ ПЕРЕЖИВАЄ ОБРИВ ЗВʼЯЗКУ.
 *
 * Дефект, який тут заміряно, коштував найдорожчого — неправдивого напису про
 * ІНШИЙ пристрій. `onDisconnect` виконує сервер: обірвався сокет — запис
 * присутності зник. SDK при відновленні наново домовляється про `onDisconnect`,
 * але підтверджений `set` не повторює. Отже одноразове «зʼявитися» трималося
 * рівно до першого блимання мережі: п'ять секунд без Wi-Fi — і пульт назавжди
 * каже «Плеєр офлайн. Відкрийте дошку там», хоч вкладка відкрита й музика грає.
 *
 * Помітити це очима майже неможливо: обрив на секунду не лишає слідів ніде,
 * сторінка приймача виглядає бездоганно, а шукати починають у телефоні.
 *
 * ## Чому база підставна
 *
 * Питання не про базу, а про те, СКІЛЬКИ РАЗІВ цей модуль зʼявляється. Справжня
 * вимагала б емулятора, а обрив у ньому довелося б імітувати однаково.
 */

const onDisconnectRemove = vi.fn(() => Promise.resolve());
/*
 * Аргументи оголошені навмисно: без них `mock.calls` має тип порожнього
 * кортежу, і опис, який дивиться, ЩО саме записали, не збирається.
 */
const set = vi.fn((_ref: unknown, _value: unknown) => Promise.resolve());
const remove = vi.fn(() => Promise.resolve());
const update = vi.fn((_ref: unknown, _value: unknown) => Promise.resolve());

/** Слухачі за шляхом — щоб опис міг сам сказати «звʼязок зник». */
const listeners = new Map<string, (snapshot: { val: () => unknown }) => void>();

vi.mock('./firebase', () => ({
	connect: () => Promise.resolve({ db: {}, uid: 'хтось' })
}));

vi.mock('firebase/database', () => ({
	ref: (_db: unknown, path: string) => ({ path }),
	onDisconnect: () => ({ remove: onDisconnectRemove }),
	onValue: (target: { path: string }, callback: (snapshot: { val: () => unknown }) => void) => {
		listeners.set(target.path, callback);
		return () => listeners.delete(target.path);
	},
	set,
	remove,
	update,
	serverTimestamp: () => 'коли-завгодно'
}));

const { tellPresence, trackPresence } = await import('./presence');

/** Сказати модулю те, що йому скаже SDK: сокет піднявся або впав. */
const socket = (online: boolean): void => {
	const notify = [...listeners.entries()].find(([path]) => path === '.info/connected')?.[1];
	if (!notify) throw new Error('модуль не слухає .info/connected');
	notify({ val: () => online });
};

beforeEach(() => {
	listeners.clear();
	onDisconnectRemove.mockClear();
	set.mockClear();
	remove.mockClear();
	update.mockClear();
});

describe('присутність (presence.ts)', () => {
	it('перевірка жива: модуль підписався на стан звʼязку', async () => {
		/*
		 * Без цього опису решта зеленіла б і тоді, коли підписки немає зовсім:
		 * `socket()` кинув би, але кинув би ВСЕРЕДИНІ опису про повтор, і
		 * причина читалася б як поломка перевірки, а не як відсутність підписки.
		 */
		await trackPresence('дошка', 'player');
		expect([...listeners.keys()], 'модуль не слухає звʼязок').toContain('.info/connected');
	});

	it('до появи сокета не пишеться нічого', async () => {
		// Запис у чергу SDK нічого не ламає, але й не означає присутності:
		// сервер побачить його лише разом із сокетом.
		await trackPresence('дошка', 'player');
		socket(false);

		expect(set, 'присутність оголошена без звʼязку').not.toHaveBeenCalled();
	});

	it('зʼявлення домовляється про зникнення ПЕРШИМ', async () => {
		await trackPresence('дошка', 'player');
		socket(true);
		await vi.waitFor(() => expect(set).toHaveBeenCalled());

		expect(
			onDisconnectRemove.mock.invocationCallOrder[0],
			'спершу записалися, потім домовилися прибирати — обрив у цю мить лишає привида'
		).toBeLessThan(set.mock.invocationCallOrder[0]);
	});

	it('після обриву присутність оголошується ЗАНОВО', async () => {
		/*
		 * Власне регресія. Стара редакція писала один раз на виклик, і цей опис
		 * бачив би рівно одне оголошення на три підйоми сокета.
		 */
		await trackPresence('дошка', 'player');

		socket(true);
		await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

		socket(false);
		socket(true);
		await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));

		expect(
			onDisconnectRemove,
			'домовленість про прибирання не поновлена разом із записом'
		).toHaveBeenCalledTimes(2);
	});

	it('явний вихід знімає підписку, а не лише запис', async () => {
		// Інакше вкладка, що пішла з дошки, оголошувалася б назад на кожному
		// відновленні звʼязку — і зникнути не могла б узагалі.
		const leave = await trackPresence('дошка', 'remote');
		socket(true);
		await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

		leave();
		expect(remove, 'запис присутності не прибрано').toHaveBeenCalled();
		expect([...listeners.keys()], 'підписка пережила вихід').not.toContain('.info/connected');
	});
});

describe('підпис і пульт не виходять за межі правила', () => {
	/*
	 * Правило приймає імʼя до 24 символів і пульт до 16, а `$other: false`
	 * відкидає незнане значення разом з УСІМ записом. Тобто задовгий підпис —
	 * це не «присутність без імені», а присутності немає зовсім: помічник
	 * зникає з табла, а пульт пише «плеєр офлайн» при відкритій дошці.
	 *
	 * Обидва значення дорогою лежать у сховищі, тож «місце виклику вкорочує»
	 * тут не доказ.
	 */
	const last = () => set.mock.calls.at(-1)?.[1] as Record<string, unknown>;

	it('перевірка жива: короткий підпис доїжджає як є', async () => {
		await trackPresence('дошка', 'remote', { name: 'Оля', sheet: 'світло' });
		socket(true);
		await Promise.resolve();
		expect(last()).toMatchObject({ name: 'Оля', sheet: 'світло' });
	});

	it('задовгий підпис вкорочується, а не валить увесь запис', async () => {
		await trackPresence('дошка', 'remote', { name: 'я'.repeat(80), sheet: 'с'.repeat(40) });
		socket(true);
		await Promise.resolve();
		expect((last().name as string).length).toBe(24);
		expect((last().sheet as string).length).toBe(16);
	});

	it('порожнє поле не пишеться зовсім', async () => {
		await trackPresence('дошка', 'remote', { name: '   ', sheet: '' });
		socket(true);
		await Promise.resolve();
		expect(last().name).toBeUndefined();
		expect(last().sheet).toBeUndefined();
	});

	it('пізніше «я тепер тут» вкорочується так само', async () => {
		await trackPresence('дошка', 'remote', { name: 'Оля' });
		socket(true);
		await Promise.resolve();

		await tellPresence('дошка', { name: 'О'.repeat(80), sheet: 'з'.repeat(40) });
		const said = update.mock.calls.at(-1)?.[1] as Record<string, string | null>;
		expect((said.name as string).length).toBe(24);
		expect((said.sheet as string).length).toBe(16);
	});
});
