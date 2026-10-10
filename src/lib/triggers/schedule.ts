/**
 * БЛОКИ РОЗКЛАДУ ТА ТОЧКИ ЧАСУ ДЛЯ АВТОНОМНОГО ЗАПУСКУ ТРЕКІВ.
 *
 * ## Що це
 *
 * Трек запускається за системним годинником: у визначені дні тижня в задані
 * хвилини (наприклад, шкільний дзвінок або сигнал перерви).
 *
 * Кожен блок об'єднує набір днів тижня (0 = Пн, ..., 6 = Нд) і список часових
 * точок "ГГ:ХХ". Кілька блоків дозволяють мати різний розклад для буднів і
 * вихідних або для різних змін.
 */

export interface ScheduleBlock {
	id: string;
	/** 0 = Понеділок, ..., 6 = Неділя */
	days: number[];
	/** Відсортовані точки "ГГ:ХХ" без дублікатів */
	times: string[];
}

export const emptyBlock = (): ScheduleBlock => ({
	id: Math.random().toString(36).slice(2, 9),
	days: [0, 1, 2, 3, 4],
	times: []
});

export type SchoolPresetType = 'start' | 'end' | 'both';

interface LessonPeriod {
	start: string;
	end: string;
}

const SCHOOL_PERIODS: {
	days: number[];
	lessons: LessonPeriod[];
}[] = [
	{
		days: [0, 2, 4], // Понеділок — Середа — П'ятниця
		lessons: [
			{ start: '09:00', end: '09:40' },
			{ start: '09:45', end: '10:25' },
			{ start: '10:30', end: '11:10' }
		]
	},
	{
		days: [0, 1, 2, 3, 4], // Понеділок — Вівторок — Середа — Четвер — П'ятниця
		lessons: [
			{ start: '13:40', end: '14:25' },
			{ start: '14:30', end: '15:15' },
			{ start: '15:20', end: '16:05' },
			{ start: '16:10', end: '16:55' },
			{ start: '17:00', end: '17:45' },
			{ start: '17:50', end: '18:35' },
			{ start: '18:40', end: '19:25' },
			{ start: '19:30', end: '20:15' }
		]
	},
	{
		days: [5], // Субота
		lessons: [
			{ start: '09:30', end: '10:15' },
			{ start: '10:20', end: '11:05' },
			{ start: '11:10', end: '11:55' },
			{ start: '12:00', end: '12:45' },
			{ start: '12:50', end: '13:35' },
			{ start: '13:40', end: '14:25' },
			{ start: '14:30', end: '15:15' },
			{ start: '15:20', end: '16:05' },
			{ start: '16:10', end: '16:55' }
		]
	}
];

/**
 * Генерує блоки шкільного розкладу дзвінків:
 * - 'start': тільки початок уроків
 * - 'end': тільки кінець уроків
 * - 'both': і початок, і кінець уроків
 */
export function createSchoolPreset(type: SchoolPresetType): ScheduleBlock[] {
	return SCHOOL_PERIODS.map((period) => {
		const unique = new Set<string>();
		for (const lesson of period.lessons) {
			if (type === 'start' || type === 'both') unique.add(lesson.start);
			if (type === 'end' || type === 'both') unique.add(lesson.end);
		}
		return {
			id: Math.random().toString(36).slice(2, 9),
			days: [...period.days],
			times: [...unique].sort((a, b) => a.localeCompare(b))
		};
	});
}

/** Нормалізація рядка часу "9:5" -> "09:05". Сміття дає null. */
export function normalizeTime(text: string): string | null {
	const match = /^(\d{1,2}):(\d{1,2})$/.exec(text.trim());
	if (!match) return null;

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return null;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Розбір списку часу з тексту (копіпаст через кому, пробіл або перенос рядка).
 * Повертає відсортований масив унікальних валідних значень "ГГ:ХХ".
 */
export function parseTimes(text: string): string[] {
	const parts = text.split(/[,;\s\n\r]+/);
	const unique = new Set<string>();

	for (const part of parts) {
		const normalized = normalizeTime(part);
		if (normalized) unique.add(normalized);
	}

	return [...unique].sort((left, right) => left.localeCompare(right));
}

/** Чи відповідає поточний момент хоча б одній точці в активних блоках. */
export function isDue(blocks: readonly ScheduleBlock[], now: Date = new Date()): boolean {
	const today = (now.getDay() + 6) % 7;
	const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

	return blocks.some((block) => block.days.includes(today) && block.times.includes(current));
}

export interface NextDue {
	day: number;
	time: string;
	at: Date;
}

/**
 * Знайти найближчу наступну точку розкладу протягом наступних 7 днів.
 */
export function nextDue(blocks: readonly ScheduleBlock[], now: Date = new Date()): NextDue | null {
	const active = blocks.filter((b) => b.days.length > 0 && b.times.length > 0);
	if (active.length === 0) return null;

	const today = (now.getDay() + 6) % 7;
	const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

	for (let offset = 0; offset < 7; offset += 1) {
		const day = (today + offset) % 7;
		const matchingBlocks = active.filter((b) => b.days.includes(day));
		if (matchingBlocks.length === 0) continue;

		const candidateTimes = matchingBlocks.flatMap((b) => b.times);
		const sorted = [...new Set(candidateTimes)].sort((left, right) => left.localeCompare(right));

		const validTimes = offset === 0 ? sorted.filter((t) => t > current) : sorted;
		if (validTimes.length > 0) {
			const earliest = validTimes[0];
			const [hours, minutes] = earliest.split(':').map(Number);
			const at = new Date(now);
			at.setDate(now.getDate() + offset);
			at.setHours(hours, minutes, 0, 0);
			return { day, time: earliest, at };
		}
	}

	return null;
}

/** Чи вкладається запізнення запуску в допустиме вікно (типово 2 хвилини). */
export function isWithinGrace(scheduledMs: number, nowMs: number, maxGraceMs = 120_000): boolean {
	return nowMs >= scheduledMs && nowMs - scheduledMs <= maxGraceMs;
}

export const WEEKDAY_KEYS = [
	'week.mon',
	'week.tue',
	'week.wed',
	'week.thu',
	'week.fri',
	'week.sat',
	'week.sun'
] as const;

export type NextDueKind = 'never' | 'today' | 'tomorrow' | 'day';

export interface NextDueDescription {
	kind: NextDueKind;
	time: string;
	dayKey: (typeof WEEKDAY_KEYS)[number];
}

export function describeNextDue(
	blocks: readonly ScheduleBlock[],
	now = new Date()
): NextDueDescription {
	const next = nextDue(blocks, now);
	if (!next) return { kind: 'never', time: '', dayKey: WEEKDAY_KEYS[0] };
	const today = (now.getDay() + 6) % 7;
	if (next.day === today && next.at.toDateString() === now.toDateString()) {
		return { kind: 'today', time: next.time, dayKey: WEEKDAY_KEYS[next.day] };
	}
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	if (next.at.toDateString() === tomorrow.toDateString()) {
		return { kind: 'tomorrow', time: next.time, dayKey: WEEKDAY_KEYS[next.day] };
	}
	return { kind: 'day', time: next.time, dayKey: WEEKDAY_KEYS[next.day] };
}
