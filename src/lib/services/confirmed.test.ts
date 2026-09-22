// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CopyButton from '$lib/components/ui/CopyButton.svelte';
import { CONFIRMED_MS } from './confirmed.svelte';

/**
 * КВИТАНЦІЯ «ЗРОБЛЕНО» — ПЕРЕВІРЯЄТЬСЯ ЧЕРЕЗ КНОПКУ, А НЕ НАПРЯМУ.
 *
 * `confirmed()` реєструє `onDestroy` у власному тілі, тобто живе рівно доти,
 * доки живе компонент, який його створив. Покликати його поза компонентом не
 * можна за побудовою — і саме це тут і перевіряється останнім описом.
 *
 * Тому фабрику міряє її вжиток: `CopyButton` — найменший із шести компонентів,
 * що нею користуються, і містить рівно те, про що йдеться (напис міняється,
 * гасне сам, не гасне раніше часу).
 *
 * Окремий компонент-фікстура був би чеснішим за формою й гіршим по суті:
 * `.svelte` у `src/`, який не імпортує ніхто, — це сирота, і гейт досяжності
 * (`structure.test.ts`) мав би отримати для нього виняток.
 */

const label = () => document.querySelector('[data-testid="proba-copy-btn"]')?.getAttribute('title');

function open() {
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(CopyButton, {
		target: host,
		props: { value: 'КАВА-МЛИН', label: 'пароль', testid: 'proba-copy-btn' }
	});
	flushSync();
	return { app, button: host.querySelector('button') as HTMLButtonElement };
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

/** Буфера обміну в jsdom немає; сама кнопка чекає саме на проміс. */
const clipboard = () => vi.stubGlobal('navigator', { clipboard: { writeText: async () => {} } });

describe('квитанція «зроблено» (CopyButton)', () => {
	it('перевірка жива: кнопка змонтувалася й пропонує скопіювати', () => {
		const shown = open();
		expect(shown.button, 'кнопки немає — далі все дарма').toBeTruthy();
		expect(label()).toContain('пароль');
		unmount(shown.app);
	});

	it('після копіювання каже «скопійовано» й гасне сама', async () => {
		clipboard();
		vi.useFakeTimers();
		const shown = open();

		shown.button.click();
		await vi.advanceTimersByTimeAsync(0);
		flushSync();
		expect(label(), 'кнопка не сказала, що скопіювала').not.toContain('пароль');

		await vi.advanceTimersByTimeAsync(CONFIRMED_MS);
		flushSync();
		expect(label(), 'квитанція не зникла').toContain('пароль');
		unmount(shown.app);
	});

	it('друге натискання дає ПОВНІ дві секунди, а не залишок першого', async () => {
		clipboard();
		vi.useFakeTimers();
		const shown = open();

		shown.button.click();
		await vi.advanceTimersByTimeAsync(CONFIRMED_MS - 100);
		shown.button.click();
		await vi.advanceTimersByTimeAsync(0);
		flushSync();

		// Тут гаснув би такт ПЕРШОГО натискання, якби його не знімали.
		await vi.advanceTimersByTimeAsync(CONFIRMED_MS - 200);
		flushSync();
		expect(label(), 'перший такт погасив квитанцію другого').not.toContain('пароль');

		await vi.advanceTimersByTimeAsync(200);
		flushSync();
		expect(label()).toContain('пароль');
		unmount(shown.app);
	});

	it('закрите вікно не лишає по собі такту', async () => {
		clipboard();
		vi.useFakeTimers();
		const shown = open();

		shown.button.click();
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount(), 'квитанція не завела такту — міряти нема чого').toBe(1);

		unmount(shown.app);
		flushSync();

		// Рахувати треба ОДРАЗУ: після перемотки такт спрацював би й зник, і
		// нуль означав би «його вже немає», а не «його зняли».
		expect(vi.getTimerCount(), 'такт пережив компонент і напише в мертвий стан').toBe(0);
	});
});
