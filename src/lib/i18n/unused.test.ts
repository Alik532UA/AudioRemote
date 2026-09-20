import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { uk } from './uk';

/**
 * КЛЮЧ, ЯКОГО НІХТО НЕ ПОКАЗУЄ, — ЦЕ НЕ ЗАПАС, А ПАСТКА.
 *
 * Мертвих рядків набралося десять: `player.subtitle` описував сторінку, якої
 * такою вже немає, `hotkeys.hint` лишився від підказки, переписаної в таблицю.
 * Шкода не в кілобайтах — у тому, що їх РЕДАГУЮТЬ. Під час правки термінології
 * я сумлінно переписав два з них, і жодного з переписаного ніхто б не побачив.
 *
 * ## Чому просто «пошук рядка» тут недостатньо
 *
 * Частину ключів збирають у коді: `t(`trigger.${test}`)`, `plural({ one: … })`,
 * масив днів тижня, `describeError`, який повертає ключ помилки. Тому ключ
 * вважається вжитим, якщо його видно ЦІЛКОМ або якщо десь є шаблон із його
 * початком — `` `visibility.${…}` `` покриває всі `visibility.*`.
 *
 * Це свідомо м'якша перевірка, ніж могла б бути: вона пропустить мертвий ключ у
 * живій родині. Зате не вимагає списку винятків, який сам стає тим, що ніхто не
 * оновлює.
 */

const SRC = 'src';

function files(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const full = join(directory, entry);
		if (statSync(full).isDirectory()) return files(full);
		// Самі словники не рахуються: у них ключ є за побудовою.
		if (full.includes(join('lib', 'i18n'))) return [];
		return /\.(svelte|ts)$/.test(entry) ? [full] : [];
	});
}

describe('словник без мертвих ключів', () => {
	it('кожен ключ десь показується', () => {
		const code = files(SRC)
			.map((file) => readFileSync(file, 'utf8'))
			.join('\n');

		// `t(`trigger.${test}`)` → початок «trigger.»
		const prefixes = [...code.matchAll(/`([a-zA-Z][\w.]*\.)\$\{/g)].map((match) => match[1]);

		const dead = (Object.keys(uk) as (keyof typeof uk)[]).filter((key) => {
			if (code.includes(`'${key}'`)) return false;
			return !prefixes.some((prefix) => key.startsWith(prefix));
		});

		expect(dead).toEqual([]);
	});
});
