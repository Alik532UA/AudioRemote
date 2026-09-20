import { describe, expect, it } from 'vitest';
import { defaultSchedule, withinSchedule, type WeekSchedule } from './trigger';

/** Понеділок 2026-09-21, вказана година за місцевим часом. */
const monday = (hours: number, minutes = 0) => new Date(2026, 8, 21, hours, minutes);
/** Вівторок наступного дня — щоб перевіряти вікно через північ. */
const tuesday = (hours: number, minutes = 0) => new Date(2026, 8, 22, hours, minutes);
const sunday = (hours: number) => new Date(2026, 8, 27, hours, 0);

/** Тиждень, у якому дозволено лише один день. */
const onlyOn = (index: number, from: string, to: string): WeekSchedule =>
	Array.from({ length: 7 }, (_, day) =>
		day === index ? { on: true, from, to } : { on: false, from, to }
	);

describe('тижневий розклад тригера', () => {
	it('без розкладу дозволено завжди', () => {
		/*
		 * Так поводилися всі тригери до появи розкладу. Мовчки змінити це
		 * означало б вимкнути чужі сирени оновленням.
		 */
		expect(withinSchedule(null, monday(3))).toBe(true);
		expect(withinSchedule(undefined, sunday(23))).toBe(true);
	});

	it('усередині вікна — так, поза ним — ні', () => {
		const schedule = onlyOn(0, '08:00', '21:00');

		expect(withinSchedule(schedule, monday(7, 59))).toBe(false);
		expect(withinSchedule(schedule, monday(8))).toBe(true);
		expect(withinSchedule(schedule, monday(20, 59))).toBe(true);
		expect(withinSchedule(schedule, monday(21))).toBe(false);
	});

	it('вимкнений день не пускає навіть у робочі години', () => {
		const schedule = onlyOn(0, '08:00', '21:00');
		expect(withinSchedule(schedule, tuesday(12))).toBe(false);
	});

	it('вікно через північ триває до ранку наступного дня', () => {
		/*
		 * Заради цього випадку перевірка й дивиться на вчорашній день. Інакше
		 * «22:00–02:00» закінчувалося б опівночі — тобто саме тоді, коли воно
		 * потрібне.
		 */
		const schedule = onlyOn(0, '22:00', '02:00');

		expect(withinSchedule(schedule, monday(21, 59))).toBe(false);
		expect(withinSchedule(schedule, monday(22))).toBe(true);
		expect(withinSchedule(schedule, monday(23, 59))).toBe(true);
		expect(withinSchedule(schedule, tuesday(1, 59))).toBe(true);
		expect(withinSchedule(schedule, tuesday(2))).toBe(false);
	});

	it('неділя рахується як сьомий день, а не як перший', () => {
		// `Date.getDay()` рахує з неділі, наш тиждень — з понеділка. Зсув на один
		// день зробив би розклад «понеділок» діючим по неділях.
		const schedule = onlyOn(6, '08:00', '21:00');
		expect(withinSchedule(schedule, sunday(12))).toBe(true);
		expect(withinSchedule(schedule, monday(12))).toBe(false);
	});

	it('зіпсований час не пускає, а не пускає завжди', () => {
		// Файл правлять блокнотом. «Оминути перевірку» тут гірше за «не спрацює».
		const broken: WeekSchedule = Array.from({ length: 7 }, () => ({
			on: true,
			from: '25:00',
			to: 'пізно'
		}));
		expect(withinSchedule(broken, monday(12))).toBe(false);
	});

	it('типовий розклад пускає вдень і не пускає вночі', () => {
		expect(withinSchedule(defaultSchedule(), monday(12))).toBe(true);
		expect(withinSchedule(defaultSchedule(), monday(3))).toBe(false);
	});
});
