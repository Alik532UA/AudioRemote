// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VerdictToast from './VerdictToast.svelte';
import type { PanelVerdict } from '$lib/net/panelTypes';

/**
 * ПЕРША КОМПОНЕНТНА ПЕРЕВІРКА В ПРОЄКТІ — і ось чому саме тут.
 *
 * Решта перевірок дивиться на чисту логіку або на самі джерела, бо майже все
 * тут таке і є. Ця смуга — виняток: її поведінка ЖИВЕ в компоненті й ніде
 * більше. «Зникає через десять секунд, але не поки на неї дивляться, а потім
 * доходить РЕШТА строку» — це три різні твердження про час, і жодне з них не
 * видно ні в джерелах (там `setTimeout`), ні на екрані (там нічого не
 * відбувається).
 *
 * ## Чому `jsdom`, а не браузер (CQ-COMPONENT-ENV)
 *
 * Перевіряються такти й події, а не розкладка: розміри, перекриття й фокус
 * тут ні до чого — їх міряє `a11y-layout.spec.ts` у справжньому браузері.
 * Усе, що потрібне звідси, jsdom дає чесно: `setTimeout` під підробленим
 * годинником і `PointerEvent`, який вона вміє від 2023 року.
 *
 * ## Чому без бібліотеки
 *
 * `mount()` зі svelte робить рівно те, що треба, а `@testing-library/svelte`
 * додав би залежність заради обгортки над `querySelector`. Ціна відомого
 * прапорця: під vitest умови розвʼязання переведені на браузерні
 * (`vite.config.ts`), інакше node бере серверне видання `mount()` і перевірка
 * падає з «not available on the server» — повідомленням про сервер там, де
 * сервера немає.
 */

const SHOWN = 10_000;
const verdict: PanelVerdict = { kind: 'done', cell: '4', caption: 'Завіса', at: Date.now() };

function open() {
	let gone = 0;
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(VerdictToast, {
		target: host,
		props: { verdict, shownMs: SHOWN, ondone: () => (gone += 1) }
	});
	flushSync();
	const strip = host.querySelector('[data-testid="info-verdict-text"]') as HTMLElement;
	return { host, app, strip, gone: () => gone };
}

afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

describe('відповідь звукорежисера зникає сама, але не поки на неї дивляться', () => {
	it('перевірка жива: смуга змонтувалася й показує підпис віджета', () => {
		const shown = open();
		expect(shown.strip, 'смуги немає в дереві — далі все дарма').toBeTruthy();
		expect(shown.strip.textContent).toContain('Завіса');
		unmount(shown.app);
	});

	it('без дотику зникає рівно через свій строк', () => {
		vi.useFakeTimers();
		const shown = open();

		vi.advanceTimersByTime(SHOWN - 1);
		expect(shown.gone(), 'зникла раніше за строк').toBe(0);

		vi.advanceTimersByTime(1);
		expect(shown.gone()).toBe(1);
		unmount(shown.app);
	});

	it('курсор зупиняє відлік і не дає зникнути (WCAG 2.2.1)', () => {
		vi.useFakeTimers();
		const shown = open();

		vi.advanceTimersByTime(4000);
		shown.strip.dispatchEvent(new PointerEvent('pointerenter'));
		flushSync();

		// Утричі довше за весь строк — і нічого.
		vi.advanceTimersByTime(SHOWN * 3);
		expect(shown.gone(), 'зникла, поки на ній курсор').toBe(0);
		unmount(shown.app);
	});

	it('після відведення доходить РЕШТА строку, а не повний', () => {
		vi.useFakeTimers();
		const shown = open();

		vi.advanceTimersByTime(9000);
		shown.strip.dispatchEvent(new PointerEvent('pointerenter'));
		flushSync();
		vi.advanceTimersByTime(60_000);
		shown.strip.dispatchEvent(new PointerEvent('pointerleave'));
		flushSync();

		vi.advanceTimersByTime(900);
		expect(shown.gone(), 'зникла раніше за решту строку').toBe(0);
		vi.advanceTimersByTime(100);
		expect(shown.gone(), 'решта строку не доїхала').toBe(1);
		unmount(shown.app);
	});

	it('фокус зупиняє так само, як курсор', () => {
		vi.useFakeTimers();
		const shown = open();

		shown.strip.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		flushSync();
		vi.advanceTimersByTime(SHOWN * 2);
		expect(shown.gone(), 'зникла під фокусом').toBe(0);

		shown.strip.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		flushSync();
		vi.advanceTimersByTime(SHOWN);
		expect(shown.gone()).toBe(1);
		unmount(shown.app);
	});

	it('розмонтування знімає такт: сторінка, яку закрили, нічого не кличе', () => {
		vi.useFakeTimers();
		const shown = open();

		unmount(shown.app);
		flushSync();
		vi.advanceTimersByTime(SHOWN * 2);
		expect(shown.gone(), 'такт пережив сторінку').toBe(0);
	});
});
