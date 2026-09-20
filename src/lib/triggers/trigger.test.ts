import { describe, expect, it } from 'vitest';
import { matches, readPath, triggerReady, emptyTrigger } from './trigger';

describe('читання значення з відповіді', () => {
	const data = {
		alerts: [
			{ region: 'Одеська', active: true },
			{ region: 'Київська', active: false }
		],
		meta: { count: 2 },
		plain: 'так'
	};

	it('шлях через крапку', () => {
		expect(readPath(data, 'meta.count')).toBe(2);
		expect(readPath(data, 'plain')).toBe('так');
	});

	it('числовий крок працює і для масиву', () => {
		expect(readPath(data, 'alerts.0.region')).toBe('Одеська');
		expect(readPath(data, 'alerts.1.active')).toBe(false);
	});

	it('порожній шлях — уся відповідь', () => {
		// Є API, які віддають просто `true`. Вимагати для них шлях було б безглуздо.
		expect(readPath(true, '')).toBe(true);
		expect(readPath(data, '')).toBe(data);
	});

	it('відсутній шлях не падає, а дає `undefined`', () => {
		expect(readPath(data, 'alerts.9.active')).toBeUndefined();
		expect(readPath(data, 'meta.count.deeper')).toBeUndefined();
		expect(readPath(null, 'будь.що')).toBeUndefined();
	});
});

describe('умова', () => {
	it('truthy: порожнє — це «ні»', () => {
		/*
		 * Інакше тригер спрацьовував би на відповіді, у якій нічого не сталося:
		 * порожній масив «жодних тривог» — найчастіша форма такої відповіді.
		 */
		for (const empty of [false, 0, '', null, undefined, []]) {
			expect(matches(empty, 'truthy', '')).toBe(false);
		}
		for (const set of [true, 1, 'так', [0], { a: 1 }]) {
			expect(matches(set, 'truthy', '')).toBe(true);
		}
	});

	it('equals порівнює рядками', () => {
		/*
		 * НАЙВАЖЛИВІШЕ ТУТ. У полі налаштувань людина набирає текст, і `true`
		 * звідти ніколи не буде булевим. Строге порівняння не спрацювало б жодного
		 * разу, а причину не було б видно ніде.
		 */
		expect(matches(true, 'equals', 'true')).toBe(true);
		expect(matches(2, 'equals', '2')).toBe(true);
		expect(matches('Одеська', 'equals', ' Одеська ')).toBe(true);
		expect(matches('Київська', 'equals', 'Одеська')).toBe(false);
	});

	it('contains шукає підрядок у всій гілці й не зважає на регістр', () => {
		const branch = [{ region: 'Одеська', active: true }];
		expect(matches(branch, 'contains', 'одеська')).toBe(true);
		expect(matches(branch, 'contains', 'Львівська')).toBe(false);
	});
});

describe('чи опитувати', () => {
	it('вимкнений тригер не опитується навіть з адресою', () => {
		expect(triggerReady({ ...emptyTrigger(), url: 'https://example.org' })).toBe(false);
	});

	it('увімкнений без адреси теж ні', () => {
		expect(triggerReady({ ...emptyTrigger(), on: true })).toBe(false);
	});

	it('увімкнений з адресою — так', () => {
		expect(triggerReady({ ...emptyTrigger(), on: true, url: ' https://example.org/a ' })).toBe(
			true
		);
	});

	it('не-адреса відкидається', () => {
		for (const url of ['example.org', 'ftp://a', 'javascript:alert(1)']) {
			expect(triggerReady({ ...emptyTrigger(), on: true, url })).toBe(false);
		}
	});
});
