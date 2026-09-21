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

	'theme.group': 'Colour theme',
	'theme.light': 'Light',
	'theme.dark': 'Dark',
	'theme.system': 'Match device',
	'theme.switchToLight': 'Switch to the light theme',
	'theme.switchToDark': 'Switch to the dark theme',

	'common.back': 'Back',
	'common.close': 'Close',
	'common.copy': 'Copy',
	'common.copied': 'Copied',
	'common.loading': 'One moment…',

	'reload.ready': 'An update is ready.',
	'reload.apply': 'Update now',
	'reload.later': 'Later',

	'shell.ready': 'A new version of the app is out ({version}).',
	'shell.apply': 'Install and restart',
	'shell.later': 'Not now',
	'shell.warning': 'The app will close and reopen — sound stops for that moment.',
	'shell.failed': 'The update could not be installed. Try again, or download the app afresh.',

	'field.reveal': 'Show the password',
	'field.hide': 'Hide the password',
	'field.capsLock': 'Caps Lock is on',
	'field.layout': 'Looks like a Latin keyboard layout',

	'entry.lead': 'Audio board',
	'entry.create': 'Create',
	'entry.createHint': 'On the device that will play',
	'entry.connect': 'Connect',
	'entry.connectHint': 'To control someone else’s board',
	'entry.mine': 'My boards',
	'entry.forget': 'Remove from list',
	'entry.delete': 'Delete board',
	'entry.deleteConfirm':
		'Delete board “{name}”? It disappears from the database: nothing will be left at its address, and the library will have to be published again. The sound files themselves stay where they are.',
	'entry.deleteFailed':
		'Could not delete the board. Only the browser that created it can remove it.',

	'settings.title': 'Settings',
	'settings.boardMenu': 'Board menu',
	'settings.app': 'App settings',
	'settings.lookTitle': 'Appearance',
	'settings.launchTitle': 'Launch',
	'settings.showTitle': 'What to show',
	'settings.extraTitle': 'More',
	'settings.diagTitle': 'Diagnostics',
	'settings.startTitle': 'What to open on launch',
	'settings.autoStart': 'Start with the system',
	'settings.autoStartHint':
		'The app opens by itself as soon as you sign in. Handy where the device stands in the hall and does nothing else.',
	'settings.showTrigger': 'Mark tracks that start from an API',
	'settings.showTriggerHint':
		'An icon in the list row. It answers “why did that play by itself” without opening the track settings.',
	'settings.showInfoBoards': 'Show the cue board',
	'settings.showInfoBoardsHint':
		'The second kind of board: a grid of buttons an assistant in the hall uses to ask the sound engineer for something. Still being built, so hidden by default.',
	'settings.startBoardTitle': 'Which board to open',
	'settings.startBoardLead':
		'Pin a board where the remote is always the same one — a tablet in the hall, for instance.',
	'startBoard.last': 'The last one opened',
	'startBoard.fixed': 'A specific board',
	'settings.startLead':
		'Applies to launching the app only. The mark at the top left always leads to the menu, whatever is set here.',
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
	'reset.action': 'Reset the app',
	'reset.hint':
		'A last resort if the app will not open or keeps showing an old build. It clears AudioRemote data in this browser only — neighbouring sites and the boards themselves stay put.',
	'reset.confirm':
		'Reset AudioRemote in this browser? Settings, the board list and SAVED PASSWORDS will be gone, with nowhere to recover them from. The boards in the database and the sound files stay.',
	'settings.fixedTitle': 'Fixed board',
	'settings.folderTitle': 'Music folder',
	'settings.folderLead':
		'The app opens it on start. Paste the path from the file manager or pick it with the button.',
	'settings.folderLabel': 'Path to the folder',
	'settings.folderPick': 'Pick a folder',
	'settings.folderMissing': 'No such folder, or the app cannot read it.',
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
	'create.fromSettings':
		'This pair comes from settings, so it is THE SAME board as last time. Remove the fixed pair in settings to get a new one.',
	'create.weak':
		'Your password is shorter than {min} characters. A board lives for months — short passwords get guessed.',
	'create.keepCalm':
		'You do not have to write the identifier and password down: the connect button on the board itself shows them again at any time.',
	'create.submit': 'Create and open the player',

	'connect.title': 'Connect to a board',
	'connect.idLabel': 'Board ID',
	'connect.passwordLabel': 'Password',
	'connect.submit': 'Connect',
	'connect.searching': 'Looking for the board…',
	'connect.remember': 'Remember this board on this device',
	'connect.notFound': 'No such board, or the password is wrong.',

	'player.title': 'Player',
	'player.arm': 'Enable sound',
	'player.armRefused':
		'The browser refused. Try again, or just pick a track — the permission is granted for that very tap.',
	'player.armHint':
		'Browsers will not play sound until a person allows it. Press once — after that the board is controlled from other devices.',
	'player.folderHintTitle': 'A FOLDER picker is about to open',
	'player.folderHintLead':
		'That window will not show any files — that is normal, this is how picking a folder works. Do not look for the tracks: open the folder they are in and confirm the folder itself.',
	'player.folderHintHint':
		'The app reads the whole folder, subfolders included — the tracks will appear as a list here, on the board.',
	'player.folderHintHide': 'Do not show this again',
	'player.folderHintAccept': 'Got it, pick a folder',
	'player.pickFolder': 'Choose a music folder',
	'player.changeFolder': 'Another folder',
	'player.rescan': 'Re-read the folder',
	'player.pickAgain':
		'The folder has to be chosen every time this page opens: in a browser the app cannot hold on to it between visits.',
	'player.scanning': 'Reading the folder…',
	'player.tracksOne': '{count} track',
	'player.tracksFew': '{count} tracks',
	'player.tracksMany': '{count} tracks',
	'player.empty': 'There are no audio files in this folder.',
	'visibility.label': 'Who sees it',
	'visibility.all': 'Everyone',
	'visibility.player': 'Only here',
	'visibility.none': 'Nobody',
	'visibility.allHint': 'In the list here and on the remote.',
	'visibility.playerHint':
		'In the list here, the key works. Not on the remote — it cannot be started from there.',
	'visibility.noneHint': 'Nowhere: no row, no key. Bring it back under “Hidden”.',
	'visibility.playerMark': 'Hidden from the remote',
	'player.hiddenOpen': 'Hidden tracks',
	'player.hiddenCount': 'Hidden: {count}',
	'player.noSupport':
		'This browser cannot give a page access to a folder. Open the player in Chrome or Edge on a computer — or install the desktop app.',
	'player.insecure': 'An https connection or a localhost address is required.',
	'player.keepOpen': 'Keep this window open — it is the one playing the sound.',
	'player.listeners': 'Remotes connected: {count}',
	'player.playHere': 'Play on this device',
	'player.rootFolder': 'No subfolder',
	'player.moveUp': 'Move up',
	'player.moveDown': 'Move down',
	'player.configReadonly':
		'The folder was granted read-only, so order, colours and keys will not be saved. Choose the folder again and allow writing.',
	'player.autoNext': 'Start the next track',
	'player.repeatTitle': 'Repeat',
	'repeat.none': 'No repeat',
	'repeat.all': 'List',
	'repeat.one': 'Track',
	'player.repeatIdle': 'With the next-track switch off there is nothing to loop.',
	'player.volume': 'Volume',
	'player.seek': 'Seek',
	'player.connect': 'Connect a remote',
	'player.connectHow': 'How to connect a remote',
	'player.connectQuick': 'One link',
	'player.connectQuickHint':
		'The link carries no password — only the board address. But that address OPENS the board: whoever gets the link is inside.',
	'player.connectLink': 'Link',
	'player.connectCopyLink': 'Copy the link',
	'player.connectAuto': 'Open this board right away next time',
	'player.leaveTitle': 'Leave the board?',
	'player.leaveText':
		'The browser cannot remember the music folder: you will have to pick it again. The music stops too.',
	'player.leaveStay': 'Stay',
	'player.leaveGo': 'Leave anyway',
	'player.connectManual': 'Or by hand',
	'player.connectQrHint': 'Point a phone or tablet camera at it.',
	'player.connectStep1': 'Open this same address on the device that will control it.',
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
	'hotkeys.byOrder': 'Digit {key}, because the track is {nth} in the list',
	/* Ordinals in words — exactly nine of them; see the note in `uk.ts`. */
	'ordinal.1': 'first',
	'ordinal.2': 'second',
	'ordinal.3': 'third',
	'ordinal.4': 'fourth',
	'ordinal.5': 'fifth',
	'ordinal.6': 'sixth',
	'ordinal.7': 'seventh',
	'ordinal.8': 'eighth',
	'ordinal.9': 'ninth',
	'hotkeys.clear': 'Clear',
	'hotkeys.reserved': 'The {key} key is taken by a control — pick another one.',
	'track.settings': 'Track settings',
	'track.open': 'Track settings',
	'track.displayName': 'Display name',
	'track.emoji': 'Icon in the title',
	'track.emojiHint': 'emoji',
	'track.plays': 'How many times to play',
	'track.gap': 'Pause between plays, seconds',
	'track.gapHint': 'During the pause the track still counts as playing, and the remote shows that.',
	'track.trigger': 'Start from an API',
	'track.paneMain': 'Track',
	'trigger.lead':
		'The app polls the address itself and starts the track when the condition BECOMES true. The other server must allow browser requests — otherwise an error shows below, and that is their decision, not ours.',
	'trigger.on': 'Poll it',
	'trigger.paneSource': 'Where to read from',
	'trigger.paneWhen': 'When to fire',
	'trigger.schedule': 'Only at certain hours',
	'trigger.scheduleHint':
		'Outside the schedule the track will not start, and the address is not polled at all. Times follow the clock of the device that plays.',
	'trigger.scheduleNow': 'Outside the schedule right now.',
	'trigger.scheduleSame': 'Same hours every day',
	'week.mon': 'Mon',
	'week.tue': 'Tue',
	'week.wed': 'Wed',
	'week.thu': 'Thu',
	'week.fri': 'Fri',
	'week.sat': 'Sat',
	'week.sun': 'Sun',
	'week.from': 'Start, {day}',
	'week.to': 'End, {day}',
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
	'trigger.errTimeout':
		'The server did not answer within {detail}s — the request was aborted. It accepts the connection but sends nothing back: try a slower interval or another source.',

	'sound.mute': 'Mute',
	'sound.unmute': 'Unmute',

	'remote.title': 'Remote',
	'remote.online': 'Player is online',
	'remote.offline': 'Player is offline',
	'remote.offlineHint': 'The board is closed on the device that plays. Open it there.',
	'remote.notArmedHint':
		'The player is online, but sound is not enabled yet. Ask someone to press “Enable sound” where it plays.',
	'remote.nothing': 'Nothing is playing',
	'remote.pause': 'Pause',
	'remote.resume': 'Play',
	'remote.prev': 'Previous',
	'remote.stop': 'Stop',
	'remote.next': 'Next',
	'remote.volume': 'Volume',
	'remote.seek': 'Seek',
	'remote.noAck': 'The player did not answer. Check that the board is open where it plays.',
	'remote.connecting': 'Connecting…',
	'remote.emptyLibrary': 'No music folder has been chosen on the player yet.',
	'remote.emptyLibraryWait': 'Hold on: the folder is chosen on the device that will play.',

	// ─── The second kind of board: the cue board ─────────────────────────────
	/*
	 * BOARD AND CUE — the role names in this kind of board.
	 *
	 * The roles are the same as in audio (`player` owns it, `remote` drives it),
	 * but the words differ, because the question differs. “Player” answers “what
	 * does this device do with sound”, and here there is no sound at all: one
	 * shows, the other asks. Reusing “player” would put the word on the screen of
	 * the person at the sound desk, who would then look for the music.
	 */
	'info.lead': 'Cue board',
	'info.leadHint':
		'An assistant in the hall presses a button; at the sound desk it is plain what was asked for. No talking, no walkie-talkie.',
	'info.create': 'Create',
	'info.createHint': 'On the device by the sound desk',
	'info.connect': 'Connect',
	'info.connectHint': 'To send cues from the hall',
	'info.createTitle': 'New cue board',
	'info.createSubmit': 'Create and open the board',
	'info.connectTitle': 'Connect to a cue board',
	'info.boardTitle': 'Board',
	'info.remoteTitle': 'Cue',
	'info.helpers': 'Cues connected: {count}',
	'info.boardOnline': 'Board online',
	'info.boardOffline': 'Board offline',
	'info.noPanel': 'No panel yet. The buttons for the assistant are added here, on the board.',
	'info.connectHelper': 'Connect an assistant',
	'info.connectHow': 'How to connect an assistant',
	'info.connectStep2': 'Tap “Connect” in the “Cue board” section.',
	'info.fillStarter': 'Build a starter panel',
	'info.fillStarterHint':
		'Two groups of buttons, a slider and a switch — what a hall starts with. Everything is editable afterwards.',
	'info.offlineHint': 'The board is closed. Open it on the device by the sound desk.',
	'info.noPanelRemote':
		'No panel yet. It is assembled on the board — the device by the sound desk.',

	// ─── The cue board panel ─────────────────────────────────────────────────
	/*
	 * THE DIRECTION IS GENERIC, THE SUBJECT IS IN THE CAPTION.
	 *
	 * “More”, not “louder”: a slider can stand for anything with a scale, and
	 * “louder” on a cell captioned “lights” would read as a mistake. What gets
	 * more is said by the caption the host wrote.
	 *
	 * The starter panel's captions are a different matter: they go into the
	 * database as finished text and belong to the person from then on. See the
	 * docblock in `starter.ts`.
	 */
	'panel.edit': 'Build the panel',
	'panel.editDone': 'Done',
	'panel.editHint':
		'Tap a cell to put buttons, a slider or a switch into it. Empty places stay empty — they are what keeps the grid steady.',
	'panel.cellTitle': 'Cell {n}',
	'panel.kind': 'What is in the cell',
	'panelKind.none': 'Empty',
	'panelKind.buttons': 'Buttons',
	'panelKind.slider': 'Slider',
	'panelKind.check': 'Switch',
	'panel.caption': 'Cell caption',
	'panel.captionHint': 'Keep it short: “microphone”, “backing track”. A long one will not fit.',
	'panel.buttonsTitle': 'Button labels',
	'panel.buttonsHint':
		'Empty fields do not become buttons. Four is the limit: a fifth will not fit alongside the caption.',
	'panel.buttonLabel': 'Button {n}',
	'panel.addButton': 'Add a button',
	'panel.step': 'Step',
	'panel.stepHint': 'How much one press moves it.',
	'panel.icon': 'Icon in the caption',
	'panel.color': 'Widget colour',
	'panel.turn': 'Turn',
	'panel.turnDown': 'Down a column',
	'panel.turnAcross': 'Across a row',
	'panel.spanHint': 'Takes {count} cells. The mouse wheel over the widget turns it too.',
	'panel.noRoom':
		'A widget this size does not fit here: there is no room, or a neighbour is in the way. Turn it, drop a button, or choose another place.',
	'panel.save': 'Save',
	'panel.clearCell': 'Empty the cell',
	'panel.cellEmpty': 'empty',
	'panel.summarySlider': 'slider, step {step}',
	'panel.summaryCheck': 'switch',
	'panel.buttonsOne': '{count} button',
	'panel.buttonsFew': '{count} buttons',
	'panel.buttonsMany': '{count} buttons',
	'panel.up': 'More',
	'panel.down': 'Less',
	'panel.on': 'On',
	'panel.off': 'Off',
	/* The same directions as a line in the log: “overall level — more”. */
	'panel.wentUp': 'more',
	'panel.wentDown': 'less',
	'panel.turnedOn': 'turned on',
	'panel.turnedOff': 'turned off',
	'panel.change': 'was {from} — now {to}',
	'panel.logTitle': 'Recent actions',
	'panel.byHost': 'here',
	'panel.logEmpty': 'Nothing has happened yet.',
	'panel.viewTitle': 'What to show',
	'panelView.both': 'Both',
	'panelView.panel': 'Panel',
	'panelView.log': 'Log',
	'panel.noAck': 'The board did not answer. Check that it is open by the sound desk.',
	'panel.noCell': 'That cell is no longer on the panel.',
	'panel.wrongKind': 'The cell changed while the request was on its way. Try again.',
	'panel.badValue': 'The board did not understand the request.',
	'panel.louder': 'louder',
	'panel.fine': 'fine',
	'panel.quieter': 'quieter',
	'panel.track': 'backing track',
	'panel.mic': 'microphone',
	'panel.overall': 'overall level',
	'panel.ready': 'ready',

	// ─── Third role: administrator ───────────────────────────────────────────
	'admin.title': 'Administrator',
	'admin.allow': 'Allow settings from a remote',
	'admin.password': 'Administrator password',
	'admin.turnOn': 'Turn on',
	'admin.change': 'Change password',
	'admin.hint':
		'A remote that enters this password can change the board: titles, colours, keys, repeats, visibility, API triggers and order. This password is separate from the board password.',
	'admin.onHint': 'Allowed. Give this password to whoever will set the board up from their device.',
	'admin.offHint': 'Off: a remote can only play sound, not change the board.',
	'admin.enter': 'Sign in as administrator',
	'admin.leave': 'Leave administrator',
	'admin.askPassword': 'Enter the administrator password for this board.',
	'admin.wrong': 'Wrong password, or this board has no administrator turned on.',
	'admin.mode': 'Administrator mode',
	'admin.modeHint': 'You are changing the board. Changes go to the device that plays.',
	'admin.waiting': 'Waiting for settings from the player…',
	'admin.rescan': 'Re-read the folder',
	'admin.stale':
		'The board changed elsewhere just now. Reopen the track settings for fresh values.',
	'admin.badPatch': 'The player did not understand the change.',
	'admin.noFolder': 'The folder can only be chosen on the device that plays.',

	'contact.title': 'Get in touch',
	'contact.lead': 'One person made this app. Write — I answer.',
	'contact.what1': 'Something is broken or behaves oddly',
	'contact.what2': 'A feature you need is missing',
	'contact.what3': 'You need an app or a site of your own',

	'error.network': 'No connection to the database. Check the internet.',
	'error.emulatorDown':
		'The local Firebase emulator is not running. Open a second terminal in the project folder and run:',
	'error.configMissing': 'Firebase is not configured: environment variables are missing.',
	'error.denied': 'The database refused access. Most likely the rules are not deployed yet.',
	'error.playback': 'Could not play the file: {name}',
	'error.fileGone': 'The file is gone from the folder: {name}',
	'error.dbOffline': 'No connection to the database.',
	'player.libraryDenied':
		'The database refused the track list, so remotes see an empty board. Most likely its rules are out of date: publish the current database.rules.json. Sound here keeps working.',
	'player.dbOffline':
		'No connection to the database. The remote will not see this board, and everything you do now stays on this device.',
	'error.crashTitle': 'This page broke',
	'error.notFound': 'No such page',
	'error.crashHint':
		'This is our bug, not something you did. Try showing the page again — if that fails, go back to the menu and open the board anew.',
	'error.retry': 'Show it again',
	'error.toMenu': 'To the menu',
	'error.unknown': 'Something went wrong.'
};
