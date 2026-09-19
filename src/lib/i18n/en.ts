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
	'settings.open': 'Settings',
	'settings.language': 'Language',
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
	'player.arm': 'Enable sound on this device',
	'player.armed': 'Sound enabled',
	'player.armHint':
		'Browsers will not play sound until a person allows it. Press once — after that the board is controlled from the phone.',
	'player.pickFolder': 'Choose a music folder',
	'player.changeFolder': 'Another folder',
	'player.rescan': 'Re-read the folder',
	'player.folderLost': 'Access to the folder was lost. Press to restore it.',
	'player.restore': 'Restore access',
	'player.scanning': 'Reading the folder…',
	'player.found': 'Tracks found: {count}',
	'player.empty': 'There are no audio files in this folder.',
	'player.hide': 'Hide from the remote',
	'player.show': 'Show',
	'player.hiddenCount': 'Hidden: {count}',
	'player.noSupport':
		'This browser cannot give a page access to a folder. Open the player in Chrome or Edge on a computer.',
	'player.insecure': 'An https connection or a localhost address is required.',
	'player.keepOpen': 'Keep this tab open — it is the one playing the sound.',
	'player.listeners': 'Remotes connected: {count}',
	'player.playHere': 'Play on this device',
	'player.volume': 'Volume',
	'color.pick': 'Track colour',
	'color.label': 'Colour {n}',
	'color.none': 'No colour',

	'hotkeys.hint': 'Keys: 1…9 for tracks, 0 to stop, − and + for volume, M for mute',
	'hotkeys.slot': 'Key {key}',

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
	'remote.resume': 'Resume',
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
	'error.unknown': 'Something went wrong.'
};
