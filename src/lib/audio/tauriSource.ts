import { mark } from '$lib/services/breadcrumbs';
import { readItem, writeItem } from '$lib/services/storage';
import {
	emptyConfig,
	parseConfig,
	serializeConfig,
	CONFIG_FILE,
	type BoardConfig
} from './boardConfig';
import {
	isAudioFile,
	titleFromName,
	TrackMissingError,
	trackIdFromPath,
	type AudioSource,
	type SourceStatus,
	type SourceTrack
} from './source';

/**
 * ПАПКА В ЗАСТОСУНКУ НА КОМП'ЮТЕРІ — ЗА ШЛЯХОМ, А НЕ ЗА ДЕСКРИПТОРОМ.
 *
 * ## Навіщо друге джерело, якщо перше вже є
 *
 * `localSource.ts` живе на File System Access API, і в нього дві межі, яких не
 * обійти з боку сторінки: шлях їй недоступний у принципі, а дескриптор не
 * переживає перезавантаження — читання його з IndexedDB вбиває браузер
 * (заміряно, див. `localSource.ts`). Через це папку доводилося обирати щоразу.
 *
 * Тут обох меж немає за побудовою. Нативний застосунок тримає ЗВИЧАЙНИЙ ШЛЯХ:
 * рядок, який можна записати в налаштування й прочитати завтра. Нічого не
 * ламається, бо ламатися нема чому — дескрипторів у цьому світі не існує.
 *
 * ## Чому окремий клас, а не гілка в наявному
 *
 * Спільного коду тут майже немає: інший спосіб обійти папку, інший спосіб
 * прочитати файл, інша природа помилок. Спільним лишається те, що й мусить, —
 * `AudioSource`, за яким плеєр не бачить різниці, і розбір `audioremote.json`,
 * винесений у `boardConfig.parseConfig`.
 *
 * ## Модулі Tauri вантажаться ЛИШЕ ТУТ і ЛИШЕ В ЗАСТОСУНКУ
 *
 * Сторінку віддає той самий сайт, що й телефонам, — той самий бандл. Статичний
 * імпорт `@tauri-apps/*` означав би, що кожен телефон качає код, який у
 * браузері не робить нічого. Тому імпорти динамічні: у браузері цей шматок не
 * завантажується жодного разу.
 */

/** Ключ у сховищі. Шлях, а не дескриптор, — тому звичайний рядок. */
const FOLDER_KEY = 'tauriFolder';

/** Глибина обходу підпапок — та сама, що у джерелі на дескрипторі. */
const MAX_DEPTH = 6;
const MAX_TRACKS = 2000;

/**
 * Чи ми всередині застосунку на комп'ютері.
 *
 * Перевіряється НАЯВНІСТЬ МОСТА, а не рядок `navigator.userAgent`: агент у
 * WebView2 такий самий, як у Edge, і за ним відрізнити неможливо.
 */
export const runningInTauri = (): boolean =>
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Розділювач шляху на цій системі. Windows приймає й `/`, тож досить одного. */
const join = (...parts: string[]): string => parts.filter(Boolean).join('/');

/** MIME за розширенням: `<audio>` мусить знати, що йому дали. */
const mimeOf = (name: string): string => {
	const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
	if (ext === 'mp3') return 'audio/mpeg';
	if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
	if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'audio/ogg';
	if (ext === 'wav') return 'audio/wav';
	if (ext === 'flac') return 'audio/flac';
	return 'audio/webm';
};

export class TauriFolderSource implements AudioSource {
	readonly supported = runningInTauri();

	/** Шлях до папки. Читається зі сховища одразу — у цьому вся суть. */
	private root: string | null = readItem(FOLDER_KEY);

	get label(): string | null {
		if (!this.root) return null;
		const parts = this.root.split(/[\\/]/).filter(Boolean);
		return parts[parts.length - 1] ?? this.root;
	}

	/**
	 * Стан БЕЗ ЖОДНОГО ЗАПИТАННЯ.
	 *
	 * Саме заради цього рядка все й робилося: якщо шлях записаний і папка на
	 * місці — застосунок готовий грати ще до того, як людина щось натисне.
	 * Папки може не бути: флешку витягли, мережевий диск не підключився. Тоді
	 * це `none` — тобто «оберіть папку», а не помилка.
	 */
	async status(): Promise<SourceStatus> {
		if (!this.supported) return 'unsupported';
		if (!this.root) return 'none';

		const { exists } = await import('@tauri-apps/plugin-fs');
		try {
			return (await exists(this.root)) ? 'ready' : 'none';
		} catch {
			return 'none';
		}
	}

	async pick(): Promise<boolean> {
		if (!this.supported) return false;
		mark('pick:open');

		const { open } = await import('@tauri-apps/plugin-dialog');
		const picked = await open({ directory: true, multiple: false, title: 'Папка з музикою' });
		// Людина закрила діалог — це відповідь «ні», а не помилка.
		if (typeof picked !== 'string') {
			mark('pick:cancelled');
			return false;
		}

		this.root = picked;
		writeItem(FOLDER_KEY, picked);
		mark(`pick:ok ${this.label}`);
		return true;
	}

	/** Забути папку. Потрібне рівно тоді, коли її хочуть змінити назавжди. */
	forget(): void {
		this.root = null;
		writeItem(FOLDER_KEY, '');
	}

	async scan(): Promise<SourceTrack[]> {
		if (!this.root) throw new Error('папку не обрано');
		mark('scan:start');

		const { readDir } = await import('@tauri-apps/plugin-fs');
		const found: { title: string; path: string }[] = [];

		const walk = async (directory: string, prefix: string, depth: number) => {
			if (depth > MAX_DEPTH || found.length >= MAX_TRACKS) return;

			for (const entry of await readDir(directory)) {
				if (found.length >= MAX_TRACKS) return;
				// Службові папки на кшталт `.git` чи `__MACOSX` музики не містять.
				if (entry.name.startsWith('.') || entry.name.startsWith('__')) continue;

				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				if (entry.isDirectory) {
					await walk(join(directory, entry.name), path, depth + 1);
				} else if (isAudioFile(entry.name)) {
					found.push({ title: titleFromName(entry.name), path });
				}
			}
		};

		await walk(this.root, '', 0);
		mark(`scan:found ${found.length}`);

		const tracks = await Promise.all(
			found.map(async (entry) => ({ ...entry, id: await trackIdFromPath(entry.path) }))
		);

		// Порядок — за назвою й українськими правилами: список читає людина.
		return tracks.sort((left, right) => left.title.localeCompare(right.title, 'uk'));
	}

	async open(path: string): Promise<File> {
		if (!this.root) throw new TrackMissingError(path);

		const { readFile } = await import('@tauri-apps/plugin-fs');
		const name = path.split('/').pop() ?? path;

		try {
			const bytes = await readFile(join(this.root, path));
			return new File([bytes], name, { type: mimeOf(name) });
		} catch {
			/*
			 * Файл прибрали або перейменували між перечитуванням і натисканням.
			 * Це звичайна річ, а не поломка: людина працює з тією самою папкою в
			 * провіднику. Пульт мусить побачити саме «файл зник» — бо дія тут
			 * очевидна: перечитати папку.
			 */
			throw new TrackMissingError(path);
		}
	}

	async readConfig(): Promise<BoardConfig> {
		if (!this.root) return emptyConfig();

		const { readTextFile } = await import('@tauri-apps/plugin-fs');
		try {
			const config = parseConfig(await readTextFile(join(this.root, CONFIG_FILE)));
			mark(`config:read ${config.tracks.length}`);
			return config;
		} catch {
			// Файлу немає — папка новенька. Це не помилка.
			mark('config:none');
			return emptyConfig();
		}
	}

	async writeConfig(config: BoardConfig): Promise<boolean> {
		if (!this.root) return false;

		const { writeTextFile } = await import('@tauri-apps/plugin-fs');
		try {
			await writeTextFile(join(this.root, CONFIG_FILE), serializeConfig(config));
			mark(`config:write ${config.tracks.length}`);
			return true;
		} catch (error) {
			// Папка лише на читання — застосунок далі працює, підписи живуть до
			// кінця сеансу. Сторінка каже про це один раз.
			mark(`config:write-failed ${String(error).slice(0, 60)}`);
			return false;
		}
	}
}
