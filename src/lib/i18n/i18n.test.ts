import { describe, expect, it } from 'vitest';
import { en } from './en';
import { i18n, plural } from './i18n.svelte';
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

describe('множина', () => {
	const tracks = {
		one: 'player.tracksOne',
		few: 'player.tracksFew',
		other: 'player.tracksMany'
	} as const;

	const inLocale = (locale: 'uk' | 'en', count: number) => {
		const was = i18n.locale;
		i18n.locale = locale;
		try {
			return plural(tracks, count);
		} finally {
			i18n.locale = was;
		}
	};

	it.each([
		[1, '1 трек'],
		[2, '2 треки'],
		[4, '4 треки'],
		[5, '5 треків'],
		[8, '8 треків'],
		[0, '0 треків']
	])('українською %i — «%s»', (count, expected) => {
		expect(inLocale('uk', count)).toBe(expected);
	});

	it.each([11, 12, 13, 14])('%i — «треків», а не «треки»', (count) => {
		/*
		 * ГОЛОВНИЙ ВИПАДОК. Саме на цих числах ламається наївна перевірка за
		 * останньою цифрою: 11 закінчується на 1, але «11 трек» — не українська.
		 * Заради них тут і стоїть `Intl.PluralRules`.
		 */
		expect(inLocale('uk', count)).toBe(`${count} треків`);
	});

	it.each([
		[1, '1 track'],
		[2, '2 tracks'],
		[8, '8 tracks']
	])('англійською %i — «%s»', (count, expected) => {
		expect(inLocale('en', count)).toBe(expected);
	});
});
