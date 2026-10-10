import { describe, expect, it } from 'vitest';
import { defaultSchedule, withinSchedule, type WeekSchedule } from './trigger';
import {
	createSchoolPreset,
	describeNextDue,
	emptyBlock,
	isDue,
	isWithinGrace,
	nextDue,
	normalizeTime,
	parseTimes,
	type ScheduleBlock
} from './schedule';

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

describe('блоки розкладу та точки часу', () => {
	it('normalizeTime приводить час до 24-годинного формату', () => {
		expect(normalizeTime('8:30')).toBe('08:30');
		expect(normalizeTime('08:30')).toBe('08:30');
		expect(normalizeTime(' 9:5 ')).toBe('09:05');
		expect(normalizeTime('23:59')).toBe('23:59');
		expect(normalizeTime('24:00')).toBeNull();
		expect(normalizeTime('12:60')).toBeNull();
		expect(normalizeTime('текст')).toBeNull();
	});

	it('parseTimes парсить список, прибирає дублікати й сортує', () => {
		const parsed = parseTimes('12:00, 09:00; 12:00\n10:30  8:15 bad');
		expect(parsed).toEqual(['08:15', '09:00', '10:30', '12:00']);
	});

	it('emptyBlock повертає робочий зразок блоку', () => {
		const block = emptyBlock();
		expect(block.days).toEqual([0, 1, 2, 3, 4]);
		expect(block.times).toEqual([]);
		expect(block.id.length).toBeGreaterThan(0);
	});

	it('isDue перевіряє день та хвилину', () => {
		const blocks: ScheduleBlock[] = [
			{ id: 'b1', days: [0, 2], times: ['09:00', '12:30'] },
			{ id: 'b2', days: [1], times: ['10:00'] }
		];

		// Понеділок (0) о 09:00 -> так
		expect(isDue(blocks, monday(9, 0))).toBe(true);
		// Понеділок (0) о 09:01 -> ні
		expect(isDue(blocks, monday(9, 1))).toBe(false);
		// Вівторок (1) о 09:00 -> ні (у вівторок лише 10:00)
		expect(isDue(blocks, tuesday(9, 0))).toBe(false);
		// Вівторок (1) о 10:00 -> так
		expect(isDue(blocks, tuesday(10, 0))).toBe(true);
		// Неділя (6) -> ні
		expect(isDue(blocks, sunday(12))).toBe(false);
	});

	it('nextDue знаходить найближчий наступний час', () => {
		const blocks: ScheduleBlock[] = [
			{ id: 'b1', days: [0, 1], times: ['09:00', '12:00'] },
			{ id: 'b2', days: [6], times: ['15:00'] }
		];

		// У понеділок о 08:30 наступний сьогодні о 09:00
		const next1 = nextDue(blocks, monday(8, 30));
		expect(next1).toEqual({
			day: 0,
			time: '09:00',
			at: monday(9, 0)
		});

		// У понеділок о 09:00 наступний сьогодні о 12:00
		const next2 = nextDue(blocks, monday(9, 0));
		expect(next2).toEqual({
			day: 0,
			time: '12:00',
			at: monday(12, 0)
		});

		// У понеділок о 13:00 наступний завтра (вівторок) о 09:00
		const next3 = nextDue(blocks, monday(13, 0));
		expect(next3).toEqual({
			day: 1,
			time: '09:00',
			at: tuesday(9, 0)
		});
	});

	it('nextDue повертає null для порожніх блоків', () => {
		expect(nextDue([])).toBeNull();
		expect(nextDue([{ id: 'b', days: [0], times: [] }])).toBeNull();
		expect(nextDue([{ id: 'b', days: [], times: ['10:00'] }])).toBeNull();
	});

	it('isWithinGrace відсікає запізнення понад 2 хвилини', () => {
		const scheduled = 1_000_000;
		// Рівно вчасно
		expect(isWithinGrace(scheduled, 1_000_000)).toBe(true);
		// 60 секунд запізнення
		expect(isWithinGrace(scheduled, 1_060_000)).toBe(true);
		// 120 секунд запізнення (2 хв)
		expect(isWithinGrace(scheduled, 1_120_000)).toBe(true);
		// 121 секунда запізнення (> 2 хв)
		expect(isWithinGrace(scheduled, 1_121_000)).toBe(false);
		// Час з минулого відносно scheduled
		expect(isWithinGrace(scheduled, 999_000)).toBe(false);
	});

	it('describeNextDue описує наступний запуск для людини', () => {
		const blocks: ScheduleBlock[] = [
			{ id: 'b1', days: [0], times: ['09:00', '12:00'] },
			{ id: 'b2', days: [1], times: ['09:00'] },
			{ id: 'b3', days: [4], times: ['15:00'] }
		];

		expect(describeNextDue([])).toEqual({ kind: 'never', time: '', dayKey: 'week.mon' });

		const today = describeNextDue(blocks, monday(9, 30));
		expect(today).toEqual({ kind: 'today', time: '12:00', dayKey: 'week.mon' });

		const tomorrow = describeNextDue(blocks, monday(13, 0));
		expect(tomorrow).toEqual({ kind: 'tomorrow', time: '09:00', dayKey: 'week.tue' });

		const friday = describeNextDue(blocks, tuesday(10, 0));
		expect(friday).toEqual({ kind: 'day', time: '15:00', dayKey: 'week.fri' });
	});

	describe('createSchoolPreset', () => {
		it('генерує три блоки для пресету "тільки початок уроків"', () => {
			const preset = createSchoolPreset('start');
			expect(preset).toHaveLength(3);

			// Пн, Ср, Пт
			expect(preset[0].days).toEqual([0, 2, 4]);
			expect(preset[0].times).toEqual(['09:00', '09:45', '10:30']);

			// Пн, Вт, Ср, Чт, Пт
			expect(preset[1].days).toEqual([0, 1, 2, 3, 4]);
			expect(preset[1].times).toEqual([
				'13:40',
				'14:30',
				'15:20',
				'16:10',
				'17:00',
				'17:50',
				'18:40',
				'19:30'
			]);

			// Субота
			expect(preset[2].days).toEqual([5]);
			expect(preset[2].times).toEqual([
				'09:30',
				'10:20',
				'11:10',
				'12:00',
				'12:50',
				'13:40',
				'14:30',
				'15:20',
				'16:10'
			]);
		});

		it('генерує три блоки для пресету "тільки кінець уроків"', () => {
			const preset = createSchoolPreset('end');
			expect(preset).toHaveLength(3);

			// Пн, Ср, Пт
			expect(preset[0].days).toEqual([0, 2, 4]);
			expect(preset[0].times).toEqual(['09:40', '10:25', '11:10']);

			// Пн, Вт, Ср, Чт, Пт
			expect(preset[1].days).toEqual([0, 1, 2, 3, 4]);
			expect(preset[1].times).toEqual([
				'14:25',
				'15:15',
				'16:05',
				'16:55',
				'17:45',
				'18:35',
				'19:25',
				'20:15'
			]);

			// Субота
			expect(preset[2].days).toEqual([5]);
			expect(preset[2].times).toEqual([
				'10:15',
				'11:05',
				'11:55',
				'12:45',
				'13:35',
				'14:25',
				'15:15',
				'16:05',
				'16:55'
			]);
		});

		it('генерує три блоки для пресету "і початок і кінець уроків"', () => {
			const preset = createSchoolPreset('both');
			expect(preset).toHaveLength(3);

			// Пн, Ср, Пт
			expect(preset[0].days).toEqual([0, 2, 4]);
			expect(preset[0].times).toEqual(['09:00', '09:40', '09:45', '10:25', '10:30', '11:10']);

			// Пн, Вт, Ср, Чт, Пт
			expect(preset[1].days).toEqual([0, 1, 2, 3, 4]);
			expect(preset[1].times).toEqual([
				'13:40',
				'14:25',
				'14:30',
				'15:15',
				'15:20',
				'16:05',
				'16:10',
				'16:55',
				'17:00',
				'17:45',
				'17:50',
				'18:35',
				'18:40',
				'19:25',
				'19:30',
				'20:15'
			]);

			// Субота
			expect(preset[2].days).toEqual([5]);
			expect(preset[2].times).toEqual([
				'09:30',
				'10:15',
				'10:20',
				'11:05',
				'11:10',
				'11:55',
				'12:00',
				'12:45',
				'12:50',
				'13:35',
				'13:40',
				'14:25',
				'14:30',
				'15:15',
				'15:20',
				'16:05',
				'16:10',
				'16:55'
			]);
		});
	});
});
