import { mark } from '$lib/services/breadcrumbs';

/**
 * НАЛАШТУВАННЯ ДОШКИ ЖИВУТЬ У ФАЙЛІ ПОРУЧ ІЗ МУЗИКОЮ.
 *
 * ## Чому саме там
 *
 * Порядок треків, кольори й гарячі клавіші — це рішення про КОНКРЕТНУ теку.
 * Класти їх у сховище браузера означало б втратити їх разом із очищенням даних
 * сайту, з переїздом на інший комп'ютер і з іншим браузером на тому самому
 * комп'ютері. Класти в базу — прив'язати до дошки, хоча тека може переїхати на
 * іншу дошку.
 *
 * У файлі вони їдуть разом із текою: скопіювали папку на інший комп'ютер —
 * поїхали й підписи. Заразом це відповідь на «налаштування не зберігаються
 * після перевідкривання»: дескриптор теки зберігати не можна (див.
 * `localSource.ts`), а файл у самій теці — можна.
 *
 * ## Чому JSON, який можна відкрити блокнотом
 *
 * Це теки людини, а не наше сховище. Формат, який вона здатна прочитати й
 * поправити руками, — частина домовленості: застосунок не бере теку в заручники.
 *
 * ## Чому ключ — ШЛЯХ, а не ідентифікатор треку
 *
 * Ідентифікатор виводиться з шляху хешем, тобто в файлі він був би нечитним
 * набором літер. Шлях відповідає на те саме питання й читається очима. Ціна
 * названа: перейменований файл втрачає свої налаштування — але перейменований
 * файл і є інший файл, а вгадувати тут гірше, ніж забути.
 */

/** Імʼя файлу в корені обраної теки. */
export const CONFIG_FILE = 'audioremote.json';

/** Версія формату. Несумісна зміна — нове число й окрема гілка читання. */
const SCHEMA = 1;

export interface TrackSetting {
	/** Шлях усередині теки — те саме, що `SourceTrack.path`. */
	path: string;
	/** Назва заготовки кольору. Відсутня — без кольору. */
	color?: string;
	/** Гаряча клавіша 1…9. Відсутня — трек запускають лише натисканням. */
	hotkey?: number;
	/** Прихований від пульта. */
	hidden?: boolean;
}

export interface BoardConfig {
	schema: number;
	/** Порядок треків — це порядок цього масиву. */
	tracks: TrackSetting[];
}

export const emptyConfig = (): BoardConfig => ({ schema: SCHEMA, tracks: [] });

/** Чи схоже це на наш запис про трек. Чуже поле просто не читається. */
function toSetting(value: unknown): TrackSetting | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.path !== 'string' || record.path.length === 0) return null;

	return {
		path: record.path,
		...(typeof record.color === 'string' ? { color: record.color } : {}),
		...(typeof record.hotkey === 'number' && record.hotkey >= 1 && record.hotkey <= 9
			? { hotkey: Math.round(record.hotkey) }
			: {}),
		...(record.hidden === true ? { hidden: true } : {})
	};
}

/**
 * Прочитати налаштування з теки.
 *
 * Будь-яка невдача — це «налаштувань немає», а не помилка: файлу може не бути
 * (тека новенька), його міг зіпсувати редактор, теку могли дати лише на
 * читання. У жодному з цих випадків не можна ні впасти, ні стерти те, що там
 * лежить.
 */
export async function readConfig(folder: FileSystemDirectoryHandle): Promise<BoardConfig> {
	try {
		const handle = await folder.getFileHandle(CONFIG_FILE);
		const text = await (await handle.getFile()).text();
		const parsed: unknown = JSON.parse(text);

		if (typeof parsed !== 'object' || parsed === null) return emptyConfig();
		const record = parsed as Record<string, unknown>;
		const tracks = Array.isArray(record.tracks)
			? record.tracks.map(toSetting).filter((entry): entry is TrackSetting => entry !== null)
			: [];

		mark(`config:read ${tracks.length}`);
		return { schema: SCHEMA, tracks };
	} catch {
		mark('config:none');
		return emptyConfig();
	}
}

/**
 * Записати налаштування в теку. `false` — записати не вдалося.
 *
 * Найчастіша причина — тека видана лише на читання. Це не привід ні падати, ні
 * скаржитися щоразу: застосунок далі працює, просто підписи живуть до кінця
 * сеансу. Сторінка каже про це один раз.
 */
export async function writeConfig(
	folder: FileSystemDirectoryHandle,
	config: BoardConfig
): Promise<boolean> {
	try {
		const handle = await folder.getFileHandle(CONFIG_FILE, { create: true });
		const writable = await handle.createWritable();
		// Із відступами: файл читає людина, а не лише ми.
		await writable.write(JSON.stringify({ ...config, schema: SCHEMA }, null, '\t'));
		await writable.close();
		mark(`config:write ${config.tracks.length}`);
		return true;
	} catch (error) {
		mark(`config:write-failed ${String(error).slice(0, 60)}`);
		return false;
	}
}
