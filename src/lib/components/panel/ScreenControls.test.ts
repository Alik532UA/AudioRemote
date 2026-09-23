// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import ScreenControls from './ScreenControls.svelte';
import { starterPanel } from '$lib/panel/starter';
import type { Panel } from '$lib/net/panelTypes';

function renderControls(props: Partial<ComponentProps<typeof ScreenControls>> = {}) {
	const host = document.createElement('div');
	document.body.append(host);
	const app = mount(ScreenControls, {
		target: host,
		props: {
			editing: false,
			empty: false,
			onedit: () => {},
			...props
		}
	});
	flushSync();
	return { host, app };
}

describe('ScreenControls — налаштування екрана табла', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('ховає палітру кольору для стандартних кнопок, коли дошка порожня', () => {
		const emptyPanel: Panel = { rev: 1, cells: {} };
		const { host, app } = renderControls({ empty: true, panel: emptyPanel });

		expect(host.querySelector('[data-testid="info-attention-swatch-none-btn"]')).toBeNull();
		unmount(app);
	});

	it('ховає палітру кольору для стандартних кнопок, коли всі віджети мають власні кольори', () => {
		const { host, app } = renderControls({ panel: starterPanel() });

		// У стартовій панелі всі три комірки мають кольори: coral, violet, ruby
		expect(host.querySelector('[data-testid="info-attention-swatch-none-btn"]')).toBeNull();
		unmount(app);
	});

	it('показує палітру, коли хоча б один віджет не має кольору', () => {
		const panelWithUncolored: Panel = {
			rev: 1,
			cells: {
				'0': {
					kind: 'slider',
					caption: 'Гучність',
					step: 10
				}
			}
		};
		const { host, app } = renderControls({ panel: panelWithUncolored });

		const noneBtn = host.querySelector('[data-testid="info-attention-swatch-none-btn"]');
		expect(noneBtn).not.toBeNull();
		// Дефолтний кружок спалаху має інверсійний клас
		expect(noneBtn?.classList.contains('palette__cell--invert')).toBe(true);
		expect(host.textContent).toContain('Колір для стандартних кнопок');
		unmount(app);
	});

	it('показує палітру, коли у віджеті кнопок без власного кольору хоча б одна кнопка не має кольору', () => {
		const panel: Panel = {
			rev: 1,
			cells: {
				'0': {
					kind: 'buttons',
					caption: 'Дії',
					buttons: [
						{ label: 'Старт', color: 'ruby' },
						{ label: 'Пауза' } // без кольору
					]
				}
			}
		};
		const { host, app } = renderControls({ panel });

		expect(host.querySelector('[data-testid="info-attention-swatch-none-btn"]')).not.toBeNull();
		unmount(app);
	});

	it('ховає палітру, коли у віджеті кнопок кожна кнопка має власний колір', () => {
		const panel: Panel = {
			rev: 1,
			cells: {
				'0': {
					kind: 'buttons',
					caption: 'Дії',
					buttons: [
						{ label: 'Старт', color: 'ruby' },
						{ label: 'Пауза', color: 'emerald' }
					]
				}
			}
		};
		const { host, app } = renderControls({ panel });

		expect(host.querySelector('[data-testid="info-attention-swatch-none-btn"]')).toBeNull();
		unmount(app);
	});
});
