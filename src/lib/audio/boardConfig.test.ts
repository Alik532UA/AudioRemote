import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig, emptyConfig } from './boardConfig';

describe('файл налаштувань папки', () => {
	it('старий прапорець «приховано» читається як «ніде»', () => {
		/*
		 * Доти стан був один і означав саме це. Прочитати його як «видно» — значить
		 * після оновлення показати в залі треки, які людина свідомо сховала, і
		 * дізнатися про це вона могла б лише з гучномовця.
		 */
		const config = parseConfig(JSON.stringify({ tracks: [{ path: 'Сирена.mp3', hidden: true }] }));
		expect(config.tracks[0].visibility).toBe('none');
	});

	it('нове поле читається як є', () => {
		const config = parseConfig(
			JSON.stringify({ tracks: [{ path: 'Гімн.mp3', visibility: 'player' }] })
		);
		expect(config.tracks[0].visibility).toBe('player');
	});

	it('«видно всім» у файлі не пишеться взагалі', () => {
		// Типовий стан не має займати місце у файлі, який відкривають блокнотом.
		const text = serializeConfig({
			...emptyConfig(),
			tracks: [{ path: 'Вихід.mp3' }]
		});
		expect(text).not.toContain('visibility');
	});

	it('чуже значення видимості не приймається', () => {
		const config = parseConfig(
			JSON.stringify({ tracks: [{ path: 'Гімн.mp3', visibility: 'секретно' }] })
		);
		expect(config.tracks[0].visibility).toBeUndefined();
	});

	it('зіпсований файл — це «налаштувань немає», а не падіння', () => {
		expect(parseConfig('{ це не json').tracks).toEqual([]);
		expect(parseConfig('null').tracks).toEqual([]);
	});
});
