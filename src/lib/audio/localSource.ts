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
 * ТЕКА НА ЦЬОМУ КОМП'ЮТЕРІ — через дескриптор, а не через шлях.
 *
 * ## Чому «шлях до файлу» неможливий у принципі
 *
 * Сторінка не може відкрити `D:\Музика\вихід.mp3`. Ні з дозволом, ні у
 * встановленій PWA, ні за схемою `file://` — це межа браузера, а не брак
 * налаштування. Єдине, що сторінка може отримати, — ДЕСКРИПТОР, який людина
 * видала їй сама через діалог. Дескриптор не є шляхом: із нього не дізнатися,
 * де тека лежить, і його не можна ні набрати руками, ні передати на інший
 * пристрій.
 *
 * Тому в базі немає ні шляхів, ні файлів — лише назви й шляхи ВСЕРЕДИНІ теки,
 * які без дескриптора не означають нічого.
 *
 * ## Чому тека, а не окремі файли
 *
 * Один дозвіл замість сотні. Людина обирає теку раз, і всі треки в ній —
 * включно з тими, які вона додасть завтра, — стають доступні без жодного
 * додаткового кроку.
 *
 * ## Дозвіл переживає перезапуск браузера НЕ ЗАВЖДИ
 *
 * Дескриптор зберігається в IndexedDB і справді переживає перезапуск. А от
 * ДОЗВІЛ читати — рішення браузера: Chrome може попросити підтвердити його
 * знову, і підтвердження вимагає жесту людини. Тому `status()` окремо розрізняє
 * «тека є, потрібне підтвердження» й «теки немає»: перше лікується одним
 * натисканням, друге — вибором теки заново, і плутати їх в інтерфейсі означало
 * б відправляти людину шукати теку там, де досить кліку.
 */

const DB_NAME = 'audioremote';
const DB_VERSION = 1;
const STORE = 'folders';

/** Глибина обходу підтек. Захист від теки, у яку хтось поклав увесь диск. */
const MAX_DEPTH = 6;

/** Стеля кількості треків. Більше — і бібліотека не влізе в один запис RTDB. */
export const MAX_TRACKS = 2000;

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB недоступна'));
	});
}

async function idbGet(key: string): Promise<FileSystemDirectoryHandle | null> {
	const db = await openDb();
	return new Promise((resolve) => {
		const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
		request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) ?? null);
		request.onerror = () => resolve(null);
	});
}

async function idbSet(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(handle, key);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error('не вдалося зберегти дескриптор'));
	});
}

export class LocalFolderSource implements AudioSource {
	/**
	 * Підтримка перевіряється по `showDirectoryPicker`, а не по назві браузера.
	 * Список браузерів застаріває сам; наявність функції — ні.
	 */
	readonly supported =
		typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

	private handle: FileSystemDirectoryHandle | null = null;

	/** Ключ дошки: у кожної дошки своя тека на цьому комп'ютері. */
	constructor(private readonly boardKey: string) {}

	get label(): string | null {
		return this.handle?.name ?? null;
	}

	private async permission(request: boolean): Promise<PermissionState> {
		if (!this.handle) return 'denied';
		const descriptor = { mode: 'read' } as const;
		const current = (await this.handle.queryPermission?.(descriptor)) ?? 'granted';
		if (current === 'granted' || !request) return current;
		return (await this.handle.requestPermission?.(descriptor)) ?? 'denied';
	}

	async status(): Promise<SourceStatus> {
		if (!this.supported) return 'unsupported';
		this.handle ??= await idbGet(this.boardKey);
		if (!this.handle) return 'none';
		return (await this.permission(false)) === 'granted' ? 'ready' : 'need-permission';
	}

	async pick(): Promise<boolean> {
		if (!window.showDirectoryPicker) return false;
		try {
			/*
			 * `id` дає браузеру змогу відкрити діалог там, де його закрили минулого
			 * разу. `startIn: 'music'` — перше відкриття: людина майже напевно шукає
			 * теку з музикою, і починати з «Цей комп'ютер» означає зайві три кліки.
			 */
			const handle = await window.showDirectoryPicker({
				id: 'audioremote-library',
				mode: 'read',
				startIn: 'music'
			});
			this.handle = handle;
			await idbSet(this.boardKey, handle);
			return true;
		} catch (error) {
			// Людина закрила діалог — це відповідь «ні», а не помилка.
			if (error instanceof DOMException && error.name === 'AbortError') return false;
			throw error;
		}
	}

	async restore(): Promise<boolean> {
		this.handle ??= await idbGet(this.boardKey);
		if (!this.handle) return false;
		return (await this.permission(true)) === 'granted';
	}

	async scan(): Promise<SourceTrack[]> {
		if (!this.handle) throw new Error('теку не обрано');

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
