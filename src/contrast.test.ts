// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * КОНТРАСТ РАХУЄТЬСЯ ПО ВСІХ КОМБІНАЦІЯХ ТЕМА × ПОВЕРХНЯ
 * (ACCESSIBILITY-v9 § 10.7, `A11Y-CONTRAST-ALL-PAIRS`, HIGH).
 *
 * ## Чому не axe над сторінкою
 *
 * axe бачить ОДНУ живу тему — ту, у якій відкрили сторінку, — і лише ті пари,
 * які трапилися на екрані. Тут тем дві, і кожна пара існує в обох: колір,
 * що проходить у темній, у світлій може не проходити, і навпаки. Саме так і
 * було: `--text-muted` на тлі сторінки давав 4.34 у світлій темі при потрібних
 * 4.5 — тобто дефект бачила рівно половина людей, і то не помічаючи, що це
 * дефект.
 *
 * ## Що саме міряється
 *
 * Токени розв'язуються з `tokens.css` для кожної теми окремо: `light-dark()`
 * розбирається на дві гілки, `var(--x)` йде за посиланням. Пари перелічені
 * поіменно — це ті поєднання «текст на тлі», які справді трапляються в
 * розмітці; пара, якої в застосунку немає, у переліку теж не потрібна, бо
 * червоніла б без предмета.
 *
 * ## Чому 4.5, а не 3
 *
 * Усі ці кольори вживаються для ЗВИЧАЙНОГО тексту — підписів, підказок,
 * попереджень. Поблажка 3:1 стосується великого тексту (18.66px жирного або
 * 24px звичайного), а тут таких місць немає.
 */

const css = readFileSync('src/lib/css/base/tokens.css', 'utf8');

const tokens = new Map<string, string>();
for (const m of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2].trim());

type Rgb = [number, number, number];
type Theme = 'light' | 'dark';

const hexToRgb = (hex: string): Rgb => {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};

/** Значення токена в конкретній темі, або `null`, якщо це не суцільний колір. */
function resolve(value: string, theme: Theme, depth = 0): Rgb | null {
	if (depth > 5) return null;
	const text = value.trim();

	const ref = /^var\(--([\w-]+)\)$/.exec(text);
	if (ref) return resolve(tokens.get(ref[1]) ?? '', theme, depth + 1);

	const pair = /^light-dark\(([^,]+),\s*(.+)\)$/.exec(text);
	if (pair) return resolve(theme === 'light' ? pair[1] : pair[2], theme, depth + 1);

	return /^#[0-9a-f]{3,8}$/i.test(text) ? hexToRgb(text) : null;
}

const luminance = ([r, g, b]: Rgb): number => {
	const linear = [r, g, b].map((channel) => {
		const x = channel / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (fg: Rgb, bg: Rgb): number => {
	const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
	return (light + 0.05) / (dark + 0.05);
};

/** Пари «текст на тлі», які справді трапляються в розмітці. */
const PAIRS: [string, string][] = [
	['text-primary', 'bg-page'],
	['text-primary', 'bg-surface'],
	['text-primary', 'bg-surface-raised'],
	['text-primary', 'bg-sunken'],
	['text-primary', 'bg-input'],
	['text-primary', 'bg-header-btn'],
	['text-secondary', 'bg-page'],
	['text-secondary', 'bg-surface'],
	['text-secondary', 'bg-sunken'],
	['text-secondary', 'bg-header-btn'],
	['text-muted', 'bg-page'],
	['text-muted', 'bg-surface'],
	['text-muted', 'bg-sunken'],
	['text-on-accent', 'accent-button'],
	['accent', 'bg-page'],
	['accent', 'bg-surface'],
	['ok', 'bg-surface'],
	['ok', 'bg-page'],
	['warn', 'bg-surface'],
	['warn', 'bg-page'],
	['warn', 'bg-sunken'],
	['danger', 'bg-surface'],
	['danger', 'bg-page'],
	['info', 'bg-surface']
];

const AA = 4.5;
const THEMES: Theme[] = ['light', 'dark'];

describe('контраст токенів (ACCESSIBILITY-v9 § 10.7)', () => {
	it('перевірка жива: токени прочитано', () => {
		expect(tokens.size, 'у tokens.css не знайдено жодного токена').toBeGreaterThan(20);
	});

	it('перевірка жива: кожну пару розв’язано в обох темах', () => {
		/*
		 * Нерозв'язана пара — найгірший випадок: вона просто випадає з підрахунку,
		 * і гейт зеленіє, не подивившись. Тому вони рахуються окремо й називаються
		 * поіменно (§ 10.7 вимагає саме цього: «пропуски розв'язувача пораховані й
		 * названі»).
		 */
		const unresolved: string[] = [];
		for (const theme of THEMES) {
			for (const [fg, bg] of PAIRS) {
				if (!resolve(tokens.get(fg) ?? '', theme)) unresolved.push(`${theme}: --${fg}`);
				if (!resolve(tokens.get(bg) ?? '', theme)) unresolved.push(`${theme}: --${bg}`);
			}
		}
		expect([...new Set(unresolved)], 'розв’язувач не впорався').toEqual([]);
	});

	it.each(THEMES)('у темі «%s» кожна пара не нижче AA', (theme) => {
		const low = PAIRS.map(([fg, bg]) => {
			const front = resolve(tokens.get(fg) ?? '', theme);
			const back = resolve(tokens.get(bg) ?? '', theme);
			if (!front || !back) return null;
			const ratio = contrast(front, back);
			return ratio < AA ? `--${fg} на --${bg}: ${ratio.toFixed(2)} при потрібних ${AA}` : null;
		}).filter((entry): entry is string => entry !== null);

		expect(low, `нижче AA у темі «${theme}»:\n${low.join('\n')}`).toEqual([]);
	});
});
