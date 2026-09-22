// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { wipeOwnState } from './resetService';
import { PREFIX } from './storage';
import { memoryStorage } from '../../gates/storage';

/**
 * АВАРІЙНЕ СКИДАННЯ МУСИТЬ ПРИБИРАТИ ОБИДВА СХОВИЩА
 * (DEBUGGING-v9 § 3, `DBG-HARD-RESET`, CRITICAL).
 *
 * ## Чого не прибиралося
 *
 * `sessionStorage`. У ньому лежить рівно один запис — `audioremote_active`, —
 * і це ВІДКРИТА ЗАРАЗ дошка разом з обома паролями. Скидання не закриває
 * вкладку, воно перезавантажує ту саму; сховище вкладки перезавантаження
 * переживає. Тобто єдиний вихід зі зламаного стану повертав рівно в той стан,
 * з якого його натиснули, і на екрані нічого не мінялося.
 *
 * Це найгірший з можливих проявів: людина, у якої не відкривається дошка,
 * тисне кнопку «скинути все», бачить ту саму помилку й робить висновок, що
 * кнопка не працює. Далі — «очистити дані сайту» в браузері, тобто рівно те,
 * від чого скидання й рятує (там спільний origin, і воно витирає сусідні
 * проєкти автора).
 *
 * ## Чому «не чіпає чуже» перевіряється поіменно
 *
 * Прибирання за префіксом і прибирання через `clear()` на СВОЇХ ключах
 * виглядають однаково: обидва лишають сховище без наших записів. Різниця видно
 * тільки на чужому ключі, тож він тут є в обох сховищах. Що `clear()` не
 * вживається в джерелах узагалі, стереже `own-scope.test.ts` — це друга
 * половина тієї самої межі.
 */

const foreign = { local: 'slovko_settings', session: 'mindstep_active' };

/*
 * Сховища підставлені: під jsdom робочих немає (чому саме — у
 * `gates/storage.ts`). Обидва наповнюються СВОЇМ і ЧУЖИМ — без чужого ключа
 * прибирання за префіксом не відрізнити від `clear()`.
 */
beforeEach(() => {
	vi.stubGlobal('localStorage', memoryStorage());
	vi.stubGlobal('sessionStorage', memoryStorage());

	window.localStorage.setItem(`${PREFIX}theme`, 'dark');
	window.localStorage.setItem(`${PREFIX}boards`, '[]');
	window.localStorage.setItem(foreign.local, 'чуже');

	window.sessionStorage.setItem(`${PREFIX}active`, '{"key":"abc"}');
	window.sessionStorage.setItem(foreign.session, 'чуже');
});

afterEach(() => vi.unstubAllGlobals());

describe('аварійне скидання', () => {
	it('прибирає своє з ОБОХ сховищ', async () => {
		const report = await wipeOwnState();

		expect(window.localStorage.getItem(`${PREFIX}theme`), 'лишилося налаштування').toBeNull();
		expect(window.localStorage.getItem(`${PREFIX}boards`), 'лишилися дошки').toBeNull();
		expect(
			window.sessionStorage.getItem(`${PREFIX}active`),
			'відкрита дошка пережила скидання — екран лишиться той самий'
		).toBeNull();

		expect(report.keys, 'порахувало не ті ключі').toBe(2);
		expect(report.session, 'сховище вкладки не пораховано').toBe(1);
	});

	it('ключ відкритої дошки справді має префікс, за яким його й прибирають', () => {
		/*
		 * Прибирання йде ЗА ПРЕФІКСОМ, тож воно порожнє рівно доти, доки ключі
		 * його носять. `session.svelte.ts` пише свій літералом — цього вимагає
		 * `docs-facts`, який звіряє його з PROJECT-CONTEXT.md, — тобто розійтися
		 * зі сховищем він може мовчки й без жодного червоного гейта.
		 */
		const source = readFileSync('src/lib/board/session.svelte.ts', 'utf8');
		const key = /const SESSION_KEY = '([^']+)'/.exec(source)?.[1];

		expect(key, 'ключ сеансу не знайдено — перевірка дивиться не туди').toBeDefined();
		expect(key?.startsWith(PREFIX), `${key} не починається з ${PREFIX}`).toBe(true);
	});

	it('не чіпає сусідні проєкти на тому самому origin', async () => {
		await wipeOwnState();

		expect(window.localStorage.getItem(foreign.local), 'витерто чужі налаштування').toBe('чуже');
		expect(window.sessionStorage.getItem(foreign.session), 'витерто чужий сеанс').toBe('чуже');
	});

	it('перевірка жива: без прибирання сховища лишаються повними', () => {
		// Інакше «прибрано» вище зеленіло б і над сховищем, яке було порожнє від
		// початку, тобто над перевіркою, що нічого не доводить.
		expect(window.localStorage.getItem(`${PREFIX}theme`)).toBe('dark');
		expect(window.sessionStorage.getItem(`${PREFIX}active`)).toBe('{"key":"abc"}');
	});

	it('крок, що впав, не спиняє решти', async () => {
		/*
		 * Кеші й воркер тут недоступні (jsdom їх не має), і це якраз потрібний
		 * випадок: сховища мусять бути прибрані однаково. Половина прибраного —
		 * теж результат; зупинка на першій відмові лишила б людину на тому
		 * самому екрані, тепер ще й із частково стертим станом.
		 */
		vi.stubGlobal('caches', {
			keys: () => Promise.reject(new Error('немає доступу'))
		});

		const report = await wipeOwnState();

		expect(window.sessionStorage.getItem(`${PREFIX}active`)).toBeNull();
		expect(report.caches, 'відмова кешів порахувалася як успіх').toBe(0);
	});
});
