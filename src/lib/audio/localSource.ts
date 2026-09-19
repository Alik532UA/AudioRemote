import {
	isAudioFile,
	titleFromName,
	TrackMissingError,
	trackIdFromPath,
	type AudioSource,
	type SourceStatus,
	type SourceTrack
} from './source';
import { mark } from '$lib/services/breadcrumbs';

/**
 * ТЕКА НА ЦЬОМУ КОМП'ЮТЕРІ — через дескриптор, а не через шлях.
 *
 * ## Чому «шлях до файлу» неможливий у принципі
 *
 * Сторінка не може відкрити `D:\Музика\вихід.mp3`. Ні з дозволом, ні у
 * встановленій PWA, ні за схемою `file://` — це межа браузера, а не брак
 * налаштування. Єдине, що сторінка може отримати, — ДЕСКРИПТОР, який людина
 * видала їй сама через діалог.
 *
 * ## ЧОМУ ДЕСКРИПТОР НЕ ЗБЕРІГАЄТЬСЯ МІЖ ЗАВАНТАЖЕННЯМИ СТОРІНКИ
 *
 * Документований спосіб це зробити один: покласти дескриптор в IndexedDB. Саме
 * так тут і було. **І саме це вбивало браузер.**
 *
 * Заміряно 2026-09-19 на трьох рушіях — Chromium від Playwright, справжній
 * Chrome і Edge, усі на цій машині. Послідовність однакова й відтворюється
 * щоразу:
 *
 * | Крок | Результат |
 * |---|---|
 * | `navigator.storage.getDirectory()` | ок |
 * | `getDirectoryHandle()` | ок |
 * | `indexedDB.open()` | ок |
 * | `put(дескриптор)` | ок |
 * | **`get(дескриптор)`** | **рендерер гине** |
 *
 * Це чистий API браузера: у пробі (`.private/probe-idb3.mjs`) немає жодного
 * рядка нашого коду. Запис проходить, читання вбиває вкладку — тобто база
 * ОТРУЮЄТЬСЯ, і кожне наступне відкриття дошки падає знову. Автор описав це
 * точно: гине лише та кімната, де тека була підключена, і досить просто
 * оновити сторінку.
 *
 * Перехопити це неможливо: смерть рендерера — не виняток, `try/catch` її не
 * бачить. Єдиний спосіб не впасти — не робити цієї операції.
 *
 * **Ціна названа прямо:** теку доведеться обирати щоразу після перезавантаження
 * сторінки. Один діалог на сеанс проти вкладки, яка не відкривається взагалі, —
 * обмін не рівний, але й вибору тут немає.
 *
 * **Коли це можна буде повернути.** Коли та сама проба перестане валити
 * браузер. Вона лежить у `.private/` саме для того, щоб це можна було
 * перевірити одним запуском, а не здогадуватися.
 *
 * ## Чому тека, а не окремі файли
 *
 * Один дозвіл замість сотні. Людина обирає теку раз за сеанс, і всі треки в
 * ній — включно з доданими вчора — доступні без жодного додаткового кроку.
 */

/** Глибина обходу підтек. Захист від теки, у яку хтось поклав увесь диск. */
const MAX_DEPTH = 6;

/** Стеля кількості треків. Більше — і бібліотека не влізе в один запис RTDB. */
export const MAX_TRACKS = 2000;

/** Назва бази, у якій дескриптори лежали доти. Тепер вона лише видаляється. */
const LEGACY_DB = 'audioremote';

/**
 * Прибрати отруєну базу.
 *
 * У того, хто вже користувався застосунком, у ній лежить дескриптор — і будь-яке
 * ЧИТАННЯ цього запису валить вкладку. Видалення бази читанням не є: воно
 * перевірене тією ж пробою й проходить без наслідків.
 *
 * Кличеться раз на завантаження застосунку. Якщо бази немає, виклик нічого не
 * робить і нічого не коштує.
 */
export function purgeLegacyHandles(): void {
	if (typeof indexedDB === 'undefined') return;
	mark('purge:start');
	const request = indexedDB.deleteDatabase(LEGACY_DB);
	request.onsuccess = () => mark('purge:done');
	request.onerror = () => mark('purge:error');
	request.onblocked = () => mark('purge:blocked');
}

export class LocalFolderSource implements AudioSource {
	/**
	 * Підтримка перевіряється по `showDirectoryPicker`, а не по назві браузера.
	 * Список браузерів застаріває сам; наявність функції — ні.
	 */
	readonly supported =
		typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

	/** Живе лише в памʼяті сторінки. Перезавантаження — і теку обирають заново. */
	private handle: FileSystemDirectoryHandle | null = null;

	get label(): string | null {
		return this.handle?.name ?? null;
	}

	async status(): Promise<SourceStatus> {
		if (!this.supported) return 'unsupported';
		return this.handle ? 'ready' : 'none';
	}

	async pick(): Promise<boolean> {
		if (!window.showDirectoryPicker) return false;
		mark('pick:open');
		try {
			/*
			 * `id` дає браузеру змогу відкрити діалог там, де його закрили минулого
			 * разу, — це єдине, що лишилося від «памʼяті» після відмови від
			 * збереження дескриптора. `startIn: 'music'` — для першого відкриття.
			 */
			this.handle = await window.showDirectoryPicker({
				id: 'audioremote-library',
				mode: 'read',
				startIn: 'music'
			});
			mark(`pick:ok ${this.handle.name}`);
			return true;
		} catch (error) {
			// Людина закрила діалог — це відповідь «ні», а не помилка.
			if (error instanceof DOMException && error.name === 'AbortError') {
				mark('pick:cancelled');
				return false;
			}
			mark(`pick:error ${String(error).slice(0, 60)}`);
			throw error;
		}
	}

	async scan(): Promise<SourceTrack[]> {
		if (!this.handle) throw new Error('теку не обрано');
		mark('scan:start');

		const found: { title: string; path: string }[] = [];

		const walk = async (directory: FileSystemDirectoryHandle, prefix: string, depth: number) => {
			if (depth > MAX_DEPTH || found.length >= MAX_TRACKS) return;

			for await (const [name, entry] of directory.entries()) {
				if (found.length >= MAX_TRACKS) return;
				// Службові теки на кшталт `.git` чи `__MACOSX` музики не містять.
				if (name.startsWith('.') || name.startsWith('__')) continue;

				const path = prefix ? `${prefix}/${name}` : name;
				if (entry.kind === 'directory') {
					await walk(entry as FileSystemDirectoryHandle, path, depth + 1);
				} else if (isAudioFile(name)) {
					found.push({ title: titleFromName(name), path });
				}
			}
		};

		await walk(this.handle, '', 0);
		mark(`scan:found ${found.length}`);

		const tracks = await Promise.all(
			found.map(async (entry) => ({ ...entry, id: await trackIdFromPath(entry.path) }))
		);

		// Порядок — за назвою й українськими правилами: список читає людина.
		return tracks.sort((left, right) => left.title.localeCompare(right.title, 'uk'));
	}

	async open(path: string): Promise<File> {
		if (!this.handle) throw new TrackMissingError(path);

		const parts = path.split('/');
		const fileName = parts.pop();
		if (!fileName) throw new TrackMissingError(path);

		try {
			let directory = this.handle;
			for (const part of parts) directory = await directory.getDirectoryHandle(part);
			return await (await directory.getFileHandle(fileName)).getFile();
		} catch (error) {
			/*
			 * Файл прибрали або перейменували між перечитуванням і натисканням.
			 * Це звичайна річ, а не поломка: людина працює з тією самою текою в
			 * провіднику. Пульт мусить побачити саме «файл зник», а не «щось пішло
			 * не так», — бо дія тут очевидна: перечитати теку.
			 */
			if (error instanceof DOMException && error.name === 'NotFoundError') {
				throw new TrackMissingError(path);
			}
			throw error;
		}
	}
}
