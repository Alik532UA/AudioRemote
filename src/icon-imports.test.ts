import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ЖОДНОГО БАРЕЛЬНОГО ІМПОРТУ ЗНАЧКІВ.
 *
 * Причина описана в `src/lib/config/icons.ts`: барель тягне на розбір близько
 * двох тисяч компонентів, і збірка падає з «FATAL ERROR: Zone Allocation failed
 * - process out of memory» ще на етапі `transforming`. Помилка при цьому НЕ
 * називає ні значків, ні файлу — вона виглядає як поламаний Vite, і півгодини
 * йде на те, щоб зрозуміти, що зламав її один рядок імпорту.
 *
 * Перевірка стоїть тут, а не в eslint: правило eslint вимикається коментарем у
 * рядку, а цей клас помилки коштує надто дорого тому, хто його не бачив.
 */
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});

/** Шлях із косими рисками — щоб повідомлення читалося однаково на всіх машинах. */
const posix = (path: string): string => path.split(sep).join('/');

/*
 * Регулярки дивляться на ОПЕРАТОР import/export, а не на будь-яке входження
 * рядка. Інакше перший же коментар, який ПОЯСНЮЄ, чому барель заборонений, сам
 * валив би цю перевірку — і єдиним способом лишити гейт зеленим було б прибрати
 * пояснення. Крапка в JS не збігається з переносом рядка, тож `.*` тут не вийде
 * за межі одного оператора.
 */
const BARREL = /^\s*(?:import|export).*from\s+'@lucide\/svelte'/m;
const DEEP = /^\s*(?:import|export).*from\s+'(@lucide\/svelte[^']*)'/gm;

describe('імпорти значків', () => {
	it('лише глибокі шляхи, і лише через реєстр', () => {
		const registry = join('src', 'lib', 'config', 'icons.ts');

		const offenders = walk('src')
			.filter((file) => /\.(ts|svelte)$/.test(file))
			.filter((file) => file !== registry)
			.filter((file) => BARREL.test(readFileSync(file, 'utf8')))
			.map(posix);

		expect(offenders).toEqual([]);
	});

	it('сам реєстр бере значки лише глибокими шляхами', () => {
		const registry = readFileSync(join('src', 'lib', 'config', 'icons.ts'), 'utf8');
		const imports = [...registry.matchAll(DEEP)].map((match) => match[1]);

		expect(imports.length).toBeGreaterThan(0);
		expect(imports.filter((path) => !path.startsWith('@lucide/svelte/icons/'))).toEqual([]);
	});
});
