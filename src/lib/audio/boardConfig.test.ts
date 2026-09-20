import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig, emptyConfig, MAX_PLAYS } from './boardConfig';

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

describe('повтори треку', () => {
	it('одне відтворення у файлі не пишеться', () => {
		// Типовий випадок не має займати місце у файлі, який відкривають блокнотом.
		const text = serializeConfig({ ...emptyConfig(), tracks: [{ path: 'Гонг.mp3' }] });
		expect(text).not.toContain('plays');
		expect(text).not.toContain('gapSec');
	});

	it('читається як є', () => {
		const config = parseConfig(
			JSON.stringify({ tracks: [{ path: 'Сирена.mp3', plays: 3, gapSec: 10 }] })
		);
		expect(config.tracks[0].plays).toBe(3);
		expect(config.tracks[0].gapSec).toBe(10);
	});

	it('дурниця з файлу підтягується до меж, а не ламає плеєр', () => {
		/*
		 * Файл правлять руками, і «програти 10000 разів» там з'явиться раніше, ніж
		 * у вікні налаштувань. Півдня сирени — не та помилка, яку варто пускати.
		 */
		const config = parseConfig(
			JSON.stringify({
				tracks: [
					{ path: 'a.mp3', plays: 10_000, gapSec: -5 },
					{ path: 'b.mp3', plays: 0 },
					{ path: 'c.mp3', plays: 'три', gapSec: 'довго' }
				]
			})
		);
		expect(config.tracks[0].plays).toBe(MAX_PLAYS);
		expect(config.tracks[0].gapSec).toBeUndefined();
		expect(config.tracks[1].plays).toBeUndefined();
		expect(config.tracks[2].plays).toBeUndefined();
	});
});
