import { mark } from '$lib/services/breadcrumbs';
import { TRIGGER_TESTS, type TrackTrigger, type TriggerTest } from '$lib/triggers/trigger';

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
	/**
	 * Підпис на екрані. Відсутній — береться імʼя файлу.
	 *
	 * Файл при цьому НЕ перейменовується: це тека людини, і застосунок не має
	 * права чіпати в ній нічого, крім власного файлу налаштувань.
	 */
	title?: string;
	/** Назва заготовки кольору. Відсутня — без кольору. */
	color?: string;
	/**
	 * Гаряча клавіша — КОД фізичної клавіші (`KeyQ`, `F5`, `Numpad3`).
	 *
	 * Не символ: символ залежить від розкладки, і зміна розкладки перемішала б
	 * усю дошку. Старі файли зберігали тут число 1…9 — воно читається як
	 * `Digit<число>`, щоб розкладка, зроблена вчора, не загубилася.
	 */
	hotkey?: string;
	/** Прихований від пульта. */
	hidden?: boolean;
	/**
	 * Запуск за зовнішнім API. Відсутній — трек запускають руками.
	 *
	 * Лежить у файлі теки разом з усім іншим, і це означає, що ключ доступу до
	 * чужого API опиниться у файлі на диску людини. Сказано прямо, бо файл вона
	 * може відкрити блокнотом: це її комп'ютер і її ключ, але місце треба
	 * знати.
	 */
	trigger?: TrackTrigger;
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

	// Число — це файл, записаний до того, як клавішею стала будь-яка кнопка.
	const legacy =
		typeof record.hotkey === 'number' && record.hotkey >= 1 && record.hotkey <= 9
			? `Digit${Math.round(record.hotkey)}`
			: null;
	const hotkey = typeof record.hotkey === 'string' ? record.hotkey : legacy;

	return {
		path: record.path,
		...(toTrigger(record.trigger) ? { trigger: toTrigger(record.trigger) as TrackTrigger } : {}),
		...(typeof record.title === 'string' && record.title.trim().length > 0
			? { title: record.title.trim().slice(0, 200) }
			: {}),
		...(typeof record.color === 'string' ? { color: record.color } : {}),
		...(hotkey && /^[A-Za-z0-9]{1,20}$/.test(hotkey) ? { hotkey } : {}),
		...(record.hidden === true ? { hidden: true } : {})
	};
}

/**
 * Тригер із файлу. Будь-яке не те поле — тригера немає.
 *
 * Читається строго: файл правлять блокнотом, і половина тригера гірша за
 * жодного — вона опитувала б чужу адресу з невідомою умовою.
 */
function toTrigger(value: unknown): TrackTrigger | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.url !== 'string' || record.url.length === 0) return null;

	const headers: Record<string, string> = {};
	if (typeof record.headers === 'object' && record.headers !== null) {
		for (const [name, header] of Object.entries(record.headers)) {
			if (typeof header === 'string') headers[name] = header;
		}
	}

	const test = (TRIGGER_TESTS as readonly string[]).includes(String(record.test))
		? (record.test as TriggerTest)
		: 'truthy';

	return {
		on: record.on === true,
		url: record.url,
		everySec: typeof record.everySec === 'number' ? record.everySec : 30,
		headers,
		path: typeof record.path === 'string' ? record.path : '',
		test,
		value: typeof record.value === 'string' ? record.value : '',
		// Відсутнє поле — це файл, записаний до появи вибору. Тодішній намір
		// був саме «лише на зміну», тож типове значення його й повторює.
		onChange: record.onChange !== false
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
		const config = parseConfig(await (await handle.getFile()).text());
		mark(`config:read ${config.tracks.length}`);
		return config;
	} catch {
		mark('config:none');
		return emptyConfig();
	}
}

/**
 * РОЗБІР ОКРЕМО ВІД ЧИТАННЯ ФАЙЛУ.
 *
 * Той самий файл лежить у тій самій папці, але дістають його двома різними
 * способами: у браузері — через дескриптор, у застосунку на комп'ютері — за
 * шляхом. Правила ж розбору однакові, і роздвоювати їх не можна: розійшлися б
 * тихо, і папка, налаштована в одному, читалася б без кольорів у другому.
 */
export function parseConfig(text: string): BoardConfig {
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== 'object' || parsed === null) return emptyConfig();

		const record = parsed as Record<string, unknown>;
		const tracks = Array.isArray(record.tracks)
			? record.tracks.map(toSetting).filter((entry): entry is TrackSetting => entry !== null)
			: [];

		return { schema: SCHEMA, tracks };
	} catch {
		// Зіпсований файл — це «налаштувань немає», а не привід падати.
		return emptyConfig();
	}
}

/** Текст файлу. Із відступами: його читає людина, а не лише ми. */
export const serializeConfig = (config: BoardConfig): string =>
	JSON.stringify({ ...config, schema: SCHEMA }, null, '\t');

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
		await writable.write(serializeConfig(config));
		await writable.close();
		mark(`config:write ${config.tracks.length}`);
		return true;
	} catch (error) {
		mark(`config:write-failed ${String(error).slice(0, 60)}`);
		return false;
	}
}
