import { describe, expect, it } from 'vitest';
import { matches, readPath, shouldFire, triggerReady, emptyTrigger } from './trigger';

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

	it('falsy — дзеркало, і саме воно означає «відбій»', () => {
		/*
		 * Подія «стало порожньо»: тривога скінчилася, список активних спорожнів,
		 * прапорець став `false`. Через «дорівнює false» це виражалося б лише там,
		 * де джерело віддає прапорець, а не список.
		 */
		for (const empty of [false, 0, '', null, undefined, []]) {
			expect(matches(empty, 'falsy', '')).toBe(true);
		}
		for (const set of [true, 1, 'так', [0], { a: 1 }]) {
			expect(matches(set, 'falsy', '')).toBe(false);
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

describe('заперечення умов', () => {
	/*
	 * Джерело, яке віддає САМІ ЛИШЕ активні тривоги, каже «тривога» наявністю
	 * назви, а «відбій» — її відсутністю. Без заперечень друга подія не
	 * описувалася б узагалі.
	 */
	const active = [{ name: 'Одеський район', oblast: 'Одеська область', level: 'yellow' }];
	const calm: unknown[] = [];

	it('«містить» ловить тривогу, «не містить» — відбій', () => {
		expect(matches(active, 'contains', 'Одеська область')).toBe(true);
		expect(matches(active, 'notContains', 'Одеська область')).toBe(false);

		expect(matches(calm, 'contains', 'Одеська область')).toBe(false);
		expect(matches(calm, 'notContains', 'Одеська область')).toBe(true);
	});

	it('чужа область не рахується за свою', () => {
		const other = [{ oblast: 'Львівська область' }];
		expect(matches(other, 'contains', 'Одеська область')).toBe(false);
		expect(matches(other, 'notContains', 'Одеська область')).toBe(true);
	});

	it('«не дорівнює» — дзеркало «дорівнює»', () => {
		expect(matches(false, 'notEquals', 'true')).toBe(true);
		expect(matches(true, 'notEquals', 'true')).toBe(false);
	});
});

describe('чи запускати трек', () => {
	/*
	 * САМЕ ТУТ БУЛА ПОМИЛКА, і кожен її випадок тепер займає рядок.
	 *
	 * Попередній результат зберігався, але з поточним не порівнювався: умову
	 * «виконується» видавали за подію «щойно почала виконуватися». Сирена
	 * починалася спочатку на кожному опитуванні — щопівхвилини всю тривогу.
	 */
	it('лише на зміну: спрацьовує РІВНО на переході «ні → так»', () => {
		expect(shouldFire(false, true, true)).toBe(true);
	});

	it('лише на зміну: доки умова тримається — тиша', () => {
		expect(shouldFire(true, true, true)).toBe(false);
	});

	it('лише на зміну: зникнення умови теж не подія', () => {
		// «Відбій» описується протилежною умовою на іншому треку, а не цим.
		expect(shouldFire(true, false, true)).toBe(false);
		expect(shouldFire(false, false, true)).toBe(false);
	});

	it('щоразу: спрацьовує на кожному «так»', () => {
		expect(shouldFire(true, true, false)).toBe(true);
		expect(shouldFire(false, true, false)).toBe(true);
		expect(shouldFire(true, false, false)).toBe(false);
	});

	it('перше опитування не рахується за подію в ЖОДНОМУ режимі', () => {
		/*
		 * Тривога, яка почалася до відкриття застосунку, почалася без нас.
		 * Зустрічати її сиреною посеред заняття — лякати зал на порожньому місці.
		 */
		expect(shouldFire(null, true, true)).toBe(false);
		expect(shouldFire(null, true, false)).toBe(false);
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
