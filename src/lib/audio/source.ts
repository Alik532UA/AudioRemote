/**
 * ДЖЕРЕЛО АУДІО — ЗА ІНТЕРФЕЙСОМ, і це не «гнучкість на майбутнє».
 *
 * Справжнє джерело стоїть на дескрипторі теки (File System Access API), а в
 * нього є властивість, яка робить його неперевірним: діалог вибору теки
 * відкриває БРАУЗЕР, і жоден автотест у нього не заходить. Playwright не може
 * ні натиснути «Обрати», ні підсунути теку.
 *
 * Отже вибір лише два. Або правила плеєра — черга, гучність, «файл зник», межа
 * життя команди — лишаються неперевіреними разом із діалогом. Або джерело
 * ховається за інтерфейсом, і тоді ті самі правила перевіряються з підставним
 * джерелом, у якому жодного діалогу немає.
 *
 * Це та сама причина, з якої в сусідньому проєкті кімната має інтерфейс
 * транспорту: без нього кожна перевірка спільної партії вимагала б мережі.
 *
 * Що лишається на ручну перевірку й НЕ прикидається покритим: сам діалог,
 * збереження дозволу між перезапусками браузера й читання справжніх файлів.
 */

import { emptyConfig, type BoardConfig } from './boardConfig';

/** Трек, як його бачить джерело. `id` стабільний між перечитуваннями. */
export interface SourceTrack {
	id: string;
	title: string;
	/** Шлях усередині обраної теки: `підтека/файл.mp3`. */
	path: string;
}

export type SourceStatus =
	/** Тека обрана, можна читати. */
	| 'ready'
	/** Теки ще не обирали в ЦЬОМУ завантаженні сторінки. */
	| 'none'
	/** Цей браузер так не вміє. */
	| 'unsupported';

/*
 * Стану «тека памʼятається, підтвердіть дозвіл» тут більше немає, і це не
 * спрощення інтерфейсу, а наслідок аварії: дескриптор не зберігається взагалі
 * (`localSource.ts`). Отже після перезавантаження сторінки теки просто немає —
 * один стан замість двох, і жодного натяку на відновлення, якого не буде.
 */

export class TrackMissingError extends Error {
	constructor(readonly path: string) {
		super(`файл зник: ${path}`);
		this.name = 'TrackMissingError';
	}
}

export interface AudioSource {
	/** Чи вміє цей браузер давати сторінці доступ до теки. */
	readonly supported: boolean;

	/** Як воно зараз. Читає дозвіл, нічого не питає в людини. */
	status(): Promise<SourceStatus>;

	/**
	 * Попросити теку. КЛИКАТИ ЛИШЕ З ЖЕСТУ: браузер відкриває діалог тільки у
	 * відповідь на дію людини, інакше обіцянка відхиляється.
	 */
	pick(): Promise<boolean>;

	/** Перечитати теку. Повертає треки, впорядковані за назвою. */
	scan(): Promise<SourceTrack[]>;

	/** Дістати файл. Кидає `TrackMissingError`, якщо його вже немає. */
	open(path: string): Promise<File>;

	/** Назва обраної теки — щоб людина бачила, що саме вона дала. */
	readonly label: string | null;

	/** Налаштування дошки — вони живуть у самій теці (`boardConfig.ts`). */
	readConfig(): Promise<BoardConfig>;

	/** Записати налаштування. `false` — теку видали лише на читання. */
	writeConfig(config: BoardConfig): Promise<boolean>;
}

/** Розширення, які браузери вміють програвати. Решта в бібліотеку не потрапляє. */
export const AUDIO_EXTENSIONS = [
	'mp3',
	'm4a',
	'aac',
	'ogg',
	'oga',
	'opus',
	'wav',
	'flac',
	'weba',
	'webm'
] as const;

export const isAudioFile = (name: string): boolean => {
	const dot = name.lastIndexOf('.');
	if (dot < 1) return false;
	return (AUDIO_EXTENSIONS as readonly string[]).includes(name.slice(dot + 1).toLowerCase());
};

/** Назва треку — ім'я файлу без розширення. Людина може перейменувати потім. */
export const titleFromName = (name: string): string => {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
};

/**
 * НАЗВА В РЯДКИ: «Виконавець - Пісня» стає двома рядками.
 *
 * Ділить ЛИШЕ перший дефіс-роздільник, оточений пробілами. Причина в тому, що
 * дефіс усередині назви — не роздільник: «Happy End - Non-Stop» мусить дати
 * «Happy End» і «Non-Stop», а не три шматки.
 *
 * Потрібно це на телефоні: в один рядок назва не влазить і обривається
 * трикрапкою якраз там, де починається головне — сама пісня. Виконавець при
 * цьому щоразу той самий, і саме він займав усю ширину.
 */
export const titleLines = (title: string): string[] => {
	const found = /\s[-–—]\s/.exec(title);
	if (!found) return [title];
	return [title.slice(0, found.index), title.slice(found.index + found[0].length)];
};

/**
 * Ідентифікатор треку — короткий хеш ШЛЯХУ.
 *
 * Шлях не можна класти в ключ RTDB напряму: `.`, `#`, `$`, `[`, `]` і `/` там
 * заборонені, а в іменах файлів вони трапляються всі. Хеш заразом дає те, без
 * чого не працювало б головне: ідентифікатор НЕ МІНЯЄТЬСЯ між перечитуваннями
 * теки. Інакше кожне перечитування скидало б і приховані треки, і команду
 * «грай оце», яку пульт щойно надіслав.
 *
 * Шістнадцять шістнадцяткових символів — 64 біти. Для теки навіть на десять
 * тисяч треків імовірність збігу лишається зникомою.
 */
export async function trackIdFromPath(path: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (!subtle) throw new Error('crypto.subtle недоступний: потрібне https або localhost');

	const digest = await subtle.digest('SHA-256', new TextEncoder().encode(path));
	return [...new Uint8Array(digest)]
		.slice(0, 8)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Підставне джерело для тестів: файли живуть у пам'яті.
 *
 * Тримає рівно той самий контракт, що й справжнє, включно з `TrackMissingError`
 * — інакше перевірявся б не той шлях коду, яким піде застосунок.
 */
export class MemorySource implements AudioSource {
	readonly supported = true;
	label: string | null = 'пам’ять';

	private files = new Map<string, File>();

	constructor(files: Record<string, File | string> = {}) {
		for (const [path, content] of Object.entries(files)) this.add(path, content);
	}

	add(path: string, content: File | string): void {
		this.files.set(
			path,
			typeof content === 'string'
				? new File([content], path.split('/').pop() ?? path, { type: 'audio/mpeg' })
				: content
		);
	}

	remove(path: string): void {
		this.files.delete(path);
	}

	async status(): Promise<SourceStatus> {
		return this.label === null ? 'none' : 'ready';
	}

	async pick(): Promise<boolean> {
		this.label = 'пам’ять';
		return true;
	}

	async scan(): Promise<SourceTrack[]> {
		const tracks = await Promise.all(
			[...this.files.keys()].filter(isAudioFile).map(async (path) => ({
				id: await trackIdFromPath(path),
				title: titleFromName(path.split('/').pop() ?? path),
				path
			}))
		);
		return tracks.sort((left, right) => left.title.localeCompare(right.title, 'uk'));
	}

	async open(path: string): Promise<File> {
		const file = this.files.get(path);
		if (!file) throw new TrackMissingError(path);
		return file;
	}

	/** Налаштування в памʼяті — щоб підставне джерело тримало той самий контракт. */
	private config: BoardConfig = emptyConfig();

	async readConfig(): Promise<BoardConfig> {
		return this.config;
	}

	async writeConfig(config: BoardConfig): Promise<boolean> {
		this.config = config;
		return true;
	}
}
