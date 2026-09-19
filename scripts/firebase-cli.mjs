/**
 * Запустити Firebase CLI, не ставлячи його в залежності проєкту.
 *
 * Використання: `node scripts/firebase-cli.mjs emulators:exec --only database "…"`.
 *
 * ЧОМУ НЕ devDependency. `firebase-tools` тягне `superstatic`, який оголошує
 * `node: "20 || 22 || 24"`. У проєкті стоїть `engine-strict=true` (`.npmrc`) —
 * свідоме рішення, бо саме воно ловить розходження версії Node між машиною й
 * CI. Разом це означає, що на Node 25 падає не встановлення firebase-tools, а
 * `npm install` ЦІЛКОМ: жодну залежність поставити не вдається. Тобто інструмент
 * для перевірки правил зламав би щоденну роботу над рештою проєкту.
 *
 * ЧОМУ НЕ ПРОСТО npx. `npx` читає `.npmrc` із поточної теки, тож упирається в
 * той самий `engine-strict` і навіть не завантажує пакет.
 *
 * ЩО РОБИТЬ ЦЕ. Знімає перевірку рухомого складу РІВНО для цього одного виклику,
 * через змінну оточення дочірнього процесу. Вимкнути її тут безпечно й дешево:
 * це CLI, який ніколи не потрапляє ні в бандл, ні в браузер відвідувача, а
 * несумісність у ньому не гіпотетична, а вже перевірена — прогін на 15.27.0
 * проходить.
 *
 * ЧОМУ ЦЕ НЕ РЯДОК У package.json. Префікс `VAR=value команда` — синтаксис
 * POSIX-оболонки. На Windows npm-скрипти йдуть через `cmd.exe`, де такий рядок
 * не запускається взагалі, а `check:rules` мусить працювати на машині автора так
 * само, як у CI.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error('firebase-cli.mjs: потрібні аргументи для firebase CLI');
	process.exit(2);
}

/**
 * ЗРОЗУМІЛА ВІДМОВА ЗАМІСТЬ НЕЗРОЗУМІЛОЇ: порти емулятора перевіряються ДО запуску.
 *
 * Емулятор лишає java-процес на своєму порті, коли попередній прогін упав або
 * його зупинили. Наступний `check:rules` тоді падає рядком
 *
 *     Error: Could not start Database Emulator, port taken.
 *
 * і читається це як «правила зламані» — тобто саме як те, що гейт мав би
 * знайти. Рецепт лікування записаний і в `AGENTS.md`, і в `PROJECT-CONTEXT.md`,
 * але документ читають ПІСЛЯ того, як відмова вже збила з пантелику.
 *
 * Перевірка стоїть перед `npx` навмисно: інакше на цю відмову спершу
 * витрачається завантаження `firebase-tools` (десятки секунд), і лише потім
 * зʼясовується, що запускати його не було сенсу.
 */
const EMULATOR_COMMAND = /^emulators:/;

/** Порти з `firebase.json` — ті, що емулятор справді займе. */
function emulatorPorts() {
	const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
	const emulators = config.emulators ?? {};
	return Object.entries(emulators)
		.filter(([, value]) => value && typeof value === 'object' && value.enabled !== false)
		.map(([name, value]) => ({ name, port: value.port }))
		.filter((entry) => Number.isInteger(entry.port));
}

/**
 * Чи слухає щось цей порт.
 *
 * Саме `127.0.0.1`, а не `localhost`: емулятор дивиться туди ж, і відмову він
 * формулює як «Port 9010 is not open on localhost (127.0.0.1)». Перевірка на
 * іншому інтерфейсі мовчала б там, де падає запуск.
 */
function portTaken(port) {
	return new Promise((resolve) => {
		const socket = connect({ port, host: '127.0.0.1' });
		const done = (taken) => {
			socket.destroy();
			resolve(taken);
		};
		socket.setTimeout(1000);
		socket.once('connect', () => done(true));
		socket.once('timeout', () => done(false));
		socket.once('error', () => done(false));
	});
}

if (EMULATOR_COMMAND.test(args[0])) {
	const busy = [];
	for (const entry of emulatorPorts()) {
		if (await portTaken(entry.port)) busy.push(entry);
	}
	if (busy.length > 0) {
		const list = busy.map((entry) => `${entry.port} (${entry.name})`).join(', ');
		// Рецепт саме для цієї платформи: половина «на всяк випадок» — це рядок,
		// який читач мусить спершу відсіяти.
		const recipe =
			process.platform === 'win32'
				? busy
						.map((entry) => `  netstat -ano | findstr :${entry.port}\n  taskkill /PID <pid> /F`)
						.join('\n')
				: busy.map((entry) => `  lsof -ti tcp:${entry.port} | xargs kill -9`).join('\n');
		console.error(
			`firebase-cli.mjs: порт емулятора зайнятий — ${list}.\n` +
				'Найімовірніше це процес від попереднього прогону: емулятор лишає його, ' +
				'коли прогін упав або його зупинили. Це НЕ поломка правил.\n' +
				`Зняти:\n${recipe}`
		);
		process.exit(1);
	}
}

/** Мажор фіксуємо: `latest` міняв би поведінку гейта без жодного коміту. */
const CLI = 'firebase-tools@15';

/*
 * Аргументи склеюються в РЯДОК, і пробільні беруться в лапки вручну.
 *
 * Оболонка тут обовʼязкова: на Windows `npx` — це `npx.cmd`, а Node з версії 18
 * навмисно відмовляється запускати `.cmd` без `shell: true`. Але з оболонкою
 * масив аргументів просто конкатенується, тож `emulators:exec "node scripts/…"`
 * розпадався на два аргументи, і CLI казав «Too many arguments» — виміряно, це
 * була перша спроба.
 */
const command = [
	'npx',
	'--yes',
	CLI,
	...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
].join(' ');

const child = spawn(command, {
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, npm_config_engine_strict: 'false' }
});

child.on('error', (error) => {
	console.error('firebase-cli.mjs: не вдалося запустити npx —', error.message);
	process.exit(1);
});

// Код виходу передається НАСКРІЗЬ: гейт, який завжди повертає 0, — це не гейт.
child.on('exit', (code, signal) => {
	if (signal) {
		console.error(`firebase-cli.mjs: процес зупинено сигналом ${signal}`);
		process.exit(1);
	}
	process.exit(code ?? 1);
});
