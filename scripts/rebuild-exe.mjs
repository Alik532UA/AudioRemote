/**
 * ЗІБРАТИ ЗАСТОСУНОК ДЛЯ КОМП'ЮТЕРА — одним рухом із провідника.
 *
 * Запускається з `rebuild-exe.bat` у корені. Сам `.bat` лишається латиницею
 * навмисно: cmd читає власний файл у системному кодуванні, і український текст
 * у ньому виводиться кракозябрами. Node таких проблем не має, тож усе, що
 * читає людина, живе тут.
 *
 * ФРОНТЕНД ТУТ НЕ ЗБИРАЄТЬСЯ, і це не економія. Сторінку застосунок бере з
 * мережі, тож правки в `src/` доїжджають деплоєм і перезапуском вікна.
 * Перезбирати exe треба лише тоді, коли змінилося `src-tauri`.
 *
 * Запуск: node scripts/rebuild-exe.mjs [--run]
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cargo = join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'cargo.exe');
const exe = join(root, 'src-tauri', 'target', 'debug', 'audioremote.exe');

if (!existsSync(cargo)) {
	console.error('Rust не встановлено. Постав його один раз:');
	console.error('    winget install Rustlang.Rustup');
	process.exit(1);
}

console.log('Збираю нативну частину…\n');

const built = spawnSync(cargo, ['build', '--manifest-path', join(root, 'src-tauri', 'Cargo.toml')], {
	stdio: 'inherit',
	cwd: root
});

if (built.status !== 0) {
	console.error('\nЗбірка впала.');
	console.error('Найчастіша причина — відкритий застосунок тримає файл:');
	console.error('закрийте вікно AudioRemote і запустіть ще раз.');
	process.exit(1);
}

console.log(`\nГотово: ${exe}`);

if (process.argv.includes('--run')) {
	// `detached`, бо інакше вікно застосунку вмирало б разом із цим процесом.
	spawnSync('cmd', ['/c', 'start', '""', exe], { stdio: 'ignore' });
	console.log('Застосунок запущено.');
}
