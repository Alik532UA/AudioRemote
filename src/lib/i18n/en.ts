import type { TranslationKey } from './uk';

/**
 * English. Повний комплект — не частковий.
 *
 * Тип `Record<TranslationKey, string>` не дає забути ключ, але не бачить
 * порожнього рядка й не бачить значення, скопійованого з української. Обидва
 * випадки ловить `i18n.test.ts`.
 */
export const en: Record<TranslationKey, string> = {
	'app.name': 'AudioRemote',
	'app.tagline': 'A shared music board',

	'theme.group': 'Colour theme',
	'theme.light': 'Light',
	'theme.dark': 'Dark',
	'theme.system': 'Match device',
	'theme.switchToLight': 'Switch to the light theme',
	'theme.switchToDark': 'Switch to the dark theme',

	'lang.group': 'Language',

	'common.back': 'Back',
	'common.cancel': 'Cancel',
	'common.close': 'Close',
	'common.copy': 'Copy',
	'common.copied': 'Copied',
	'common.retry': 'Try again',
	'common.loading': 'One moment…',

	'reload.ready': 'An update is ready.',
	'reload.apply': 'Update now',
	'reload.later': 'Later',

	'field.reveal': 'Show the password',
	'field.hide': 'Hide the password',
	'field.capsLock': 'Caps Lock is on',
	'field.layout': 'Looks like a Latin keyboard layout',

	'entry.lead': 'Music board',
	'entry.create': 'Create',
	'entry.createHint': 'On the device that will play the tracks',
	'entry.connect': 'Connect',
	'entry.connectHint': 'To play tracks on someone else’s board',
	'entry.mine': 'My boards',
	'entry.forget': 'Remove from list',

	'settings.title': 'Settings',
	'settings.app': 'App settings',
	'settings.lookTitle': 'Appearance',
	'settings.launchTitle': 'Launch',
	'settings.diagTitle': 'Diagnostics',
	'settings.startTitle': 'What to open on launch',
	'settings.showTrigger': 'Mark tracks that start from an API',
	'settings.showTriggerHint':
		'An icon in the list row. It answers “why did that play by itself” without opening the track settings.',
	'settings.startBoardTitle': 'Which board to open',
	'settings.startBoardLead':
		'Pin a board where the remote is always the same one — a tablet in the hall, for instance.',
	'startBoard.last': 'The last one opened',
	'startBoard.fixed': 'A specific board',
	'settings.startLead':
		'Applies to launching the app only. The mark at the top left always leads to the menu, whatever is set here.',
	'settings.startLabel': 'First page',
	'start.menu': 'Menu',
	'start.create': 'Create a board',
	'start.player': 'My board',
	'start.connect': 'Connecting to a board',
	'start.remote': 'A remote board',
	'start.noPlayerBoard':
		'The player did not open: there is no saved board yet. Create one and it will open by itself next time.',
	'start.noRemoteBoard':
		'The remote did not open: there is no saved board yet. Connect once and it will open by itself next time.',
	'start.createFailed':
		'Could not open the fixed board. Check the id and password in the settings.',
	'settings.open': 'Settings',
	'settings.language': 'Language',
	'settings.version': 'Version',
	'settings.emulator': 'Local emulator',
	'settings.trail': 'Recent actions log',
	'settings.trailHint':
		'Written to browser storage, so it survives a crash. Copy and send it if something went wrong.',
	'settings.trailEmpty': 'Empty.',
	'settings.fixedTitle': 'Fixed board',
	'settings.fixedLead':
		'Put a board ID and password here that will not change. “Create” will then open THE SAME board every time, so there is nothing new to read out to colleagues.',
	'settings.fixedId': 'Fixed board ID',
	'settings.fixedPassword': 'Fixed password',
	'settings.generate': 'Generate',
	'settings.save': 'Save',
	'settings.saved': 'Saved',
	'settings.clear': 'Remove the fixed pair',
	'settings.emptyMeans': 'Empty fields mean “generate every time” — the default behaviour.',
	'settings.halfPair':
		'Both values are needed: the board address comes from the pair, so half of it does nothing.',
	'settings.reuseWarning':
		'One password for every board means a single leak opens them all. Fine for one room; separate groups deserve separate passwords.',

	'create.title': 'New board',
	'create.nameLabel': 'Name — so you can tell it apart',
	'create.namePlaceholder': 'Hall 2',
	'create.idLabel': 'Board ID',
	'create.passwordLabel': 'Password',
	'create.regenerate': 'Another password',
	'create.hint': 'Read these two lines out to whoever will control it from a phone.',
	'create.fromSettings':
		'This pair comes from settings, so it is THE SAME board as last time. Remove the fixed pair in settings to get a new one.',
	'create.weak':
		'Your password is shorter than {min} characters. A board lives for months — short passwords get guessed.',
	'create.warnChange':
		'The password is part of the board address. It cannot be changed later — you would have to create the board again.',
	'create.submit': 'Create and open the player',

	'connect.title': 'Connect to a board',
	'connect.idLabel': 'Board ID',
	'connect.passwordLabel': 'Password',
	'connect.submit': 'Connect',
	'connect.searching': 'Looking for the board…',
	'connect.remember': 'Remember this board on this device',
	'connect.notFound': 'No such board, or the password is wrong.',

	'player.title': 'Player',
	'player.subtitle': 'This computer will play the sound',
	'player.arm': 'Enable sound',
	'player.armed': 'Sound enabled',
	'player.armRefused':
		'The browser refused. Try again, or just pick a track — the permission is granted for that very tap.',
	'player.armHint':
		'Browsers will not play sound until a person allows it. Press once — after that the board is controlled from the phone.',
	'player.pickFolder': 'Choose a music folder',
	'player.changeFolder': 'Another folder',
	'player.rescan': 'Re-read the folder',
	'player.pickAgain':
		'The folder has to be chosen after every page reload: the browser crashes if the app tries to remember it.',
	'player.scanning': 'Reading the folder…',
	'player.tracksOne': '{count} track',
	'player.tracksFew': '{count} tracks',
	'player.tracksMany': '{count} tracks',
	'player.empty': 'There are no audio files in this folder.',
	'visibility.label': 'Who sees it',
	'visibility.all': 'Everyone',
	'visibility.player': 'This computer',
	'visibility.none': 'Nobody',
	'visibility.allHint': 'In the list here and on the remote.',
	'visibility.playerHint':
		'In the list here, the key works. Not on the remote — a phone cannot start it.',
	'visibility.noneHint': 'Nowhere: no row, no key. Bring it back under “Hidden”.',
	'visibility.playerMark': 'Hidden from the remote',
	'player.hiddenOpen': 'Hidden tracks',
	'player.hiddenCount': 'Hidden: {count}',
	'player.noSupport':
		'This browser cannot give a page access to a folder. Open the player in Chrome or Edge on a computer.',
	'player.insecure': 'An https connection or a localhost address is required.',
	'player.keepOpen': 'Keep this tab open — it is the one playing the sound.',
	'player.listeners': 'Remotes connected: {count}',
	'player.playHere': 'Play on this device',
	'player.moveUp': 'Move up',
	'player.moveDown': 'Move down',
	'player.configReadonly':
		'The folder was granted read-only, so order, colours and keys will not be saved. Choose the folder again and allow writing.',
	'player.volume': 'Volume',
	'player.showSecret': 'Board ID and password',
	'player.connect': 'Connect a remote',
	'player.connectHow': 'How to connect a phone',
	'player.connectStep1': 'Open this same address on the phone.',
	'player.connectStep2': 'Tap “Connect”.',
	'player.connectStep3': 'Enter the board id and password from here.',
	'player.connectAddress': 'Address',
	'player.connectCopyAll': 'Copy everything',
	'player.tips': 'Tips',
	'player.deckExpand': 'Expand the controls',
	'player.deckCollapse': 'Collapse the controls',
	'color.pick': 'Track colour',
	'color.label': 'Colour {n}',
	'color.none': 'No colour',

	'hotkeys.hint':
		'Space pauses, 0 stops, arrows change volume and seek, M mutes. Digits 1–9 always start tracks in list order, and any single key can be given to a track — that does not take the digits away.',
	'hotkeys.slot': 'Key {key}',
	'hotkeys.tipTitle': 'Keyboard shortcuts',
	'hotkeys.actPlayPause': 'pause or resume',
	'hotkeys.actStop': 'stop',
	'hotkeys.actTrack': 'track by its place in the list',
	'hotkeys.actSeek': 'seek by 5 seconds',
	'hotkeys.actVolume': 'volume',
	'hotkeys.actMute': 'mute',
	'hotkeys.tipFoot': 'Any single key can be given to a track — the digits stay as they are.',
	'hotkeys.assign': 'Hotkey',
	'hotkeys.pressAny': 'Press any key…',
	'hotkeys.none': 'Not assigned',
	'hotkeys.byOrder': 'By order: {key}',
	'hotkeys.clear': 'Clear',
	'hotkeys.reserved': 'The {key} key is taken by a control — pick another one.',
	'track.settings': 'Track settings',
	'track.open': 'Track settings',
	'track.displayName': 'Display name',
	'track.trigger': 'Start from an API',
	'track.paneMain': 'Track',
	'trigger.lead':
		'The app polls the address itself and starts the track when the condition BECOMES true. The other server must allow browser requests — otherwise an error shows below, and that is their decision, not ours.',
	'trigger.on': 'Poll it',
	'trigger.paneSource': 'Where to read from',
	'trigger.paneWhen': 'When to fire',
	'trigger.onChange': 'Only when the condition changed',
	'trigger.onChangeHint':
		'An alert lasts a long time, and the condition holds throughout. Turned off means “every time it holds” — the track will restart on every poll.',
	'trigger.fires': 'Fired times: {count}',
	'trigger.sharedOne': 'One request shared by {count} track',
	'trigger.sharedFew': 'One request shared by {count} tracks',
	'trigger.sharedMany': 'One request shared by {count} tracks',
	'trigger.url': 'Request address',
	'trigger.every': 'Ask every, seconds',
	'trigger.headers': 'Headers — one per line, “Name: value”',
	'trigger.headersHint':
		'Put the access key here. It is stored in the settings file inside your music folder.',
	'trigger.path': 'Path in the response',
	'trigger.pathHint': 'For example alerts.0.active. Empty means the whole response.',
	'trigger.test': 'Condition',
	'trigger.truthy': 'Value is not empty',
	'trigger.falsy': 'Value is empty',
	'trigger.equals': 'Equals',
	'trigger.notEquals': 'Does not equal',
	'trigger.contains': 'Contains',
	'trigger.notContains': 'Does not contain',
	'trigger.value': 'Compare with',
	'trigger.save': 'Save',
	'trigger.clear': 'Remove the API start',
	'trigger.never': 'Not polled yet.',
	'trigger.lastOk': 'Read: {value}',
	'trigger.errPolicy':
		'The app’s own security policy blocked this address. Usually that is a stale tab: reload the page (Ctrl+Shift+R).',
	'trigger.errNetwork':
		'The response could not be read. Usually the server does not allow requests from pages (the Access-Control-Allow-Origin header). That the address opens in its own tab does not contradict this — different rules apply there.',
	'trigger.errHttp': 'The server answered with code {detail}.',

	'sound.mute': 'Mute',
	'sound.unmute': 'Unmute',

	'remote.title': 'Remote',
	'remote.online': 'Computer is online',
	'remote.offline': 'Computer is offline',
	'remote.offlineHint':
		'The tab on the computer is closed. Open the board there and press “Enable sound”.',
	'remote.notArmedHint':
		'The computer is online, but sound is not enabled yet. Ask someone to press “Enable sound” on it.',
	'remote.nothing': 'Nothing is playing',
	'remote.play': 'Play',
	'remote.pause': 'Pause',
	'remote.resume': 'Play',
	'remote.prev': 'Previous',
	'remote.stop': 'Stop',
	'remote.next': 'Next',
	'remote.volume': 'Volume',
	'remote.sending': 'Sending…',
	'remote.noAck': 'The computer did not answer. Check that the tab is open.',
	'remote.emptyLibrary': 'No music folder has been chosen on the computer yet.',

	'error.network': 'No connection to the database. Check the internet.',
	'error.emulatorDown':
		'The local Firebase emulator is not running. Open a second terminal in the project folder and run: npm run emulators',
	'error.configMissing': 'Firebase is not configured: environment variables are missing.',
	'error.denied': 'The database refused access. Most likely the rules are not deployed yet.',
	'error.playback': 'Could not play the file: {name}',
	'error.fileGone': 'The file is gone from the folder: {name}',
	'error.dbOffline': 'No connection to the database.',
	'player.dbOffline':
		'No connection to the database. The remote will not see this board, and everything you do now stays on this computer.',
	'error.unknown': 'Something went wrong.'
};
