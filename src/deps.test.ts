// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ЛАНЦЮГ ПОСТАЧАННЯ: ЩО САМЕ ПРИЇДЕ В БРАУЗЕР ВІДВІДУВАЧА
 * (DEPENDENCIES-v9 § 1–3, `DEP-DEPENDABOT`).
 *
 * Тут перевіряється не якість пакетів, а три речі, через які «те, що
 * протестували» й «те, що зібралося» розходяться мовчки:
 *
 *  1. ДВА LOCKFILE. `npm ci` читає `package-lock.json`, а той, хто запустив
 *     `yarn`, лишає поруч `yarn.lock` — і локальна машина ставить одні версії,
 *     а CI інші. Помилка при цьому вилазить не в залежності, а в коді, який
 *     «раптом перестав працювати».
 *  2. ПЛАВАЮЧА ВЕРСІЯ (`*`, `latest`, `x`). Реліз, випущений уночі, змінює
 *     збірку без жодного коміту в репозиторії, і причини цього не видно ніде.
 *  3. ІНСТРУМЕНТ У `dependencies`. Усе звідти їде у прод-аудит і в граф
 *     збірки; лінтер серед прод-залежностей робить `npm audit --omit=dev`
 *     твердженням не про те.
 *
 * Плюс сам Dependabot: без нього питання «чи є відома вразливість» ставить
 * тільки той, хто про нього згадав.
 */

const ROOT = process.cwd();
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

const pkg = JSON.parse(read('package.json')) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	engines?: Record<string, string>;
};

const dependencies = pkg.dependencies ?? {};
const devDependencies = pkg.devDependencies ?? {};

describe('залежності (DEPENDENCIES-v9)', () => {
	it('перевірка жива: package.json прочитано', () => {
		expect(Object.keys(dependencies).length, 'жодної залежності — розбір зламався').toBeGreaterThan(
			2
		);
		expect(Object.keys(devDependencies).length).toBeGreaterThan(5);
	});

	it('lockfile рівно один, і це package-lock.json', () => {
		const others = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'].filter((file) =>
			existsSync(join(ROOT, file))
		);
		expect(others, `другий lockfile: ${others.join(', ')}`).toEqual([]);
		expect(existsSync(join(ROOT, 'package-lock.json')), 'немає package-lock.json').toBe(true);
	});

	it('жодної плаваючої версії', () => {
		const floating = Object.entries({ ...dependencies, ...devDependencies })
			.filter(([, range]) => /^(\*|latest|x|>=?)/.test(range.trim()))
			.map(([name, range]) => `${name}: ${range}`);
		expect(floating, `версія вирішується під час встановлення:\n${floating.join('\n')}`).toEqual(
			[]
		);
	});

	it('інструменти не живуть у dependencies', () => {
		/*
		 * Перевіряється не перелік імен, а ознака: пакет, який потрібен лише
		 * збірці чи перевірці, у прод-залежностях означає, що `npm audit
		 * --omit=dev` і бюджет бандла міряють не той набір.
		 */
		const TOOLING = /^(eslint|prettier|vitest|typescript|@playwright|@types\/|svelte-check|vite$)/;
		const misplaced = Object.keys(dependencies).filter((name) => TOOLING.test(name));
		expect(misplaced, `інструмент у dependencies: ${misplaced.join(', ')}`).toEqual([]);
	});

	it('версія Node закріплена в engines', () => {
		// Інакше «у мене працює» означає рівно стільки, скільки версія на тій
		// машині: збірка під Node 20 і під Node 24 — різні збірки.
		expect(pkg.engines?.node, 'немає engines.node').toBeTruthy();
	});

	it('Dependabot налаштований на npm і на дії GitHub', () => {
		const config = read('.github/dependabot.yml');
		expect(config, 'немає оновлень npm').toContain('package-ecosystem: npm');
		expect(config, 'дії GitHub — така сама залежність').toContain(
			'package-ecosystem: github-actions'
		);
	});

	it('аудит прод-залежностей є кроком CI', () => {
		const workflows = readdirSync(join(ROOT, '.github/workflows'))
			.filter((file) => /\.ya?ml$/.test(file))
			.map((file) => read(join('.github/workflows', file)))
			.join('\n')
			.split('\n')
			.filter((line) => !/^\s*#/.test(line))
			.join('\n');

		expect(/run:\s*npm audit/.test(workflows), 'у workflow немає кроку npm audit').toBe(true);
		expect(
			/npm audit[^\n]*--omit=dev/.test(workflows),
			'аудит без --omit=dev червонітиме на інструментах, які в браузер не їдуть, ' +
				'і його вимкнуть разом із прод-залежностями'
		).toBe(true);
	});

	it('дії GitHub беруться за мажором, а не за гілкою', () => {
		// `uses: …@main` — це чужий код, який міняється без нашого відома, з
		// правами на цей репозиторій.
		const workflows = readdirSync(join(ROOT, '.github/workflows'))
			.filter((file) => /\.ya?ml$/.test(file))
			.flatMap((file) => read(join('.github/workflows', file)).split('\n'))
			.filter((line) => !/^\s*#/.test(line));

		const uses = workflows.flatMap((line) => [...line.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]));
		expect(uses.length, 'жодного uses: — сканер шукає не там').toBeGreaterThan(2);

		const loose = uses.filter((ref) => /@(main|master|latest)$/.test(ref) || !ref.includes('@'));
		expect(loose, `дія без закріпленої версії: ${loose.join(', ')}`).toEqual([]);
	});
});
