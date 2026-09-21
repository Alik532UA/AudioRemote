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
const set = vi.fn(() => Promise.resolve());
const remove = vi.fn(() => Promise.resolve());

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
	serverTimestamp: () => 'коли-завгодно'
}));

const { trackPresence } = await import('./presence');

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
