/**
 * Типи File System Access API, яких немає в `lib.dom.d.ts`.
 *
 * TypeScript описує `FileSystemDirectoryHandle`, але не описує ні
 * `showDirectoryPicker()`, ні дозволи (`queryPermission`/`requestPermission`),
 * ні обхід теки (`entries()`) — усе це належить до специфікації File System
 * Access, яку TS ще не включив у стандартну бібліотеку.
 *
 * Оголошення тут НАВМИСНО вузькі: рівно те, чим користується
 * `localSource.ts`, і нічого понад. Широке `any` зняло б перевірку саме там, де
 * помилка найдорожча — у роботі з файлами людини.
 */

interface FileSystemHandlePermissionDescriptor {
	mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
	queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
	requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
	/**
	 * Пари «ім'я → дескриптор» для вмісту теки.
	 *
	 * Асинхронний ітератор, а не масив: тека може містити десятки тисяч записів,
	 * і браузер віддає їх поступово. Саме тому обхід у `localSource.ts` має
	 * власні межі — глибини й кількості.
	 */
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
	getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
	getFileHandle(name: string): Promise<FileSystemFileHandle>;
}

interface DirectoryPickerOptions {
	id?: string;
	mode?: 'read' | 'readwrite';
	startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

interface Window {
	showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
