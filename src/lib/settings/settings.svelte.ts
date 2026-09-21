import { normalizeBoardId, normalizePassword } from '$lib/board/secret';
import { readJson, writeJson } from '$lib/services/storage';
import { isStartBoard, isStartPage, type StartBoard, type StartPage } from './startPage.svelte';

/**
 * НАЛАШТУВАННЯ — і головне з них: СТАЛА ПАРА (ідентифікатор, пароль).
 *
 * ## Навіщо це взагалі
 *
 * Типовий шлях створює нову дошку щоразу: новий ідентифікатор, новий пароль, і
 * колегам треба диктувати їх заново. Для школи, де «Зал 2» — це та сама кімната
 * щодня, це зайва робота на порожньому місці. Стала пара робить дошку постійною:
 * один раз записали на папірці біля комп'ютера — і все.
 *
 * ## Що з цього випливає, і це треба казати людині прямо
 *
 * Адреса дошки виводиться з пари. Отже стала пара означає СТАЛУ АДРЕСУ: кнопка
 * «Створити» більше нічого не створює, вона відкриває ту саму дошку. Це не
 * побічний ефект, а рівно те, чого просили, — але людина, яка цього не знає,
 * вирішить, що застосунок зламався й «не створює нову».
 *
 * Друге: один пароль на всі дошки означає, що витік одного відкриває всі. Для
 * однієї кімнати на школу це прийнятно; сторінка налаштувань каже про це рядком,
 * а не мовчить.
 *
 * ## Чому порожнє поле — це теж відповідь
 *
 * Порожній рядок означає «генерувати щоразу», тобто типову поведінку. Окремого
 * прапорця «використовувати сталу пару» немає навмисно: він був би другим
 * джерелом того самого факту й неминуче розійшовся б із самими значеннями.
 */

const STORAGE_KEY = 'settings';

/** Довше імʼя не вміщається в рядок журналу, а рядок там і так найширший. */
export const MAX_NAME = 24;

export interface StoredSettings {
	/** Сталий ідентифікатор. Порожній — генерувати щоразу. */
	fixedBoardId: string;
	/** Сталий пароль. Порожній — генерувати щоразу. */
	fixedPassword: string;
	/** Що відкривати при запуску. Див. `startPage.svelte.ts`. */
	startPage: StartPage;
	/** Яку дошку відкривати, коли обрано пульт або підключення. */
	startBoard: StartBoard;
	/** Пара для «певної дошки». Порожня — «певної» немає. */
	startBoardId: string;
	startBoardPassword: string;
	/** Позначати в списку треки, які запускаються за API. */
	showTrigger: boolean;
	/**
	 * Показувати в меню розділ інфодошки.
	 *
	 * Другий вид дошки ще добудовується, і до першої перевірки в залі він не
	 * мусить траплятися на очі тому, хто прийшов увімкнути музику. Це НЕ прапорець
	 * складання: маршрути існують завжди, і відкрити їх адресою можна й без
	 * галочки. Ховається саме вхід.
	 */
	showInfoBoards: boolean;
	/**
	 * Чи показувати попередження перед вибором папки.
	 *
	 * Зберігається САМЕ ЗГОДА, а не її відсутність: типове значення `true`
	 * означає «показати», і чистий браузер веде себе як перший запуск, а не як
	 * той, кому вже пояснили.
	 */
	folderHint: boolean;
	/**
	 * ЯК ПІДПИСУВАТИ СВОЇ ДІЇ В ЖУРНАЛІ. Порожньо — анонімно, як і було.
	 *
	 * Вхід у застосунок лишається анонімним: пароль знає дошка, а не людина, і
	 * заводити облікові записи заради підпису в журналі означало б платити
	 * реєстрацією за одне слово. Але журнал на три помічники без імен
	 * відповідає лише на «що просили», а питають у нього й «хто» — бо просять
	 * різні люди з різних кутів зали.
	 *
	 * Тому імʼя ЛОКАЛЬНЕ й добровільне: воно їде разом із проханням, ніде не
	 * перевіряється й нічого не відкриває. Це підпис, а не посвідчення.
	 */
	displayName: string;
}

const EMPTY: StoredSettings = {
	fixedBoardId: '',
	fixedPassword: '',
	startPage: 'menu',
	startBoard: 'last',
	startBoardId: '',
	startBoardPassword: '',
	showTrigger: true,
	showInfoBoards: false,
	folderHint: true,
	displayName: ''
};

class SettingsState {
	fixedBoardId = $state('');
	fixedPassword = $state('');
	startPage = $state<StartPage>('menu');
	startBoard = $state<StartBoard>('last');
	startBoardId = $state('');
	startBoardPassword = $state('');
	showTrigger = $state(true);
	showInfoBoards = $state(false);
	folderHint = $state(true);
	displayName = $state('');

	/**
	 * Чи налаштована стала пара.
	 *
	 * ОБИДВА значення, а не будь-яке: адреса виводиться з пари, тож половина
	 * пари не дає нічого. Заповнене одне поле означало б дошку, у якої стала
	 * половина адреси, — тобто той самий випадковий результат щоразу, але з
	 * відчуттям, що налаштування діє.
	 */
	get hasFixedPair(): boolean {
		return (
			normalizeBoardId(this.fixedBoardId).length > 0 &&
			normalizePassword(this.fixedPassword).length > 0
		);
	}

	load(): void {
		const stored = readJson<StoredSettings>(STORAGE_KEY, EMPTY);
		this.fixedBoardId = typeof stored.fixedBoardId === 'string' ? stored.fixedBoardId : '';
		this.fixedPassword = typeof stored.fixedPassword === 'string' ? stored.fixedPassword : '';
		// Невідоме значення — це або чужа версія, або зіпсуте сховище: меню
		// безпечне в обох випадках.
		this.startPage = isStartPage(stored.startPage) ? stored.startPage : 'menu';
		this.startBoard = isStartBoard(stored.startBoard) ? stored.startBoard : 'last';
		this.startBoardId = typeof stored.startBoardId === 'string' ? stored.startBoardId : '';
		this.startBoardPassword =
			typeof stored.startBoardPassword === 'string' ? stored.startBoardPassword : '';
		this.showTrigger = stored.showTrigger !== false;
		// Типово ВИМКНЕНО: новий розділ з'являється лише тоді, коли його попросили.
		this.showInfoBoards = stored.showInfoBoards === true;
		// Типово УВІМКНЕНО: мовчить лише той, хто сам попросив мовчати.
		this.folderHint = stored.folderHint !== false;
		this.displayName =
			typeof stored.displayName === 'string' ? stored.displayName.slice(0, MAX_NAME) : '';
	}

	/**
	 * Зберегти ЧАСТИНУ налаштувань, решту лишити як є.
	 *
	 * Спершу метод брав пару позиційно (`save(id, password)`) і писав увесь
	 * об'єкт. Третє налаштування на такому підписі означало б правку кожного
	 * місця виклику — і тихо затирало б себе з того, яке забули виправити.
	 */
	save(patch: Partial<StoredSettings>): void {
		if (patch.fixedBoardId !== undefined) this.fixedBoardId = patch.fixedBoardId;
		if (patch.fixedPassword !== undefined) this.fixedPassword = patch.fixedPassword;
		if (patch.startPage !== undefined) this.startPage = patch.startPage;
		if (patch.startBoard !== undefined) this.startBoard = patch.startBoard;
		if (patch.startBoardId !== undefined) this.startBoardId = patch.startBoardId;
		if (patch.startBoardPassword !== undefined) this.startBoardPassword = patch.startBoardPassword;
		if (patch.showTrigger !== undefined) this.showTrigger = patch.showTrigger;
		if (patch.showInfoBoards !== undefined) this.showInfoBoards = patch.showInfoBoards;
		if (patch.folderHint !== undefined) this.folderHint = patch.folderHint;
		if (patch.displayName !== undefined) this.displayName = patch.displayName.slice(0, MAX_NAME);

		writeJson(STORAGE_KEY, {
			fixedBoardId: this.fixedBoardId,
			fixedPassword: this.fixedPassword,
			startPage: this.startPage,
			startBoard: this.startBoard,
			startBoardId: this.startBoardId,
			startBoardPassword: this.startBoardPassword,
			showTrigger: this.showTrigger,
			showInfoBoards: this.showInfoBoards,
			folderHint: this.folderHint,
			displayName: this.displayName
		} satisfies StoredSettings);
	}

	clear(): void {
		this.save({ fixedBoardId: '', fixedPassword: '' });
	}
}

export const settings = new SettingsState();
