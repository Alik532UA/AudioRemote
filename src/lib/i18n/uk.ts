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
	'settings.app': 'Налаштування застосунку',
	'settings.lookTitle': 'Вигляд',
	'settings.launchTitle': 'Запуск',
	'settings.diagTitle': 'Діагностика',
	'settings.startTitle': 'Що відкривати при запуску',
	'settings.showTrigger': 'Позначати треки із запуском за API',
	'settings.showTriggerHint':
		'Значок у рядку списку. Відповідає на «чому воно заграло саме́», не вимагаючи відкривати налаштування треку.',
	'settings.startBoardTitle': 'Яку дошку відкривати',
	'settings.startBoardLead':
		'Певну дошку варто вказати там, де пульт завжди той самий, — наприклад на планшеті в залі.',
	'startBoard.last': 'Останню відкриту',
	'startBoard.fixed': 'Певну дошку',
	'settings.startLead':
		'Стосується лише запуску застосунку. Знак угорі ліворуч завжди веде в меню, хоч би що тут стояло.',
	'settings.startLabel': 'Перша сторінка',
	'start.menu': 'Меню',
	'start.create': 'Створити дошку',
	'start.player': 'Моя дошка',
	'start.connect': 'Підключення до дошки',
	'start.remote': 'Віддалена дошка',
	'start.noPlayerBoard':
		'Приймач не відкрився: збереженої дошки ще немає. Створіть її — наступного разу відкриється сама.',
	'start.noRemoteBoard':
		'Пульт не відкрився: збереженої дошки ще немає. Підключіться — наступного разу відкриється сам.',
	'start.createFailed':
		'Не вдалося відкрити сталу дошку. Перевірте ідентифікатор і пароль у налаштуваннях.',
	'settings.open': 'Налаштування',
	'settings.language': 'Мова',
	'settings.version': 'Версія',
	'settings.emulator': 'Локальний емулятор',
	'settings.trail': 'Журнал останніх дій',
	'settings.trailHint':
		'Записується до сховища браузера, тож переживає аварійне закриття. Скопіюйте й надішліть, якщо щось упало.',
	'settings.trailEmpty': 'Порожньо.',
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
	'player.arm': 'Увімкнути звук',
	'player.armed': 'Звук увімкнено',
	'player.armRefused':
		'Браузер відмовив. Спробуйте натиснути ще раз або просто оберіть трек — дозвіл видасться на саме це натискання.',
	'player.armHint':
		'Браузер не дає програвати звук, поки людина сама цього не дозволила. Натисніть один раз — і далі дошкою керують із телефона.',
	'player.pickFolder': 'Обрати папку з музикою',
	'player.changeFolder': 'Інша папка',
	'player.rescan': 'Перечитати папку',
	'player.pickAgain':
		'Папку треба обирати після кожного перезавантаження сторінки: браузер аварійно закривається, якщо застосунок намагається її запамʼятати.',
	'player.scanning': 'Читаємо папку…',
	'player.tracksOne': '{count} трек',
	'player.tracksFew': '{count} треки',
	'player.tracksMany': '{count} треків',
	'player.empty': 'У цій папці немає аудіофайлів.',
	'visibility.label': 'Кому показувати',
	'visibility.all': 'Усім',
	'visibility.player': 'Лише тут',
	'visibility.none': 'Нікому',
	'visibility.allHint': 'У списку тут і на пульті.',
	'visibility.playerHint':
		'У списку тут, клавіша діє. На пульті треку немає — з телефона його не запустять.',
	'visibility.noneHint': 'Ніде: ні в списку, ні під клавішею. Повернути — у «Приховані».',
	'visibility.playerMark': 'Приховано від пульта',
	'player.hiddenOpen': 'Приховані треки',
	'player.hiddenCount': 'Приховано: {count}',
	'player.noSupport':
		'Цей браузер не вміє давати сторінці доступ до папки. Відкрийте плеєр у Chrome або Edge на комп’ютері.',
	'player.insecure': 'Потрібне з’єднання https або адреса localhost.',
	'player.keepOpen': 'Не закривайте цю вкладку — саме вона грає звук.',
	'player.listeners': 'Підключено пультів: {count}',
	'player.playHere': 'Запустити на цьому пристрої',
	'player.moveUp': 'Вище в списку',
	'player.moveDown': 'Нижче в списку',
	'player.configReadonly':
		'Папку видано лише на читання, тож порядок, кольори й клавіші не збережуться. Оберіть папку ще раз і дозвольте запис.',
	'player.volume': 'Гучність',
	'player.showSecret': 'Ідентифікатор і пароль дошки',
	'player.connect': 'Підключити пульт',
	'player.connectHow': 'Як підключити телефон',
	'player.connectQuick': 'Одним посиланням',
	'player.connectQuickHint':
		'Відкрити на телефоні — дошка відкриється сама. Посилання ДОРІВНЮЄ паролю: хто його отримав, той усередині.',
	'player.connectLink': 'Посилання',
	'player.connectManual': 'Або вручну',
	'player.connectStep1': 'Відкрийте на телефоні цю саму адресу.',
	'player.connectStep2': 'Натисніть «Підключитися».',
	'player.connectStep3': 'Введіть ідентифікатор і пароль звідси.',
	'player.connectAddress': 'Адреса',
	'player.connectCopyAll': 'Скопіювати все',
	'player.tips': 'Підказки',
	'player.deckExpand': 'Розгорнути керування',
	'player.deckCollapse': 'Згорнути керування',
	'color.pick': 'Колір треку',
	'color.label': 'Колір {n}',
	'color.none': 'Без кольору',

	'hotkeys.hint':
		'Пробіл — пауза, 0 — стоп, стрілки — гучність і перемотка, M — тиша. Цифри 1–9 завжди запускають треки за порядком, а окремому треку можна віддати будь-яку клавішу — цифри від цього не зникають.',
	'hotkeys.slot': 'Клавіша {key}',
	'hotkeys.tipTitle': 'Гарячі клавіші',
	'hotkeys.actPlayPause': 'пауза або продовжити',
	'hotkeys.actStop': 'зупинити',
	'hotkeys.actTrack': 'трек за порядком у списку',
	'hotkeys.actSeek': 'перемотка на 5 секунд',
	'hotkeys.actVolume': 'гучність',
	'hotkeys.actMute': 'тиша',
	'hotkeys.tipFoot': 'Окремому треку можна віддати будь-яку клавішу — цифри від цього не зникають.',
	'hotkeys.assign': 'Гаряча клавіша',
	'hotkeys.pressAny': 'Натисніть будь-яку клавішу…',
	'hotkeys.none': 'Не призначено',
	'hotkeys.byOrder': 'За порядком: {key}',
	'hotkeys.clear': 'Зняти',
	'hotkeys.reserved': 'Клавіша {key} зайнята керуванням — оберіть іншу.',
	'track.settings': 'Налаштування треку',
	'track.open': 'Налаштування треку',
	'track.displayName': 'Підпис на екрані',
	'track.trigger': 'Запуск за API',
	'track.paneMain': 'Трек',
	'trigger.lead':
		'Застосунок сам опитує адресу й запускає трек, коли умова СТАЄ правдивою. Чужий сервер мусить дозволяти запити з браузера — інакше нижче буде помилка, і це рішення його боку, а не наше.',
	'trigger.on': 'Опитувати',
	'trigger.paneSource': 'Звідки брати',
	'trigger.paneWhen': 'Коли запускати',
	'trigger.onChange': 'Лише коли умова змінилася',
	'trigger.onChangeHint':
		'Тривога триває довго, і умова весь цей час виконується. Вимкнене означає «щоразу, поки виконується» — трек починатиметься спочатку на кожному опитуванні.',
	'trigger.fires': 'Спрацював разів: {count}',
	'trigger.sharedOne': 'Спільний запит на {count} трек',
	'trigger.sharedFew': 'Спільний запит на {count} треки',
	'trigger.sharedMany': 'Спільний запит на {count} треків',
	'trigger.url': 'Адреса запиту',
	'trigger.every': 'Питати кожні, секунд',
	'trigger.headers': 'Заголовки — по одному в рядку, «Назва: значення»',
	'trigger.headersHint':
		'Сюди кладуть ключ доступу. Він зберігається у файлі налаштувань у вашій папці з музикою.',
	'trigger.path': 'Шлях у відповіді',
	'trigger.pathHint': 'Наприклад alerts.0.active. Порожньо — уся відповідь.',
	'trigger.test': 'Умова',
	'trigger.truthy': 'Значення не порожнє',
	'trigger.falsy': 'Значення порожнє',
	'trigger.equals': 'Дорівнює',
	'trigger.notEquals': 'Не дорівнює',
	'trigger.contains': 'Містить',
	'trigger.notContains': 'Не містить',
	'trigger.value': 'Із чим порівняти',
	'trigger.save': 'Зберегти',
	'trigger.clear': 'Прибрати запуск за API',
	'trigger.never': 'Ще не опитували.',
	'trigger.lastOk': 'Прочитано: {value}',
	'trigger.errPolicy':
		'Цю адресу заблокувала політика безпеки самого застосунку. Найчастіше це стара вкладка: перезавантажте сторінку (Ctrl+Shift+R).',
	'trigger.errNetwork':
		'Не вдалося дочитати відповідь. Найчастіше сервер не дозволяє запити зі сторінок (заголовок Access-Control-Allow-Origin). Те, що адреса відкривається в окремій вкладці, цього не спростовує — там інші правила.',
	'trigger.errHttp': 'Сервер відповів кодом {detail}.',

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
	'remote.resume': 'Грати',
	'remote.prev': 'Попередній',
	'remote.stop': 'Зупинити',
	'remote.next': 'Наступний',
	'remote.volume': 'Гучність',
	'remote.sending': 'Надсилаємо…',
	'remote.noAck': 'Комп’ютер не відповів. Перевірте, чи відкрита вкладка.',
	'remote.emptyLibrary': 'На комп’ютері ще не обрано папку з музикою.',

	'error.network': 'Немає зв’язку з базою. Перевірте інтернет.',
	'error.emulatorDown':
		'Локальний емулятор Firebase не запущено. Відкрийте другий термінал у теці проєкту й виконайте: npm run emulators',
	'error.configMissing': 'Firebase не налаштований: бракує змінних середовища.',
	'error.denied': 'База відмовила в доступі. Найімовірніше, правила ще не викладені.',
	'error.playback': 'Не вдалося програти файл: {name}',
	'error.fileGone': 'Файл зник із папки: {name}',
	'error.dbOffline': 'Немає звʼязку з базою даних.',
	'player.dbOffline':
		'Немає звʼязку з базою. Пульт цієї дошки не побачить, а все, що ви зараз робите, лишається на цьому компʼютері.',
	'error.unknown': 'Щось пішло не так.'
} as const;

export type TranslationKey = keyof typeof uk;
