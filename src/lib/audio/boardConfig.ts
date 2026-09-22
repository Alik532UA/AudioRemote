import { isColorSlug } from '$lib/config/trackColors';
import { KEY_CODE } from '$lib/hotkeys/hotkeys';
import { mark } from '$lib/services/breadcrumbs';
import {
	TRIGGER_TESTS,
	type TrackTrigger,
	type TriggerTest,
	type WeekSchedule
} from '$lib/triggers/trigger';

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

/**
 * КОГО ТРЕК СТОСУЄТЬСЯ — три стани, а не прапорець.
 *
 * Прапорця «приховано» вистачало, доки приховати означало «ніде». Але в залі
 * потрібне третє: трек, який запускає ЛИШЕ той, хто стоїть за комп'ютером, —
 * гімн, службовий сигнал, сирена. Він мусить лишатися в списку приймача й під
 * своєю клавішею, і не мусить бути ні видимим, ні досяжним з телефона в чужих
 * руках.
 *
 * `player` — не «напівприховано». Це інша межа: не видимість, а хто має право
 * запустити.
 */
export type TrackVisibility =
	/** Видно скрізь: і в списку приймача, і на пульті. */
	| 'all'
	/** Лише приймач: у списку є, клавіша діє, пульт його не бачить і не запустить. */
	| 'player'
	/** Ніде. Ні в списку, ні під клавішею, ні на пульті. */
	| 'none';

export const TRACK_VISIBILITIES: readonly TrackVisibility[] = ['all', 'player', 'none'];

/**
 * Чи це відома видимість.
 *
 * Експортується, бо перевіряти треба не лише файл: те саме значення приходить
 * від адміністратора з пульта, і друга, «своя» перевірка там розійшлася б із
 * цією мовчки.
 */
export const isVisibility = (value: unknown): value is TrackVisibility =>
	typeof value === 'string' && (TRACK_VISIBILITIES as readonly string[]).includes(value);

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
	 * ЗНАЧОК ПЕРЕД НАЗВОЮ — окреме поле, а не символ усередині підпису.
	 *
	 * Спершу емодзі просто вставлявся в текст, і з цього виходило дві біди
	 * одразу: на телефоні він займав місце в першому рядку назви (а рядків там
	 * усього два), і його неможливо було ні вирівняти, ні збільшити — він був
	 * частиною речення. Окремим полем він стає тим, чим і мав бути: позначкою
	 * збоку, яку видно раніше за текст.
	 */
	icon?: string;
	/**
	 * Гаряча клавіша — КОД фізичної клавіші (`KeyQ`, `F5`, `Numpad3`).
	 *
	 * Не символ: символ залежить від розкладки, і зміна розкладки перемішала б
	 * усю дошку. Старі файли зберігали тут число 1…9 — воно читається як
	 * `Digit<число>`, щоб розкладка, зроблена вчора, не загубилася.
	 */
	hotkey?: string;
	/**
	 * Скільки разів програти поспіль. Відсутнє — один.
	 *
	 * Рахуємо ВІДТВОРЕННЯ, а не повтори: «3» означає, що трек прозвучить тричі.
	 * «Повторів: 3» читалося б як чотири рази — і саме так його й зрозуміли б
	 * рівно в половині випадків.
	 */
	plays?: number;
	/** Пауза між відтвореннями, секунди. Відсутнє — без паузи. */
	gapSec?: number;
	/**
	 * Кого трек стосується. Відсутнє — `all`.
	 *
	 * Старий прапорець `hidden: true` читається як `none`: доти стан був один
	 * («сховано»), і означав він «ніде».
	 */
	visibility?: TrackVisibility;
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

/**
 * ЩО РОБИТИ, КОЛИ ТРЕК ДОГРАВ САМ.
 *
 * Стосується лише природного кінця: «стоп», пауза й запуск іншого треку — це
 * наміри людини, і політика в них не втручається.
 *
 * `none` — зупинитися; `all` — пройти список і почати спочатку; `one` —
 * крутити той самий трек. Повтори ВСЕРЕДИНІ треку (`plays`) — інша річ і
 * лишаються собою: спершу трек звучить скільки сказано, і вже потім діє це.
 */
export type RepeatMode = 'none' | 'all' | 'one';

export interface PlayPolicy {
	/** Самому переходити до наступного треку. */
	autoNext: boolean;
	repeat: RepeatMode;
}

/**
 * ТИПОВО — НІЧОГО САМЕ НЕ ГРАЄ, і це не обережність заради обережності.
 *
 * Дошка стоїть у залі, де тишу між номерами роблять навмисно. Автоматичний
 * перехід, увімкнений за нас, означав би, що наступний трек заграє посеред
 * оголошення ведучого — і саме там, де виправити це нікому.
 */
export const DEFAULT_PLAY: PlayPolicy = { autoNext: false, repeat: 'none' };

export interface BoardConfig {
	schema: number;
	/** Порядок треків — це порядок цього масиву. */
	tracks: TrackSetting[];
	/** Як поводитися після кінця треку. Відсутнє — типове (нічого). */
	play?: PlayPolicy;
}

export const emptyConfig = (): BoardConfig => ({ schema: SCHEMA, tracks: [] });

/** Чи схоже це на нашу політику відтворення. Чуже або зіпсуте — це типове. */
function toPlay(value: unknown): PlayPolicy | null {
	if (typeof value !== 'object' || value === null) return null;
	const record = value as Record<string, unknown>;
	const repeat = record.repeat;
	return {
		autoNext: record.autoNext === true,
		repeat: repeat === 'all' || repeat === 'one' ? repeat : 'none'
	};
}

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
		...(isColorSlug(record.color) ? { color: record.color } : {}),
		...(typeof record.icon === 'string' && record.icon.trim().length > 0
			? { icon: record.icon.trim().slice(0, MAX_ICON) }
			: {}),
		...(hotkey && KEY_CODE.test(hotkey) ? { hotkey } : {}),
		...(playsOf(record) > 1 ? { plays: playsOf(record) } : {}),
		...(gapOf(record) > 0 ? { gapSec: gapOf(record) } : {}),
		...(visibilityOf(record) === 'all' ? {} : { visibility: visibilityOf(record) })
	};
}

/** Скільки разів програти. Межі не з обережності: сто разів поспіль — це вже збій. */
export const MAX_PLAYS = 99;

/**
 * Найдовший значок.
 *
 * Емодзі буває складеним: прапор — чотири одиниці коду, родина з трьох осіб —
 * вісім. Шістнадцяти вистачає з запасом, і водночас це межа, за якою в поле
 * значка почали б класти речення — а речення розсунуло б кожен рядок списку.
 */
export const MAX_ICON = 16;

/** Найдовша пауза між відтвореннями — година. */
export const MAX_GAP_SEC = 3600;

const whole = (value: unknown, max: number): number => {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
	return Math.min(max, Math.max(0, Math.round(value)));
};

const playsOf = (record: Record<string, unknown>): number =>
	Math.max(1, whole(record.plays, MAX_PLAYS));

const gapOf = (record: Record<string, unknown>): number => whole(record.gapSec, MAX_GAP_SEC);

/**
 * Видимість із запису у файлі.
 *
 * Старий `hidden: true` означав «ніде» — саме так він і читається. Інакше
 * файл, зроблений учора, після оновлення показав би в залі треки, які людина
 * свідомо сховала.
 */
function visibilityOf(record: Record<string, unknown>): TrackVisibility {
	if (isVisibility(record.visibility)) return record.visibility;
	return record.hidden === true ? 'none' : 'all';
}

/**
 * Тригер із файлу — або з пульта адміністратора. Будь-яке не те поле — тригера
 * немає.
 *
 * Читається строго: файл правлять блокнотом, і половина тригера гірша за
 * жодного — вона опитувала б чужу адресу з невідомою умовою. Те саме стосується
 * того, що прийшло мережею: перевірка мусить бути одна на обидва джерела.
 */
export function toTrigger(value: unknown): TrackTrigger | null {
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
		onChange: record.onChange !== false,
		...(toSchedule(record.schedule) ? { schedule: toSchedule(record.schedule) } : {})
	};
}

/**
 * Розклад із файлу. Не сім днів — розкладу немає, тобто дозволено цілодобово.
 *
 * Читається так само строго, як і сам тригер: половина розкладу гірша за його
 * відсутність. Але «немає» тут означає «як було завжди», а не «нічого не
 * грає»: файл, записаний до появи розкладу, мусить працювати як і працював.
 */
function toSchedule(value: unknown): WeekSchedule | null {
	if (!Array.isArray(value) || value.length !== 7) return null;

	const days = value.map((entry) => {
		const day = (entry ?? {}) as Record<string, unknown>;
		return {
			on: day.on === true,
			from: typeof day.from === 'string' ? day.from : '',
			to: typeof day.to === 'string' ? day.to : ''
		};
	});

	return days;
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

		const play = toPlay(record.play);
		return { schema: SCHEMA, tracks, ...(play ? { play } : {}) };
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
