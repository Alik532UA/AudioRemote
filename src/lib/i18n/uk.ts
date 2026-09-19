/**
 * Українська — ДЖЕРЕЛО ПРАВДИ про набір ключів.
 *
 * Тип `TranslationKey` виводиться саме з цього об'єкта, тож ключ, доданий сюди
 * й забутий в `en.ts`, ламає збірку, а не екран. Паритет додатково стереже
 * `i18n.test.ts` — типу мало: він не бачить порожнього рядка на місці перекладу.
 */
export const uk = {
	'app.name': 'AudioRemote',
	'app.tagline': 'Спільна музична дошка',

	'theme.group': 'Тема оформлення',
	'theme.light': 'Світла',
	'theme.dark': 'Темна',
	'theme.system': 'Як у пристрої',
	'theme.switchToLight': 'Перемкнути на світлу тему',
	'theme.switchToDark': 'Перемкнути на темну тему',

	'lang.group': 'Мова',

	'common.back': 'Назад',
	'common.cancel': 'Скасувати',
	'common.close': 'Закрити',
	'common.copy': 'Скопіювати',
	'common.copied': 'Скопійовано',
	'common.retry': 'Спробувати ще раз',
	'common.loading': 'Зачекайте…',

	'reload.ready': 'Готове оновлення застосунку.',
	'reload.apply': 'Оновити зараз',
	'reload.later': 'Пізніше',

	'field.reveal': 'Показати пароль',
	'field.hide': 'Приховати пароль',
	'field.capsLock': 'Увімкнено Caps Lock',
	'field.layout': 'Схоже на латинську розкладку',

	'entry.lead': 'Музична дошка',
	'entry.create': 'Створити',
	'entry.createHint': 'На пристрої, що запускатиме треки',
	'entry.connect': 'Підключитися',
	'entry.connectHint': 'Щоб запускати треки на чужій дошці',
	'entry.mine': 'Мої дошки',
	'entry.forget': 'Прибрати зі списку',

	'settings.title': 'Налаштування',
	'settings.open': 'Налаштування',
	'settings.language': 'Мова',
	'settings.fixedTitle': 'Стала дошка',
	'settings.fixedLead':
		'Запишіть сюди ідентифікатор і пароль, які не мінятимуться. Тоді «Створити» щоразу відкриватиме ТУ САМУ дошку, і диктувати колегам щось нове не доведеться.',
	'settings.fixedId': 'Сталий ідентифікатор',
	'settings.fixedPassword': 'Сталий пароль',
	'settings.generate': 'Згенерувати',
	'settings.save': 'Зберегти',
	'settings.saved': 'Збережено',
	'settings.clear': 'Прибрати сталу пару',
	'settings.emptyMeans': 'Порожні поля означають «генерувати щоразу» — типова поведінка.',
	'settings.halfPair':
		'Потрібні обидва значення: адреса дошки виводиться з пари, тож половина не діє.',
	'settings.reuseWarning':
		'Один пароль на всі дошки означає, що його витік відкриває всі. Для однієї кімнати це прийнятно; для різних груп краще різні паролі.',

	'create.title': 'Нова дошка',
	'create.nameLabel': 'Назва — щоб упізнати серед інших',
	'create.namePlaceholder': 'Зал 2',
	'create.idLabel': 'Ідентифікатор',
	'create.passwordLabel': 'Пароль',
	'create.regenerate': 'Інший пароль',
	'create.hint': 'Продиктуйте ці два рядки тому, хто керуватиме з телефона.',
	'create.fromSettings':
		'Пара взята з налаштувань, тож це ТА САМА дошка, що й минулого разу. Нову отримаєте, прибравши сталу пару в налаштуваннях.',
	'create.weak':
		'Свій пароль коротший за {min} символів. Дошка живе місяцями — короткий пароль підбирають.',
	'create.warnChange':
		'Пароль — це частина адреси дошки. Змінити його потім не можна: доведеться створити дошку заново.',
	'create.submit': 'Створити й відкрити плеєр',

	'connect.title': 'Підключитися до дошки',
	'connect.idLabel': 'Ідентифікатор',
	'connect.passwordLabel': 'Пароль',
	'connect.submit': 'Підключитися',
	'connect.searching': 'Шукаємо дошку…',
	'connect.remember': 'Запам’ятати цю дошку на цьому пристрої',
	/*
	 * ОДНЕ повідомлення на дві причини, і це вимога, а не лінощі: окремі тексти
	 * «немає такої дошки» й «невірний пароль» перетворюють форму на інструмент
	 * перевірки, які дошки існують (SECURITY-v9, AUTH-FORM § 3).
	 */
	'connect.notFound': 'Дошку не знайдено або пароль невірний.',

	'player.title': 'Плеєр',
	'player.subtitle': 'Цей комп’ютер гратиме звук',
	'player.arm': 'Увімкнути звук на цьому пристрої',
	'player.armed': 'Звук увімкнено',
	'player.armHint':
		'Браузер не дає програвати звук, поки людина сама цього не дозволила. Натисніть один раз — і далі дошкою керують із телефона.',
	'player.pickFolder': 'Обрати теку з музикою',
	'player.changeFolder': 'Інша тека',
	'player.rescan': 'Перечитати теку',
	'player.folderLost': 'Доступ до теки втрачено. Натисніть, щоб відновити.',
	'player.restore': 'Відновити доступ',
	'player.scanning': 'Читаємо теку…',
	'player.found': 'Знайдено треків: {count}',
	'player.empty': 'У цій теці немає аудіофайлів.',
	'player.hide': 'Приховати від пульта',
	'player.show': 'Показати',
	'player.hiddenCount': 'Приховано: {count}',
	'player.noSupport':
		'Цей браузер не вміє давати сторінці доступ до теки. Відкрийте плеєр у Chrome або Edge на комп’ютері.',
	'player.insecure': 'Потрібне з’єднання https або адреса localhost.',
	'player.keepOpen': 'Не закривайте цю вкладку — саме вона грає звук.',
	'player.listeners': 'Підключено пультів: {count}',
	'player.playHere': 'Запустити на цьому пристрої',
	'player.volume': 'Гучність',

	'hotkeys.hint': 'Клавіші: 1…9 і 0 — треки, − та + — гучність, M — тиша',
	'hotkeys.slot': 'Клавіша {key}',

	'sound.mute': 'Вимкнути звук',
	'sound.unmute': 'Повернути звук',

	'remote.title': 'Пульт',
	'remote.online': 'Комп’ютер на зв’язку',
	'remote.offline': 'Комп’ютер офлайн',
	'remote.offlineHint':
		'Вкладку на комп’ютері закрито. Відкрийте дошку там і натисніть «Увімкнути звук».',
	'remote.notArmedHint':
		'Комп’ютер на зв’язку, але звук ще не ввімкнено. Попросіть натиснути «Увімкнути звук» на комп’ютері.',
	'remote.nothing': 'Нічого не грає',
	'remote.play': 'Запустити',
	'remote.pause': 'Пауза',
	'remote.resume': 'Продовжити',
	'remote.stop': 'Зупинити',
	'remote.next': 'Наступний',
	'remote.volume': 'Гучність',
	'remote.sending': 'Надсилаємо…',
	'remote.noAck': 'Комп’ютер не відповів. Перевірте, чи відкрита вкладка.',
	'remote.emptyLibrary': 'На комп’ютері ще не обрано теку з музикою.',

	'error.network': 'Немає зв’язку з базою. Перевірте інтернет.',
	'error.emulatorDown':
		'Локальний емулятор Firebase не запущено. Відкрийте другий термінал у теці проєкту й виконайте: npm run emulators',
	'error.configMissing': 'Firebase не налаштований: бракує змінних середовища.',
	'error.denied': 'База відмовила в доступі. Найімовірніше, правила ще не викладені.',
	'error.playback': 'Не вдалося програти файл: {name}',
	'error.fileGone': 'Файл зник із теки: {name}',
	'error.unknown': 'Щось пішло не так.'
} as const;

export type TranslationKey = keyof typeof uk;
