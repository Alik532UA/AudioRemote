// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * АДМІНСЬКИЙ КАНАЛ — ТРИ ТИХІ РІШЕННЯ, НА ЯКИХ ТРИМАЄТЬСЯ ДРУГИЙ ПАРОЛЬ.
 *
 * Правила бази вміють дивитися лише на auth і на ШЛЯХ. Тому другий пароль не
 * перевіряється жодним `if` — він перетворений на адресу, і вся межа між
 * «пульт» і «адміністратор» тримається на тому, куди саме лягає запис. Це
 * рівно той вид рішення, який ламається мовчки: код компілюється, прогін
 * зелений, а канал стоїть там, де його прочитає кожен, хто знає пароль дошки.
 *
 * Тут заміряно три речі, і кожна з них — межа, а не оформлення:
 *
 *  * канал живе ПОЗА піддеревом дошки (`admin/…`, не `boards/…`), бо дозвіл
 *    читати стоїть на `boards/{ключ}` і поширюється на все під ним;
 *  * «вимкнути адміністратора» прибирає ВЕСЬ вузол, а не лише `info`, інакше
 *    налаштування лишилися б читабельними за старою адресою;
 *  * пише й питає той самий вузол — якби `openChannel` і `channelExists`
 *    розійшлися, правильний пароль виглядав би як неправильний, і сказати про
 *    це не міг би ніхто.
 *
 * ## Чому база підставна
 *
 * Питання не про базу, а про те, ЯКІ АДРЕСИ цей модуль називає. Справжня
 * вимагала б емулятора й хвилини на прогін.
 */

const set = vi.fn((_node: string, _value: unknown) => Promise.resolve());
const remove = vi.fn((_node: string) => Promise.resolve());
const read = vi.fn((_node: string): { exists: () => boolean } => ({ exists: () => true }));
const onValue = vi.fn((_node: string, _hear: (snapshot: unknown) => void) => () => {});
const STAMP = Symbol('серверний час');

vi.mock('./firebase', () => ({
	connect: () => Promise.resolve({ db: { name: 'підставна' }, uid: 'господар' })
}));

vi.mock('firebase/database', () => ({
	ref: (_db: unknown, path: string) => ({ path }),
	set: (node: { path: string }, value: unknown) => set(node.path, value),
	remove: (node: { path: string }) => remove(node.path),
	get: (node: { path: string }) => Promise.resolve(read(node.path)),
	onValue: (node: { path: string }, hear: (snapshot: unknown) => void) => onValue(node.path, hear),
	serverTimestamp: () => STAMP
}));

const { channelExists, closeChannel, openChannel, publishTracks, watchTracks } =
	await import('./admin');

const KEY = 'вивведений-ключ';

beforeEach(() => {
	set.mockClear();
	remove.mockClear();
	read.mockClear();
	read.mockReturnValue({ exists: () => true });
	onValue.mockClear();
});

describe('канал стоїть поза дошкою', () => {
	it('жодна адреса каналу не починається з `boards/`', async () => {
		await openChannel(KEY);
		await publishTracks(KEY, { rev: 1, tracks: {} } as never);
		await channelExists(KEY);
		await closeChannel(KEY);
		await watchTracks(KEY, () => {});

		const touched = [
			...set.mock.calls.map((call) => call[0]),
			...remove.mock.calls.map((call) => call[0]),
			...read.mock.calls.map((call) => call[0]),
			...onValue.mock.calls.map((call) => call[0])
		];

		expect(
			touched.length,
			'жодної адреси не заміряно — підставка розійшлася з модулем'
		).toBeGreaterThan(0);
		// Дозвіл читати `boards/{ключ}` поширюється на ВСЕ піддерево: канал,
		// покладений туди, прочитав би кожен, хто знає пароль дошки.
		expect(touched.filter((path) => path.startsWith('boards/'))).toEqual([]);
		expect(touched.every((path) => path.startsWith(`admin/${KEY}`))).toBe(true);
	});
});

describe('відкрити, спитати, закрити', () => {
	it('пише й питає ОДИН вузол', async () => {
		await openChannel(KEY);
		await channelExists(KEY);

		// Не літерал двічі: питання саме в тому, чи збігаються ці двоє.
		expect(read.mock.calls[0][0]).toBe(set.mock.calls[0][0]);
	});

	it('відкритий канал називає господаря й серверний час', async () => {
		// `ownerUid` бере з'єднання, а не той, хто кличе: правило звіряє запис
		// саме з ним.
		await openChannel(KEY);
		expect(set).toHaveBeenCalledWith(`admin/${KEY}/info`, {
			ownerUid: 'господар',
			createdAt: STAMP,
			schema: expect.any(Number)
		});
	});

	it('закриття прибирає ВЕСЬ вузол, а не лише `info`', async () => {
		// Інакше «вимкнути адміністратора» лишило б налаштування читабельними
		// за тією самою адресою — пароль веде туди ж, куди й вів.
		await closeChannel(KEY);
		expect(remove).toHaveBeenCalledWith(`admin/${KEY}`);
	});

	it('відповідає БАЗА, а не наш if', async () => {
		read.mockReturnValue({ exists: () => false });
		expect(await channelExists(KEY)).toBe(false);

		read.mockReturnValue({ exists: () => true });
		expect(await channelExists(KEY)).toBe(true);
	});
});
