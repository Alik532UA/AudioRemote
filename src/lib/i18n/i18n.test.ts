import { describe, expect, it } from 'vitest';
import { en } from './en';
import { uk } from './uk';

/**
 * ПАРИТЕТ СЛОВНИКІВ — і чому типу для цього мало.
 *
 * `Record<TranslationKey, string>` не дає ЗАБУТИ ключ, і це вже багато. Але він
 * не бачить двох речей, які трапляються частіше за забутий ключ: порожнього
 * рядка на місці перекладу й значення, скопійованого з української «щоб потім
 * перекласти». І те, й те проходить перевірку типів і виглядає як зроблена
 * робота.
 */
describe('словники', () => {
	const ukKeys = Object.keys(uk) as (keyof typeof uk)[];

	it('однаковий набір ключів', () => {
		expect(Object.keys(en).sort()).toEqual([...ukKeys].sort());
	});

	it('жодного порожнього значення', () => {
		const empty = [...ukKeys].filter((key) => !uk[key].trim() || !en[key].trim());
		expect(empty).toEqual([]);
	});

	it('жодного неперекладеного значення', () => {
		/*
		 * Виняток один — назва застосунку: вона однакова навмисно. Решта збігів
		 * означає «скопіювали й забули».
		 */
		const untranslated = ukKeys.filter((key) => key !== 'app.name' && uk[key] === en[key]);
		expect(untranslated).toEqual([]);
	});

	it('однаковий набір підстановок у кожному ключі', () => {
		const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
		const mismatched = ukKeys.filter(
			(key) => placeholders(uk[key]).join() !== placeholders(en[key]).join()
		);
		expect(mismatched).toEqual([]);
	});
});
