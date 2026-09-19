import type { Auth } from 'firebase/auth';
import type { Database } from 'firebase/database';

/**
 * ПІД'ЄДНАННЯ ДО FIREBASE — ліниве, анонімне й одне на застосунок.
 *
 * ## Чому імпорти динамічні
 *
 * Пакет `firebase` важить більше за весь інший код застосунку разом. Статичний
 * імпорт поклав би його в спільний чанк, і навіть перший екран із двома
 * кнопками тягнув би SDK бази. Тут він приїжджає рівно тоді, коли дошку
 * відкривають.
 *
 * ## Чому НІЧОГО не виконується на імпорті модуля
 *
 * `initializeApp` живе у функції, а не в тілі модуля. Синглтон, чий конструктор
 * піднімає SDK, робить це на ІМПОРТІ — і будь-який тест, який транзитивно тягне
 * цей модуль, починає вимагати бойових ключів, щоб узагалі зібратися.
 *
 * ## Чому анонімний вхід
 *
 * Правила бази вимагають `auth != null` скрізь — інакше будь-хто без жодного
 * токена писав би в будь-яку дошку, адресу якої дізнався. Але акаунт тут не
 * несе ЖОДНОЇ ідентичності: доступ до дошки дає знання пари (ідентифікатор,
 * пароль), а не те, хто ти. Анонімний вхід — рівно те, що потрібно: він дає
 * `uid`, яким правило підписує записи, і не вимагає від людини нічого.
 *
 * Наслідок названо прямо: `uid` живе у профілі браузера. Очищення даних сайту
 * робить із власника дошки стороннього. Разом із тим очищенням зникають і
 * дескриптори теки в IndexedDB, тобто дошку однаково доведеться налаштовувати
 * заново — обидві втрати збігаються, і саме тому окремого механізму
 * «не загубити акаунт» тут немає.
 */

const USE_EMULATOR = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

const CONFIG = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

export interface Connection {
	uid: string;
	db: Database;
}

let pending: Promise<Connection> | null = null;

export class ConfigMissingError extends Error {
	constructor(what: string) {
		super(`Firebase не налаштований: немає ${what}`);
		this.name = 'ConfigMissingError';
	}
}

/** База не відповідає. `emulator` — чи це локальний емулятор, якого не підняли. */
export class ConnectionDownError extends Error {
	constructor(readonly emulator: boolean) {
		super(emulator ? 'емулятор Firebase не запущено' : 'база не відповідає');
		this.name = 'ConnectionDownError';
	}
}

async function connectOnce(): Promise<Connection> {
	if (!CONFIG.projectId) throw new ConfigMissingError('VITE_FIREBASE_PROJECT_ID');
	/*
	 * ВІДСУТНЯ АДРЕСА БАЗИ — це не «типове значення», а зламаний застосунок.
	 *
	 * SDK у такому разі виводить адресу з `projectId` і йде на американську
	 * `<projectId>-default-rtdb.firebaseio.com`. Наша база живе не там, а CSP
	 * дозволяє лише `*.firebasedatabase.app`. Скарги при цьому не буде: SDK не
	 * знає, що адреса «не та», — він просто йде за нею.
	 */
	if (!CONFIG.databaseURL) throw new ConfigMissingError('VITE_FIREBASE_DATABASE_URL');

	const [{ getApps, initializeApp }, authModule, dbModule] = await Promise.all([
		import('firebase/app'),
		import('firebase/auth'),
		import('firebase/database')
	]);

	const app = getApps()[0] ?? initializeApp(CONFIG);

	/*
	 * ЛИШЕ ВЕБСОКЕТ.
	 *
	 * RTDB починає з'єднання не з вебсокета, а з довгого опитування, і робить
	 * це вставлянням тега `<script src=".../.lp?…">` через `document.write`.
	 * Тобто початковий транспорт потрапляє під `script-src`, а не під
	 * `connect-src`, — і наша політика його не дозволяє. До вебсокета справа не
	 * доходила б ніколи: SDK підвищує транспорт лише ПІСЛЯ вдалого опитування.
	 *
	 * Розширювати `script-src` доменом бази не можна: це дозвіл виконувати
	 * будь-який скрипт звідти, тобто рівно те, від чого політика й захищає.
	 */
	dbModule.forceWebSockets();

	const auth: Auth = authModule.getAuth(app);
	const db: Database = dbModule.getDatabase(app);

	if (USE_EMULATOR) {
		authModule.connectAuthEmulator(auth, 'http://127.0.0.1:9119', { disableWarnings: true });
		dbModule.connectDatabaseEmulator(db, '127.0.0.1', 9020);
	}

	/*
	 * `authStateReady()`, а не читання `auth.currentUser` одразу.
	 *
	 * Сесія лежить в IndexedDB і читається асинхронно, тож `currentUser` на
	 * першому такті ЗАВЖДИ `null`. Питати його синхронно означає питати не
	 * «чи ми ввійшли», а «чи встигло прочитатися», і відповідь завжди «ні»: далі
	 * йшов би новий анонімний вхід, а дошки лишалися б під попереднім `uid`.
	 */
	await auth.authStateReady();

	try {
		const user = auth.currentUser ?? (await authModule.signInAnonymously(auth)).user;
		return { uid: user.uid, db };
	} catch (error) {
		/*
		 * НАЙЧАСТІША ВІДМОВА В РОЗРОБЦІ — не помилка коду, а незапущений
		 * емулятор. У консолі вона виглядає страшно (`ERR_CONNECTION_REFUSED`
		 * плюс двадцять рядків стека Firebase SDK), а в інтерфейсі доти не
		 * з'являлося нічого зрозумілого взагалі.
		 *
		 * Тому вона перетворюється на власний тип із власним текстом: «підніміть
		 * емулятор» — це дія, а `auth/network-request-failed` — ні.
		 */
		const code = (error as { code?: string }).code ?? '';
		if (code.includes('network') || error instanceof TypeError) {
			throw new ConnectionDownError(USE_EMULATOR);
		}
		throw error;
	}
}

/** Під'єднатися. Повторні виклики повертають ту саму обіцянку. */
export function connect(): Promise<Connection> {
	pending ??= connectOnce().catch((error: unknown) => {
		// Невдала спроба не має ставати вічною: наступний виклик пробує знову.
		pending = null;
		throw error;
	});
	return pending;
}

/** Чи працюємо з емулятором — для чесного напису в інтерфейсі. */
export const isEmulator = (): boolean => USE_EMULATOR;
