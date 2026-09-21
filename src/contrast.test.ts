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
 * ## Тло буває З КІЛЬКОХ ШАРІВ, і доти рахувався лише верхній
 *
 * `--danger-soft` — це `--danger` з альфою 0.16, а не суцільний колір. Те, що
 * бачить око, виникає лише разом із поверхнею ПІД ним: той самий токен над
 * `--bg-surface` і над `--bg-sunken` дає два різні кольори, і пара проходить
 * AA над одним та не проходить над другим.
 *
 * Стара редакція не бачила цього ДВІЧІ. По-перше, розв'язувач розумів лише
 * `#rrggbb` — значення з альфою він повертав як `null`, тобто пара тихо
 * випадала б з підрахунку. По-друге, самих пар «фарба на фарбі» в переліку не
 * було зовсім. Через обидва пропуски кнопка `.btn--danger` у темній темі
 * стояла на 4.40 при потрібних 4.5, і знайшов це не цей гейт.
 *
 * Тому тло тут — СТЕК шарів, зверху вниз, і нижній шар мусить бути непрозорим:
 * інакше вимір не падає, а бреше.
 *
 * ## Що саме міряється
 *
 * Токени розв'язуються з `tokens.css` для кожної теми окремо: `light-dark()`
 * розбирається на дві гілки, `var(--x)` йде за посиланням, `rgb(… / a)` дає
 * колір з альфою. Пари перелічені поіменно — це ті поєднання «текст на тлі»,
 * які справді трапляються в розмітці; пара, якої в застосунку немає, у
 * переліку теж не потрібна, бо червоніла б без предмета.
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
/** Колір разом з альфою: без неї шар не можна покласти на те, що під ним. */
type Paint = { rgb: Rgb; alpha: number };
type Theme = 'light' | 'dark';

const hexToRgb = (hex: string): Rgb => {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
};

/** Значення токена в конкретній темі, або `null`, якщо це не колір. */
function resolve(value: string, theme: Theme, depth = 0): Paint | null {
	if (depth > 5) return null;
	const text = value.trim();

	const ref = /^var\(--([\w-]+)\)$/.exec(text);
	if (ref) return resolve(tokens.get(ref[1]) ?? '', theme, depth + 1);

	const pair = /^light-dark\(([^,]+),\s*(.+)\)$/.exec(text);
	if (pair) return resolve(theme === 'light' ? pair[1] : pair[2], theme, depth + 1);

	/*
	 * `rgb(R G B / A)` — саме та форма, якою в цьому проєкті записані всі
	 * напівпрозорі токени. Кома-форма сюди не пускається навмисно: її тут немає,
	 * і розбирати неіснуюче означало б припускати, що перевірка працює.
	 */
	const alpha = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(text);
	if (alpha) return { rgb: [+alpha[1], +alpha[2], +alpha[3]], alpha: +alpha[4] };

	return /^#[0-9a-f]{3,8}$/i.test(text) ? { rgb: hexToRgb(text), alpha: 1 } : null;
}

/** Покласти напівпрозору фарбу на вже обчислене непрозоре тло. */
const flatten = (top: Paint, under: Rgb): Rgb =>
	top.alpha >= 1
		? top.rgb
		: (top.rgb.map((c, i) => Math.round(top.alpha * c + (1 - top.alpha) * under[i])) as Rgb);

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

/**
 * Пари «текст на тлі», які справді трапляються в розмітці.
 *
 * Друге поле — СТЕК тла, зверху вниз. Один елемент означає суцільну поверхню;
 * два — фарбу з альфою над поверхнею. Нижній елемент мусить бути непрозорим, і
 * це стереже окремий опис.
 */
const PAIRS: [string, string[]][] = [
	['text-primary', ['bg-page']],
	['text-primary', ['bg-surface']],
	['text-primary', ['bg-surface-raised']],
	['text-primary', ['bg-sunken']],
	['text-primary', ['bg-input']],
	['text-primary', ['bg-header-btn']],
	['text-secondary', ['bg-page']],
	['text-secondary', ['bg-surface']],
	['text-secondary', ['bg-sunken']],
	['text-secondary', ['bg-header-btn']],
	['text-muted', ['bg-page']],
	['text-muted', ['bg-surface']],
	['text-muted', ['bg-sunken']],
	['text-on-accent', ['accent-button']],
	['accent', ['bg-page']],
	['accent', ['bg-surface']],
	['ok', ['bg-surface']],
	['ok', ['bg-page']],
	['warn', ['bg-surface']],
	['warn', ['bg-page']],
	['warn', ['bg-sunken']],
	['danger', ['bg-surface']],
	['danger', ['bg-page']],
	['info', ['bg-surface']],

	/*
	 * ФАРБА НА ФАРБІ.
	 *
	 * `.btn--danger` (`base.css`) — це `--danger` на `--danger-soft`, і стоїть
	 * вона і в картці (`--bg-surface`: налаштування, редактор запуску), і просто
	 * на сторінці. Поверхня під нею міняє колір тла, тож перелічені обидві, а
	 * заразом `--bg-sunken`: панель налаштувань кладе картки саме на нього.
	 *
	 * `--accent-soft` — підсвітка обраного: перемикач, вибір видимості, активний
	 * рядок у меню. Текст на ній буває і `--accent`, і `--text-primary`.
	 */
	['danger', ['danger-soft', 'bg-surface']],
	['danger', ['danger-soft', 'bg-page']],
	['danger', ['danger-soft', 'bg-sunken']],
	['accent', ['accent-soft', 'bg-surface']],
	['accent', ['accent-soft', 'bg-page']],
	['text-primary', ['accent-soft', 'bg-surface']],
	['text-primary', ['accent-soft', 'bg-page']]
];

const AA = 4.5;
const THEMES: Theme[] = ['light', 'dark'];

/** Колір стеку тла: знизу вгору, кожен шар кладеться на попередній. */
function backdrop(stack: string[], theme: Theme): Rgb | null {
	const layers = stack.map((name) => resolve(tokens.get(name) ?? '', theme));
	if (layers.some((layer) => layer === null)) return null;
	const solid = layers as Paint[];
	let colour = solid[solid.length - 1].rgb;
	for (let i = solid.length - 2; i >= 0; i--) colour = flatten(solid[i], colour);
	return colour;
}

describe('контраст токенів (ACCESSIBILITY-v9 § 10.7)', () => {
	it('перевірка жива: токени прочитано', () => {
		expect(tokens.size, 'у tokens.css не знайдено жодного токена').toBeGreaterThan(20);
	});

	it('перевірка жива: кожен шар розв’язано в обох темах', () => {
		/*
		 * Нерозв'язана пара — найгірший випадок: вона просто випадає з підрахунку,
		 * і гейт зеленіє, не подивившись. Тому вони рахуються окремо й називаються
		 * поіменно (§ 10.7 вимагає саме цього: «пропуски розв'язувача пораховані й
		 * названі»).
		 */
		const unresolved: string[] = [];
		for (const theme of THEMES) {
			for (const [fg, stack] of PAIRS) {
				if (!resolve(tokens.get(fg) ?? '', theme)) unresolved.push(`${theme}: --${fg}`);
				for (const layer of stack) {
					if (!resolve(tokens.get(layer) ?? '', theme)) unresolved.push(`${theme}: --${layer}`);
				}
			}
		}
		expect([...new Set(unresolved)], 'розв’язувач не впорався').toEqual([]);
	});

	it('перевірка жива: розв’язувач читає альфу', () => {
		/*
		 * Доти він віддавав `null` на будь-якому `rgb(… / a)`. Опис вище цього не
		 * спіймав би сам: поки жодна пара не називала напівпрозорого токена,
		 * «не впорався» не мало з чим спрацювати.
		 */
		const soft = resolve(tokens.get('danger-soft') ?? '', 'dark');
		expect(soft?.alpha, '--danger-soft прочитано як суцільний колір').toBeLessThan(1);
	});

	it('нижній шар кожного тла непрозорий', () => {
		// Стек, що закінчується альфою, дає колір, якого на екрані немає: вимір
		// при цьому не падає, а бреше.
		const leaky: string[] = [];
		for (const theme of THEMES) {
			for (const [, stack] of PAIRS) {
				const name = stack[stack.length - 1];
				const bottom = resolve(tokens.get(name) ?? '', theme);
				if (bottom && bottom.alpha < 1) leaky.push(`${theme}: --${name}`);
			}
		}
		expect([...new Set(leaky)], 'під нижнім шаром лишилося невідоме тло').toEqual([]);
	});

	it.each(THEMES)('у темі «%s» кожна пара не нижче AA', (theme) => {
		const low = PAIRS.map(([fg, stack]) => {
			const back = backdrop(stack, theme);
			const paint = resolve(tokens.get(fg) ?? '', theme);
			if (!back || !paint) return null;
			const front = flatten(paint, back);
			const ratio = contrast(front, back);
			const where = stack.map((name) => `--${name}`).join(' над ');
			return ratio < AA ? `--${fg} на ${where}: ${ratio.toFixed(2)} при потрібних ${AA}` : null;
		}).filter((entry): entry is string => entry !== null);

		expect(low, `нижче AA у темі «${theme}»:\n${low.join('\n')}`).toEqual([]);
	});
});
