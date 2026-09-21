// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ПРИБИРАННЯ ЗНОСИТЬ І ДОШКУ, І ЇЇ АДМІНСЬКИЙ КАНАЛ — І САМЕ ЗА ТИМИ АДРЕСАМИ.
 *
 * Канал виводиться з АДРЕСИ дошки (`deriveAdminKey`), а поруч у кожному
 * місцевому записі лежить `id` — той, що диктують уголос. Обидва поля рядки,
 * тож компілятор їх не розрізняє, а наслідок не падає нікуди: виходить інший
 * хеш, тобто адреса, за якою нічого немає.
 *
 * І тоді все йде далі не так, як здається. `remove` на порожнє місце не
 * «нічого не робить»: правило каналу дозволяє знести лише господареві, а
 * господаря в порожнечі немає — база ВІДМОВЛЯЄ. Відмова летить із
 * `removeBoardEverywhere`, її ловить `catch`, і дошка, яку саме збиралися
 * прибрати, лишається жити. Те саме в кнопці видалення: людина бачить «не
 * вдалося», хоч права має.
 *
 * Тобто дошка з адмінським паролем не видалялася ЖОДНИМ зі шляхів. Тут це
 * заміряно, а не припущено.
 *
 * ## Чому база підставна
 *
 * Питання не про базу, а про те, ЯКУ АДРЕСУ цей модуль складає. Справжня
 * відповіла б на нього тією самою відмовою, але через емулятор і хвилину
 * прогону.
 */

const closeChannel = vi.fn(() => Promise.resolve());
const deleteBoard = vi.fn(() => Promise.resolve());
const forgetBoard = vi.fn();
const readInfo = vi.fn();

/** Адреса дошки — 32 шістнадцяткові; ідентифікатор — п'ять великих літер. */
const KEY = 'ab12'.repeat(8);
const ID = 'EYE75';
const ADMIN_PASSWORD = 'ЗАМОК-ПЕРО-СІЛЬ-9900';

vi.mock('./myBoards', () => ({
	listBoards: () => [
		{
			key: KEY,
			id: ID,
			name: 'Стара',
			role: 'player',
			password: 'КАВА-ВІКНО-СІЛЬ-1234',
			adminPassword: ADMIN_PASSWORD
		}
	],
	forgetBoard
}));

vi.mock('$lib/net/board', () => ({ readInfo, deleteBoard }));
vi.mock('$lib/net/admin', () => ({ closeChannel }));
vi.mock('$lib/services/breadcrumbs', () => ({ mark: () => {} }));

const { deriveAdminKey } = await import('./boardPath');
const { sweepOwnExpiredBoards } = await import('./sweepBoards');

beforeEach(() => {
	closeChannel.mockClear();
	deleteBoard.mockClear();
	forgetBoard.mockClear();
	readInfo.mockReset();
});

describe('прибирання своїх прострочених дощок (sweepBoards.ts)', () => {
	it('перевірка жива: свіжу дошку не чіпає', async () => {
		// Без цього опису решта проходила б і тоді, коли прибирання зносить усе
		// підряд, — а це найдорожча з можливих помилок цього файлу.
		readInfo.mockResolvedValue({ seenAt: Date.now(), createdAt: Date.now() });

		const result = await sweepOwnExpiredBoards();

		expect(result.removed, 'знесено свіжу дошку').toBe(0);
		expect(deleteBoard).not.toHaveBeenCalled();
	});

	it('прострочену зносить разом з адмінським каналом', async () => {
		const year = 365 * 24 * 60 * 60 * 1000;
		readInfo.mockResolvedValue({ seenAt: Date.now() - year, createdAt: Date.now() - year });

		const result = await sweepOwnExpiredBoards();

		expect(result.failed, `прибирання відмовило: ${result.failed}`).toBe(0);
		expect(result.removed).toBe(1);
		expect(deleteBoard, 'дошку не знесено').toHaveBeenCalledWith(KEY);
		expect(forgetBoard, 'місцевий запис лишився').toHaveBeenCalledWith(KEY);
	});

	it('канал закривається за адресою ДОШКИ, а не за ідентифікатором', async () => {
		/*
		 * Власне регресія. Стара редакція передавала `board.id`, і виведений
		 * ключ був інший — тобто `closeChannel` ішов у порожнечу, база
		 * відмовляла, і дошка не зносилася зовсім.
		 */
		const year = 365 * 24 * 60 * 60 * 1000;
		readInfo.mockResolvedValue({ seenAt: Date.now() - year, createdAt: Date.now() - year });

		await sweepOwnExpiredBoards();

		expect(closeChannel, 'канал не закривали').toHaveBeenCalledTimes(1);
		expect(closeChannel).toHaveBeenCalledWith(await deriveAdminKey(KEY, ADMIN_PASSWORD));
	});

	it('канал закривається ПЕРЕД дошкою', async () => {
		// Порядок не косметичний: канал живе в окремій гілці й із видаленням
		// дошки не зникає, а знайти його потім буде нічим — адмінський пароль
		// лежить у тому самому місцевому записі, який зараз зітруть.
		const year = 365 * 24 * 60 * 60 * 1000;
		readInfo.mockResolvedValue({ seenAt: Date.now() - year, createdAt: Date.now() - year });

		await sweepOwnExpiredBoards();

		expect(closeChannel.mock.invocationCallOrder[0]).toBeLessThan(
			deleteBoard.mock.invocationCallOrder[0]
		);
	});

	it('дошки, якої вже немає в базі, місцевий запис не переживає', async () => {
		// Інакше список роками показує адреси, за якими нічого немає.
		readInfo.mockResolvedValue(null);

		const result = await sweepOwnExpiredBoards();

		expect(forgetBoard).toHaveBeenCalledWith(KEY);
		expect(result.removed, 'це не «знесено з бази»').toBe(0);
		expect(deleteBoard).not.toHaveBeenCalled();
	});
});
