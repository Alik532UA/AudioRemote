/**
 * ЧЕКЛИСТ БЕТА-ТЕСТУ — ДАНІ (BETA-CHECKLIST-v9).
 *
 * Половину роботи автоматичні перевірки не роблять і не зроблять: чи чутно
 * плавне згасання, чи бачать двоє людей на двох пристроях ту саму дошку, чи
 * намацується клавіша наосліп у темному залі, чи не перекриває сітка кнопок
 * пальця на планшеті. Ця половина доти не мала власника — і людина, яка
 * згодилася потикати застосунок, вигадувала собі роботу сама.
 *
 * ## Чому дані, а не документ
 *
 * Текстовий чеклист ніхто не звіряє з кодом: він застаріває мовчки й починає
 * казати «перевірено» про те, чого вже немає. Тут кожен пункт — запис, який
 * читають інваріанти (`beta-checklist.test.ts`): вкладка мусить накривати
 * маршрут, «натисніть» мусить називати локатор або клавішу, `covered` мусить
 * називати файл тесту, який існує.
 *
 * ## Пункти писані ПІСЛЯ читання коду
 *
 * Не з нотаток і не з памʼяті (BETA-CHECKLIST-v9 § 7.2). Нотатки автора
 * описують намір, а намір і реалізація розходяться: розділ інфодошки в меню
 * планувався як «видно на dev, сховано на prod», а зроблений перемикачем у
 * налаштуваннях без поділу середовищ — і пункт описує саме перемикач. Так само
 * пароль лишився з українських слів, хоч у нотатках стоїть «англійські».
 * Джерело правди — код.
 *
 * ## Чому тексти тут, а не у словнику інтерфейсу
 *
 * Їх пʼятий десяток, вони змінюються іншим циклом, а словник під гейтом
 * паритету — кожна правка коштувала б двох мов інтерфейсу плюс мертвих ключів
 * (`unused.test.ts`). Тут дві мови лежать в ОДНОМУ записі, і відповідність
 * вимагає тип, а не окреме правило.
 */

/** Рядок двома мовами. Третьої не буває: відповідність тримає тип. */
export interface Localized {
	uk: string;
	en: string;
}

/**
 * Чи може цей пункт перевірити машина.
 *
 * `testable` — це не «колись зробимо», а готовий беклог: перелік із назвами
 * того, чого бракує. `covered` лишається в списку контрольною групою: помилка,
 * знайдена в покритому місці, — звіт про дефект ТЕСТА, і новина це гірша за
 * звичайний баг.
 */
export type Coverage = 'manual' | 'testable' | 'covered';

export interface BetaCheck {
	/** Стабільний назавжди: у ньому лежить чужий прогрес. Форма `{вкладка}_{номер}`. */
	id: string;
	category: Localized;
	text: Localized;
	coverage: Coverage;
	/** Файл тесту. Обовʼязковий для `covered`, заборонений для решти. */
	test?: string;
	/** Локатор елемента, який просять натиснути. */
	testid?: string;
	/** Або код клавіші (`KeyboardEvent.code`), коли тиснуть клавішу, а не елемент. */
	key?: string;
	/** Перевірка МЕЖІ: «не мусить». Без неї ліміт, що відмовив, виглядає як робочий. */
	negative?: true;
}

/**
 * Сторінки застосунку — перелічені ТИПОМ, а не рядком.
 *
 * Це не педантизм: перейменований маршрут ламає збірку тут, а не мовчки
 * перетворює посилання з пункта на 404. Другу половину обіцянки — що жодна
 * сторінка не лишилася без вкладки — тримає інваріант, який читає теку
 * маршрутів із диска.
 */
export type BetaRoute =
	| '/'
	| '/menu'
	| '/create'
	| '/connect'
	| '/player'
	| '/remote'
	| '/info'
	| '/info-remote'
	| '/settings';

export interface BetaTab {
	id: string;
	title: Localized;
	/**
	 * Сторінки, які накриває вкладка.
	 *
	 * Саме сторінки, а не екран словами: їхній перелік у проєкті вже є на диску,
	 * і забути його поповнити неможливо — без нього сторінки просто не буде.
	 * Другий список, узгоджений руками, розійшовся б із першим на першій же
	 * новій сторінці. Заразом із нього робляться посилання під вкладкою:
	 * найдовший крок тестувальника — не «прочитати пункт», а «знайти, де це».
	 */
	routes: readonly BetaRoute[];
	checks: readonly BetaCheck[];
}

/**
 * Сторінки, яким вкладки не потрібно, — явним переліком, а не відсутністю
 * рядка. Відсутність неможливо відрізнити від забуття.
 */
export const BETA_UNCOVERED_ROUTES: readonly string[] = [
	// Сама сторінка чеклиста: перевіряти чеклистом чеклист — це вкладка, яку
	// ніхто не відкриє. Її натомість накриває `tests/e2e/beta.spec.ts`.
	'/beta-test-checklists'
];

export const BETA_TABS: readonly BetaTab[] = [
	{
		id: 'start',
		title: { uk: 'Початок і підключення', en: 'Start and connecting' },
		routes: ['/', '/menu', '/create', '/connect'],
		checks: [
			{
				id: 'start_1',
				category: { uk: 'Меню', en: 'Menu' },
				text: {
					uk: 'Відкрийте адресу застосунку. Має зʼявитися меню з двома кнопками — «Створити» і «Підключитися».',
					en: 'Open the app address. A menu with two buttons must appear: Create and Connect.'
				},
				coverage: 'manual',
				testid: 'go-create'
			},
			{
				id: 'start_2',
				category: { uk: 'Створення', en: 'Creating' },
				text: {
					uk: 'Натисніть «Створити» й лишіть назву порожньою. Мають зʼявитися ідентифікатор із пʼяти великих літер і пароль із трьох слів та чотирьох цифр через дефіс.',
					en: 'Press Create and leave the name empty. A five-character identifier and a password of three words plus four digits, joined by hyphens, must appear.'
				},
				coverage: 'manual',
				testid: 'go-create'
			},
			{
				id: 'start_3',
				category: { uk: 'Створення', en: 'Creating' },
				text: {
					uk: 'В ідентифікаторі не мусить бути жодної з літер I, L, O та цифр 0 і 1: їх плутають на слух і на вигляд, тому їх у наборі немає.',
					en: 'The identifier must contain none of the letters I, L, O and none of the digits 0 and 1: they are confused by ear and by eye, so they are not in the alphabet.'
				},
				coverage: 'covered',
				test: 'src/lib/board/secret.test.ts',
				negative: true
			},
			{
				id: 'start_4',
				category: { uk: 'Підключення', en: 'Connecting' },
				text: {
					uk: 'На другому пристрої натисніть «Підключитися» і введіть ту саму пару. Має відкритися пульт, а в шапці — той самий ідентифікатор.',
					en: 'On a second device press Connect and enter the same pair. The remote must open, showing the same identifier in the header.'
				},
				coverage: 'manual',
				testid: 'connect-submit'
			},
			{
				id: 'start_5',
				category: { uk: 'Підключення', en: 'Connecting' },
				text: {
					uk: 'Введіть правильний ідентифікатор і будь-який інший пароль. Дошка відкритися НЕ мусить — має лишитися форма й напис про те, що дошку не знайдено.',
					en: 'Enter the correct identifier and any other password. The board must NOT open: the form must stay, with a message that the board was not found.'
				},
				coverage: 'manual',
				testid: 'connect-submit',
				negative: true
			},
			{
				id: 'start_6',
				category: { uk: 'Підключення', en: 'Connecting' },
				text: {
					uk: 'Введіть ідентифікатор маленькими літерами й із пробілами всередині, а пароль — латинськими літерами, схожими на українські. Дошка має відкритися так само.',
					en: 'Enter the identifier in lower case with spaces inside, and the password using Latin letters that look like the Ukrainian ones. The board must open all the same.'
				},
				coverage: 'covered',
				test: 'src/lib/board/secret.test.ts'
			},
			{
				id: 'start_7',
				category: { uk: 'Підключення', en: 'Connecting' },
				text: {
					uk: 'На плеєрі натисніть «Підключити пульт» і наведіть камеру другого пристрою на QR-код. Пульт має відкритися сам, без полів для ідентифікатора й пароля.',
					en: 'On the player press Connect a remote and point the second device camera at the QR code. The remote must open by itself, with no identifier and password fields.'
				},
				coverage: 'manual',
				testid: 'qr-code'
			},
			{
				id: 'start_8',
				category: { uk: 'Мої дошки', en: 'My boards' },
				text: {
					uk: 'У меню над кнопками має бути список «Мої дошки», а в кожному рядку — тег «Плеєр» або «Пульт» перед ідентифікатором.',
					en: 'Above the buttons the menu must show a My boards list, each row starting with a Player or Remote tag before the identifier.'
				},
				coverage: 'manual',
				testid: 'my-boards'
			},
			{
				id: 'start_9',
				category: { uk: 'Мої дошки', en: 'My boards' },
				text: {
					uk: 'Поверніться в меню й зайдіть у ту саму дошку зі списку. Пароль вводити не доведеться, а підписи, кольори й порядок треків мають лишитися ті самі.',
					en: 'Go back to the menu and reopen the same board from the list. No password should be asked, and track labels, colours and order must stay the same.'
				},
				coverage: 'testable'
			}
		]
	},
	{
		id: 'player',
		title: { uk: 'Плеєр', en: 'Player' },
		routes: ['/player'],
		checks: [
			{
				id: 'player_1',
				category: { uk: 'Папка', en: 'Folder' },
				text: {
					uk: 'Натисніть «Обрати папку з музикою». Спершу має зʼявитися попередження про те, що обирають саме папку, а не файли, і лише після нього — вікно вибору.',
					en: 'Press Choose a music folder. A warning must appear first, saying that a folder is picked rather than files, and only then the picker.'
				},
				coverage: 'manual',
				testid: 'pick-folder'
			},
			{
				id: 'player_2',
				category: { uk: 'Папка', en: 'Folder' },
				text: {
					uk: 'Оберіть папку з підпапками. Треки мають зʼявитися списком, а назви підпапок — розділювачами між ними.',
					en: 'Choose a folder that has subfolders. Tracks must appear as a list, with subfolder names as separators between them.'
				},
				coverage: 'manual',
				testid: 'pick-folder'
			},
			{
				id: 'player_3',
				category: { uk: 'Відтворення', en: 'Playback' },
				text: {
					uk: 'Натисніть на трек. Має початися звук, а внизу — зʼявитися назва того, що грає.',
					en: 'Press a track. Sound must start and the name of what is playing must appear at the bottom.'
				},
				coverage: 'manual',
				testid: 'now-playing'
			},
			{
				id: 'player_4',
				category: { uk: 'Відтворення', en: 'Playback' },
				text: {
					uk: 'Натисніть той самий трек іще раз, поки він грає. Має настати пауза; почати спочатку він НЕ мусить.',
					en: 'Press the same track again while it plays. It must pause; it must NOT restart from the beginning.'
				},
				coverage: 'manual',
				testid: 'now-playing',
				negative: true
			},
			{
				id: 'player_5',
				category: { uk: 'Відтворення', en: 'Playback' },
				text: {
					uk: 'Натисніть «Зупинити». Звук має згасати приблизно секунду, а підпис на кнопці — помінятися одразу, не чекаючи тиші.',
					en: 'Press Stop. The sound must fade for about a second, while the button caption changes immediately, without waiting for silence.'
				},
				coverage: 'manual',
				testid: 'player-stop'
			},
			{
				id: 'player_6',
				category: { uk: 'Клавіші', en: 'Keys' },
				text: {
					uk: 'Натисніть пробіл — має спрацювати пауза або продовження. Перевірте на українській розкладці теж: клавіша впізнається за місцем, а не за намальованим символом.',
					en: 'Press the space bar: it must pause or resume. Check on a non-Latin keyboard layout too: the key is recognised by its position, not by the symbol printed on it.'
				},
				coverage: 'manual',
				key: 'Space'
			},
			{
				id: 'player_7',
				category: { uk: 'Клавіші', en: 'Keys' },
				text: {
					uk: 'Поки грає трек, натисніть нуль. Має настати зупинка; десятий трек запуститися НЕ мусить.',
					en: 'While a track is playing, press zero. Playback must stop; the tenth track must NOT start.'
				},
				coverage: 'covered',
				test: 'src/lib/hotkeys/hotkeys.test.ts',
				key: 'Digit0',
				negative: true
			},
			{
				id: 'player_8',
				category: { uk: 'Клавіші', en: 'Keys' },
				text: {
					uk: 'Відкрийте вікно налаштувань треку й натисніть там пробіл. Музика стати на паузу НЕ мусить: клавіші належать верхньому вікну.',
					en: 'Open the track settings window and press the space bar there. The music must NOT pause: keys belong to the topmost window.'
				},
				coverage: 'covered',
				test: 'tests/e2e/shell.spec.ts',
				key: 'Space',
				negative: true
			},
			{
				id: 'player_9',
				category: { uk: 'Налаштування треку', en: 'Track settings' },
				text: {
					uk: 'У вікні треку дайте йому підпис, значок і колір, закрийте вікно й перезавантажте сторінку. Усе назване має лишитися на місці.',
					en: 'In the track window give it a label, an icon and a colour, close the window and reload the page. All of it must stay.'
				},
				coverage: 'manual',
				testid: 'track-modal'
			},
			{
				id: 'player_10',
				category: { uk: 'Налаштування треку', en: 'Track settings' },
				text: {
					uk: 'Змініть щось у вікні треку й спробуйте закрити вікно, не зберігаючи. Має зʼявитися запит із трьома відповідями — зберегти, не зберігати, скасувати.',
					en: 'Change something in the track window and try to close it without saving. A prompt with three answers must appear: save, discard, cancel.'
				},
				coverage: 'manual',
				testid: 'track-modal-close-btn'
			},
			{
				id: 'player_11',
				category: { uk: 'Запуск за API', en: 'API trigger' },
				text: {
					uk: 'Задайте треку запуск за адресою, яка не відповідає. Сторінка має показати, що запит не вдався, і НЕ мусить зависати довше десяти секунд.',
					en: 'Give a track an API trigger with an address that never answers. The page must report a failed request and must NOT hang for longer than ten seconds.'
				},
				coverage: 'covered',
				test: 'src/lib/triggers/watcher.test.ts',
				negative: true
			},
			{
				id: 'player_12',
				category: { uk: 'Запуск за API', en: 'API trigger' },
				text: {
					uk: 'Увімкніть тижневий розклад і поставте час, який уже минув. Трек за API у цей час запускатися НЕ мусить.',
					en: 'Turn on the weekly schedule and set a time window that has already passed. The API trigger must NOT fire during that time.'
				},
				coverage: 'testable',
				negative: true
			}
		]
	},
	{
		id: 'remote',
		title: { uk: 'Пульт', en: 'Remote' },
		routes: ['/remote'],
		checks: [
			{
				id: 'remote_1',
				category: { uk: 'Звʼязок', en: 'Link' },
				text: {
					uk: 'Відкрийте пульт при відкритому плеєрі. У шапці має бути сказано, що плеєр на звʼязку.',
					en: 'Open the remote while the player is open. The header must say that the player is online.'
				},
				coverage: 'manual',
				testid: 'link-state'
			},
			{
				id: 'remote_2',
				category: { uk: 'Звʼязок', en: 'Link' },
				text: {
					uk: 'Закрийте вкладку плеєра й подивіться на пульт. Протягом кількох секунд він має сказати, що плеєр офлайн.',
					en: 'Close the player tab and watch the remote. Within a few seconds it must say that the player is offline.'
				},
				coverage: 'covered',
				test: 'tests/e2e/db/board.spec.ts'
			},
			{
				id: 'remote_3',
				category: { uk: 'Команди', en: 'Commands' },
				text: {
					uk: 'Натисніть трек на пульті. Звук має піти з пристрою, що грає, а не з того, у руках.',
					en: 'Press a track on the remote. The sound must come from the playing device, not from the one in your hands.'
				},
				coverage: 'covered',
				test: 'tests/e2e/db/board.spec.ts',
				testid: 'link-state'
			},
			{
				id: 'remote_4',
				category: { uk: 'Команди', en: 'Commands' },
				text: {
					uk: 'Натисніть «Зупинити» на пульті. Смужка перемотки має повернутися на початок — так само, як вона це робить на пристрої, що грає.',
					en: 'Press Stop on the remote. The seek bar must return to the start, exactly as it does on the playing device.'
				},
				coverage: 'manual',
				testid: 'cmd-stop'
			},
			{
				id: 'remote_5',
				category: { uk: 'Команди', en: 'Commands' },
				text: {
					uk: 'Пересуньте повзунок гучності на пульті. Він має лишитися там, де ви його відпустили, і НЕ мусить стрибати туди-сюди.',
					en: 'Drag the volume slider on the remote. It must stay where you released it and must NOT jump back and forth.'
				},
				coverage: 'manual',
				testid: 'cmd-volume',
				negative: true
			},
			{
				id: 'remote_6',
				category: { uk: 'Видимість', en: 'Visibility' },
				text: {
					uk: 'Поставте треку «приховати від пульта». На пульті його бути НЕ мусить, а на пристрої, що грає, він має лишитися робочим.',
					en: 'Set a track to hidden from the remote. It must NOT be listed on the remote, while staying playable on the device that plays.'
				},
				coverage: 'manual',
				testid: 'track-modal',
				negative: true
			},
			{
				id: 'remote_7',
				category: { uk: 'Адміністратор', en: 'Administrator' },
				text: {
					uk: 'Натисніть на пульті кнопку адміністратора й уведіть адмінський пароль. Мають зʼявитися кнопки правки треків — ті самі, що на пристрої, який грає.',
					en: 'On the remote press the administrator button and enter the admin password. Track editing controls must appear, the same ones the playing device has.'
				},
				coverage: 'manual',
				testid: 'admin-open'
			},
			{
				id: 'remote_8',
				category: { uk: 'Адміністратор', en: 'Administrator' },
				text: {
					uk: 'Уведіть замість адмінського пароля будь-який інший. Права адміністратора зʼявитися НЕ мусять.',
					en: 'Enter any other password instead of the admin one. Administrator rights must NOT appear.'
				},
				coverage: 'manual',
				testid: 'admin-enter-submit',
				negative: true
			},
			{
				id: 'remote_9',
				category: { uk: 'Адміністратор', en: 'Administrator' },
				text: {
					uk: 'Змініть кількість повторів треку з пульта адміністратором. Число має помінятися й на пристрої, що грає, і пережити перезавантаження обох сторінок.',
					en: 'As administrator, change the repeat count of a track from the remote. The number must change on the playing device too and survive a reload of both pages.'
				},
				coverage: 'covered',
				test: 'src/lib/player/adminPatch.test.ts'
			},
			{
				id: 'remote_10',
				category: { uk: 'Телефон', en: 'Phone' },
				text: {
					uk: 'Відкрийте пульт на телефоні. Гарячі клавіші й шлях до папки показуватися НЕ мусять — на телефоні їх нема чим натиснути.',
					en: 'Open the remote on a phone. Keyboard shortcuts and the folder path must NOT be shown: a phone has nothing to press them with.'
				},
				coverage: 'testable',
				negative: true
			}
		]
	},
	{
		id: 'info',
		title: { uk: 'Табло інфодошки', en: 'Info board screen' },
		routes: ['/info'],
		checks: [
			{
				id: 'info_1',
				category: { uk: 'Вхід', en: 'Entry' },
				text: {
					uk: 'Увімкніть у налаштуваннях показ інфодошки. У меню під аудіодошкою має зʼявитися розділ із кнопками «Створити» і «Підключитися».',
					en: 'Turn on info boards in the settings. A section with Create and Connect buttons must appear in the menu, below the audio board one.'
				},
				coverage: 'manual',
				testid: 'settings-show-section'
			},
			{
				id: 'info_2',
				category: { uk: 'Вхід', en: 'Entry' },
				text: {
					uk: 'Вимкніть цей показ. Розділ має зникнути з меню, але сама адреса табло має відкриватися й далі — ховається вхід, а не сторінка.',
					en: 'Turn that off again. The section must disappear from the menu, yet the board address must still open: what is hidden is the entry, not the page.'
				},
				coverage: 'manual',
				testid: 'info-section',
				negative: true
			},
			{
				id: 'info_3',
				category: { uk: 'Складання панелі', en: 'Building the panel' },
				text: {
					uk: 'Натисніть «Скласти типову панель». Сітка має заповнитися готовими віджетами, а не лишитися порожньою.',
					en: 'Press Build a starter panel. The grid must fill with ready-made widgets rather than stay empty.'
				},
				coverage: 'manual',
				testid: 'info-fill-btn'
			},
			{
				id: 'info_4',
				category: { uk: 'Складання панелі', en: 'Building the panel' },
				text: {
					uk: 'Додайте віджет із трьох кнопок і поверніть його колесом миші. Він має займати три клітинки стовпчиком або рядком і не зникати.',
					en: 'Add a three-button widget and rotate it with the mouse wheel. It must take three cells as a column or as a row, and must not vanish.'
				},
				coverage: 'covered',
				test: 'src/lib/panel/layout.test.ts',
				testid: 'info-edit-btn'
			},
			{
				id: 'info_5',
				category: { uk: 'Складання панелі', en: 'Building the panel' },
				text: {
					uk: 'Складіть панель і перезавантажте сторінку. Панель має лишитися; збережіть її у файл і завантажте назад — має вийти та сама.',
					en: 'Build a panel and reload the page. It must survive; save it to a file and load it back, and it must come out the same.'
				},
				coverage: 'manual',
				testid: 'panel-save-file-btn'
			},
			{
				id: 'info_6',
				category: { uk: 'Прохання із зали', en: 'Requests from the hall' },
				text: {
					uk: 'Коли помічник натискає кнопку, у журналі має зʼявитися рядок із його підписом, а сама кнопка — засвітитися й плавно згаснути.',
					en: 'When the helper presses a button, a row with their name must appear in the log and the button itself must light up and fade out smoothly.'
				},
				coverage: 'manual',
				testid: 'info-log-section'
			},
			{
				id: 'info_7',
				category: { uk: 'Прохання із зали', en: 'Requests from the hall' },
				text: {
					uk: 'Поставте привертання уваги на «максимальний» і попросіть помічника натиснути будь-що. Тло всієї сторінки має на секунду змінити колір.',
					en: 'Set attention to the highest level and have the helper press anything. The background of the whole page must change colour for a second.'
				},
				coverage: 'manual',
				testid: 'info-screen-section'
			},
			{
				id: 'info_8',
				category: { uk: 'Відповідь', en: 'Answer' },
				text: {
					uk: 'Натисніть відповідь на прохання. У помічника вгорі екрана має зʼявитися смуга того самого змісту — зелена, червона або жовта.',
					en: 'Press an answer to a request. A strip with the same meaning must appear at the top of the helper screen: green, red or amber.'
				},
				coverage: 'covered',
				test: 'src/lib/components/panel/VerdictToast.test.ts',
				testid: 'panel-log-list'
			},
			{
				id: 'info_9',
				category: { uk: 'Кілька помічників', en: 'Several helpers' },
				text: {
					uk: 'Підключіть двох помічників. Кожен має отримати власне табло на сторінці, але журнал має лишитися спільним.',
					en: 'Connect two helpers. Each must get a panel of their own on the page, while the log stays shared.'
				},
				coverage: 'testable'
			}
		]
	},
	{
		id: 'helper',
		title: { uk: 'Підказка із зали', en: 'Helper panel' },
		routes: ['/info-remote'],
		checks: [
			{
				id: 'helper_1',
				category: { uk: 'Панель', en: 'Panel' },
				text: {
					uk: 'Відкрийте підказку на планшеті й тримайте його в руці. Сітка має вміщатися цілком: прокрутки бути НЕ мусить, бо тиснуть тут наосліп.',
					en: 'Open the helper panel on a tablet and hold it in your hand. The grid must fit entirely: there must be NO scrolling, because it is pressed without looking.'
				},
				coverage: 'manual',
				negative: true
			},
			{
				id: 'helper_2',
				category: { uk: 'Панель', en: 'Panel' },
				text: {
					uk: 'Натисніть кнопку пальцем, не дивлячись на екран. Вона має бути не меншою за подушечку пальця й не мусить зачіпати сусідню.',
					en: 'Press a button with your finger without looking at the screen. It must be no smaller than a fingertip and must not catch the neighbouring one.'
				},
				coverage: 'covered',
				test: 'tests/e2e/a11y-layout.spec.ts',
				testid: 'info-wall-list'
			},
			{
				id: 'helper_3',
				category: { uk: 'Панель', en: 'Panel' },
				text: {
					uk: 'Натисніть ту саму кнопку кілька разів підряд. Кнопка має щоразу відгукуватися, а місце її в сітці мінятися НЕ мусить.',
					en: 'Press the same button several times in a row. It must respond every time, and its place in the grid must NOT move.'
				},
				coverage: 'manual',
				testid: 'info-wall-list',
				negative: true
			},
			{
				id: 'helper_4',
				category: { uk: 'Повзунок', en: 'Slider' },
				text: {
					uk: 'Натисніть «більше» на повзунку водночас із другим помічником. Значення має вирости на два кроки, а не на один.',
					en: 'Press the plus side of a slider at the same time as another helper. The value must grow by two steps, not by one.'
				},
				coverage: 'manual',
				testid: 'info-wall-list'
			},
			{
				id: 'helper_5',
				category: { uk: 'Відповідь', en: 'Answer' },
				text: {
					uk: 'Дочекайтеся відповіді від того, хто за звуковим пультом, і затримайте на смузі палець. Поки палець на ній, смуга зникати НЕ мусить.',
					en: 'Wait for an answer from the sound desk and hold your finger on the strip. While the finger is there, the strip must NOT disappear.'
				},
				coverage: 'manual',
				testid: 'info-verdict-text',
				negative: true
			},
			{
				id: 'helper_6',
				category: { uk: 'Звʼязок', en: 'Link' },
				text: {
					uk: 'Закрийте табло на пристрої біля звукового пульта. Підказка має сказати, що табло закрите, а не мовчати.',
					en: 'Close the board on the device at the sound desk. The helper page must say that the board is closed rather than stay silent.'
				},
				coverage: 'manual',
				testid: 'info-offline-hint'
			},
			{
				id: 'helper_7',
				category: { uk: 'Підпис', en: 'Name' },
				text: {
					uk: 'Задайте собі підпис у налаштуваннях і натисніть кнопку. За звуковим пультом у журналі має стояти саме цей підпис, а не «без імені».',
					en: 'Give yourself a name in the settings and press a button. The log at the sound desk must show that name rather than an anonymous one.'
				},
				coverage: 'testable',
				testid: 'info-wall-list'
			}
		]
	},
	{
		id: 'settings',
		title: { uk: 'Налаштування', en: 'Settings' },
		routes: ['/settings'],
		checks: [
			{
				id: 'settings_1',
				category: { uk: 'Вікно', en: 'Window' },
				text: {
					uk: 'Відкрийте налаштування з дошки. Вони мають зʼявитися вікном поверх сторінки; список треків при поверненні пропасти НЕ мусить.',
					en: 'Open the settings from a board. They must appear as a window over the page, and the track list must NOT be lost on returning.'
				},
				coverage: 'manual',
				testid: 'go-settings',
				negative: true
			},
			{
				id: 'settings_2',
				category: { uk: 'Тема', en: 'Theme' },
				text: {
					uk: 'Перемкніть тему туглом у шапці. Кольори мають помінятися одразу, а після перезавантаження лишитися тими, які ви обрали.',
					en: 'Flip the theme with the toggle in the header. Colours must change at once and stay as chosen after a reload.'
				},
				coverage: 'covered',
				test: 'tests/e2e/shell.spec.ts',
				testid: 'theme-toggle'
			},
			{
				id: 'settings_3',
				category: { uk: 'Тема', en: 'Theme' },
				text: {
					uk: 'Оберіть «Як у пристрої» й змініть темну або світлу тему в самій системі. Сторінка має піти за системою, не питаючи ще раз.',
					en: 'Choose the system option and switch dark or light mode in the operating system. The page must follow it without asking again.'
				},
				coverage: 'manual',
				testid: 'theme-system-radio'
			},
			{
				id: 'settings_4',
				category: { uk: 'Мова', en: 'Language' },
				text: {
					uk: 'Перемкніть мову. Весь текст сторінки має помінятися повністю: назв українською в англійському інтерфейсі лишитися НЕ мусить.',
					en: 'Switch the language. All page text must change completely: no leftovers of the other language may stay.'
				},
				coverage: 'covered',
				test: 'src/lib/i18n/i18n.test.ts',
				negative: true
			},
			{
				id: 'settings_5',
				category: { uk: 'Стала дошка', en: 'Fixed board' },
				text: {
					uk: 'Запишіть сталу пару й натисніть «Створити» двічі. Обидва рази має відкритися ТА САМА дошка, а не дві різні.',
					en: 'Save a fixed pair and press Create twice. The SAME board must open both times, not two different ones.'
				},
				coverage: 'manual',
				testid: 'fixed-pair'
			},
			{
				id: 'settings_6',
				category: { uk: 'Запуск', en: 'Startup' },
				text: {
					uk: 'Оберіть у «Що відкривати при запуску» пункт «Моя дошка» й відкрийте застосунок наново. Має відкритися остання дошка плеєра, а не меню.',
					en: 'In the startup section choose the player board and open the app again. The last player board must open instead of the menu.'
				},
				coverage: 'covered',
				test: 'src/lib/settings/startPage.test.ts',
				testid: 'settings-modal'
			},
			{
				id: 'settings_7',
				category: { uk: 'Скидання', en: 'Reset' },
				text: {
					uk: 'Натисніть «Скинути застосунок» і підтвердіть. Сторінка має відкритися наново з меню, без відкритої дошки й без збережених налаштувань.',
					en: 'Press the reset button and confirm. The page must reload into the menu, with no open board and no saved settings.'
				},
				coverage: 'covered',
				test: 'src/lib/services/resetService.test.ts',
				testid: 'hard-reset-btn'
			},
			{
				id: 'settings_8',
				category: { uk: 'Звʼязок з автором', en: 'Contacts' },
				text: {
					uk: 'Натисніть значок месенджера в розділі звʼязку. Має відкритися новою вкладкою саме той месенджер, а не порожня сторінка.',
					en: 'Press a messenger icon in the contacts section. That messenger must open in a new tab rather than a blank page.'
				},
				coverage: 'manual',
				testid: 'contact-section'
			},
			{
				id: 'settings_9',
				category: { uk: 'Застосунок для компʼютера', en: 'Desktop app' },
				text: {
					uk: 'У застосунку для компʼютера задайте шлях до папки з музикою, закрийте його й відкрийте наново. Треки мають зʼявитися самі, без вибору папки.',
					en: 'In the desktop app set the path to the music folder, close it and open it again. Tracks must appear by themselves, without picking a folder.'
				},
				coverage: 'manual',
				testid: 'folder-save'
			},
			{
				id: 'settings_10',
				category: { uk: 'Застосунок для компʼютера', en: 'Desktop app' },
				text: {
					uk: 'Увімкніть запуск разом із системою й перезавантажте компʼютер. Застосунок має піднятися сам.',
					en: 'Turn on start with the system and restart the computer. The app must come up on its own.'
				},
				coverage: 'testable'
			}
		]
	},
	{
		id: 'ui',
		title: { uk: 'Розкладка й поведінка екранів', en: 'Layout and screen behaviour' },
		/*
		 * ВКЛАДКА БЕЗ ВЛАСНИХ СТОРІНОК — і це не пропуск.
		 *
		 * Решта вкладок питає, чи працює те, що на своєму екрані. Ця питає
		 * правила, спільні для ВСІХ екранів, і закріпити її за котримсь одним
		 * означало б сказати, що на інших ці правила не діють.
		 *
		 * Взялася вона з дефектів, а не з підручника: за два дні нотаток автора
		 * 186 записів «актуальний / очікуваний», і ті самі формулювання
		 * повторюються дослівно — «все в один стовпець, і тому купа вільного
		 * місця по боках і скрол», «подвійний скрол», «сповіщення внизу списку,
		 * і його не видно», «стрибає». Тобто це не окремі помилки, а кілька
		 * правил, яких ніхто не звіряв.
		 */
		routes: [],
		checks: [
			{
				id: 'ui_1',
				category: { uk: 'Широкий екран', en: 'Wide screen' },
				text: {
					uk: 'Відкрийте кожен екран на компʼютері в повне вікно. Вміст має розходитися на колонки; одна вузька колонка з порожнечею обабіч — помилка.',
					en: 'Open every screen on a computer in a full window. The content must spread into columns; one narrow column with empty space on both sides is a defect.'
				},
				coverage: 'manual'
			},
			{
				id: 'ui_2',
				category: { uk: 'Прокрутка', en: 'Scrolling' },
				text: {
					uk: 'Покрутіть колесо на кожному екрані. Прокрутка має бути одна — сторінки; смуга всередині смуги означає, що вміст не вмістили, а сховали.',
					en: 'Scroll on every screen. There must be a single scrollbar, the page one; a bar inside a bar means the content was hidden rather than fitted.'
				},
				coverage: 'manual'
			},
			{
				id: 'ui_3',
				category: { uk: 'Прокрутка', en: 'Scrolling' },
				text: {
					uk: 'Звузьте вікно до ширини телефона. Сторінка НЕ мусить їхати вбік: горизонтальна прокрутка означає, що щось ширше за екран.',
					en: 'Narrow the window to phone width. The page must NOT scroll sideways: horizontal scrolling means something is wider than the screen.'
				},
				coverage: 'covered',
				test: 'tests/e2e/a11y-layout.spec.ts',
				negative: true
			},
			{
				id: 'ui_4',
				category: { uk: 'Що видно одразу', en: 'What is visible at once' },
				text: {
					uk: 'Доведіть екран до стану з повідомленням або помилкою. Її має бути видно без прокрутки: повідомлення під краєм не існує для того, хто його не шукає.',
					en: 'Bring a screen to a state with a message or an error. It must be visible without scrolling: a message below the fold does not exist for someone who is not looking for it.'
				},
				coverage: 'manual'
			},
			{
				id: 'ui_5',
				category: { uk: 'Вікна', en: 'Dialogs' },
				text: {
					uk: 'Відкрийте вікно правки віджета й прокрутіть його вміст. Назва вгорі й рядок дій унизу мають лишатися на місці, а всі дії — стояти поруч і виглядати однаково.',
					en: 'Open the widget editing dialog and scroll its content. The title at the top and the action row at the bottom must stay put, and all the actions must sit together and look alike.'
				},
				coverage: 'manual',
				testid: 'cell-save-btn'
			},
			{
				id: 'ui_6',
				category: { uk: 'Ніщо не стрибає', en: 'Nothing jumps' },
				text: {
					uk: 'Попросіть щось із зали й дочекайтеся відповіді табла. Кнопки під пальцем НЕ мусять зсунутися ні від появи смуги, ні від її зникнення.',
					en: 'Press a button in the hall and wait for the board to answer. The buttons under your finger must NOT shift either when the strip appears or when it goes away.'
				},
				coverage: 'covered',
				test: 'tests/e2e/db/info.spec.ts',
				negative: true
			},
			{
				id: 'ui_7',
				category: { uk: 'Відгук', en: 'Feedback' },
				text: {
					uk: 'Натисніть зупинку треку — дію, яка триває. Вигляд кнопки має змінитися одразу, а не після того, як звук стихне.',
					en: 'Press the track stop, an action that takes time. The button must change its look at once, not after the sound has faded.'
				},
				coverage: 'manual',
				testid: 'player-stop'
			},
			{
				id: 'ui_8',
				category: { uk: 'Однакове однаково', en: 'Same things look the same' },
				text: {
					uk: 'Порівняйте однойменні місця на аудіодошці й на таблі: «Останні дії», картку дошки, підключення. Однакове за змістом має зватися тим самим словом і виглядати так само.',
					en: 'Compare the matching places on the audio board and on the info board: recent actions, the board card, connecting. Things that mean the same must be named the same and look the same.'
				},
				coverage: 'manual'
			},
			{
				id: 'ui_9',
				category: { uk: 'Що видно одразу', en: 'What is visible at once' },
				text: {
					uk: 'Знайдіть орган, який зараз нічого не робить: вибір того, чого немає на екрані, гучність там, де нічого не грає. Такого не мусить бути видно — або він має бути явно вимкнений.',
					en: 'Look for a control that currently does nothing: a choice about something not on screen, a volume where nothing plays. There must be none visible, or it must be plainly disabled.'
				},
				coverage: 'manual',
				negative: true
			},
			{
				id: 'ui_10',
				category: { uk: 'Пастки', en: 'Traps' },
				text: {
					uk: 'Закрийте дошку на пристрої, що грає. Попередження має перекрити екран, але НЕ смугу застосунку: вихід мусить лишатися під рукою завжди.',
					en: 'Close the board on the playing device. The warning must cover the screen but NOT the app bar: the way out must stay at hand at all times.'
				},
				coverage: 'manual',
				testid: 'info-offline-hint',
				negative: true
			},
			{
				id: 'ui_11',
				category: { uk: 'Ціль під палець', en: 'Finger-sized targets' },
				text: {
					uk: 'На телефоні спробуйте влучити пальцем у найдрібніші органи: прапорці, перемикачі, стрілки лічильників. У кожен має бути легко поцілити, і вони не мусять налазити один на одного.',
					en: 'On a phone press the smallest controls: checkboxes, switches, stepper arrows. Each must be easy to hit, and they must not overlap.'
				},
				coverage: 'covered',
				test: 'tests/e2e/a11y-layout.spec.ts'
			}
		]
	}
];

/** Усі пункти підряд — для інваріантів і для фільтра прочитаного зі сховища. */
export const ALL_CHECKS: readonly BetaCheck[] = BETA_TABS.flatMap((tab) => tab.checks);

/** Порядок показу: людина витрачається спершу там, де машини немає. */
export const LEVELS: readonly Coverage[] = ['manual', 'testable', 'covered'];

/**
 * Локатор із `id` пункта: `common_1` → `common-1`.
 *
 * Сталий локатор на рядку, який малюється по разу на пункт, дав би стільки
 * елементів, скільки пунктів на вкладці, і `getByTestId` кидав би strict mode
 * violation. Підкреслення в локаторах заборонені конвенцією, тож заміна повна
 * й однозначна в обидва боки — локатор лишається похідним від `id`, а не
 * другим іменем, яке треба тримати узгодженим.
 */
export const tidOf = (id: string): string => id.split('_').join('-');
