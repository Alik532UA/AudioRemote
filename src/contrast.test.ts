// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TRACK_COLORS } from '$lib/config/trackColors';

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

/*
 * OKLAB — рівно стільки, скільки треба, щоб порахувати `color-mix(in oklab, …)`.
 *
 * Змішати два кольори «на око» в sRGB тут не можна: браузер робить це в іншому
 * просторі, і різниця між sRGB- і Oklab-змішуванням на 14% доходить до кількох
 * одиниць яскравості — тобто рівно того порядку, яким пара відрізняється від
 * порога AA. Коефіцієнти — з CSS Color 4 (§ 9.2, матриці Oklab), а не підібрані.
 */
const srgbToLinear = (channel: number): number => {
	const x = channel / 255;
	return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value: number): number => {
	const x = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
	return Math.min(255, Math.max(0, Math.round(x * 255)));
};

type Oklab = [number, number, number];

const rgbToOklab = ([r, g, b]: Rgb): Oklab => {
	const [R, G, B] = [r, g, b].map(srgbToLinear);
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
};

const oklabToRgb = ([L, a, b]: Oklab): Rgb => {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	].map(linearToSrgb) as Rgb;
};

/**
 * `color-mix(in oklab, A p%, B)` — так, як це робить браузер: у ПОМНОЖЕНИХ НА
 * АЛЬФУ координатах.
 *
 * Множення на альфу — не педантизм, а єдина причина, з якої другим аргументом
 * законно стоїть `transparent`: він має нульову альфу, тобто після ділення
 * назад від нього не лишається нічого, крім частки в підсумковій альфі. Саме
 * так і записана підсвітка кнопок вердикту в журналі — вона мусить вийти
 * «фарбою з альфою 0.14», а не «сірим», яким її зробило б наївне середнє.
 */
function mixOklab(top: Paint, bottom: Paint, weight: number): Paint {
	const rest = 1 - weight;
	const alpha = weight * top.alpha + rest * bottom.alpha;
	if (alpha === 0) return { rgb: [0, 0, 0], alpha: 0 };

	const a = rgbToOklab(top.rgb);
	const b = rgbToOklab(bottom.rgb);
	const mixed = a.map(
		(value, i) => (weight * value * top.alpha + rest * b[i] * bottom.alpha) / alpha
	) as Oklab;
	return { rgb: oklabToRgb(mixed), alpha };
}

/** Значення токена в конкретній темі, або `null`, якщо це не колір. */
function resolve(value: string, theme: Theme, depth = 0): Paint | null {
	if (depth > 5) return null;
	const text = value.trim();

	const ref = /^var\(--([\w-]+)\)$/.exec(text);
	if (ref) return resolve(tokens.get(ref[1]) ?? '', theme, depth + 1);

	const pair = /^light-dark\(([^,]+),\s*(.+)\)$/.exec(text);
	if (pair) return resolve(theme === 'light' ? pair[1] : pair[2], theme, depth + 1);

	/*
	 * `color-mix(in oklab, A p%, B)` — саме та форма, якою в цьому проєкті
	 * записані ВСІ підкладки під колір: смуга відповіді, підсвітка кнопки
	 * вердикту, залитий віджет інфодошки. Інші простори й інший порядок
	 * аргументів сюди не пускаються з тієї самої причини, що й кома-форма
	 * `rgb()` нижче: їх тут немає, і розбирати неіснуюче означало б припускати,
	 * що перевірка працює.
	 */
	const blend = /^color-mix\(\s*in oklab\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/.exec(text);
	if (blend) {
		const top = resolve(blend[1], theme, depth + 1);
		const bottom = resolve(blend[3], theme, depth + 1);
		return top && bottom ? mixOklab(top, bottom, +blend[2] / 100) : null;
	}

	/*
	 * `transparent` існує тут рівно заради другого аргументу `color-mix` — тієї
	 * форми, яку цей самий коміт із розмітки й прибрав. Лишається вона не про
	 * запас: розв'язувач, що мовчки віддає `null` на формі, якої «вже немає», —
	 * це і є той спосіб, яким підсвітка кнопки вердикту два місяці стояла нижче
	 * AA, не показавшись жодному гейту.
	 */
	if (text === 'transparent') return { rgb: [0, 0, 0], alpha: 0 };

	/*
	 * `rgb(R G B / A)` — саме та форма, якою в цьому проєкті записані всі
	 * напівпрозорі токени. Кома-форма сюди не пускається навмисно: її тут немає,
	 * і розбирати неіснуюче означало б припускати, що перевірка працює.
	 */
	const alpha = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/.exec(text);
	if (alpha) return { rgb: [+alpha[1], +alpha[2], +alpha[3]], alpha: +alpha[4] };

	return /^#[0-9a-f]{3,8}$/i.test(text) ? { rgb: hexToRgb(text), alpha: 1 } : null;
}

/**
 * Шар тла: або ІМʼЯ токена (`bg-surface`), або значення CSS дослівно.
 *
 * Дослівне значення потрібне тим підкладкам, які живуть не в `tokens.css`, а в
 * `<style>` компонента: токена для них немає й бути не може — вони складаються
 * з токена та числа на місці. Записані вони тут РІВНО тим текстом, що стоїть у
 * компоненті, щоб розбіжність було видно очима, а не пошуком.
 */
const paintOf = (layer: string, theme: Theme): Paint | null =>
	resolve(tokens.get(layer) ?? layer, theme);

/** Як шар називається у звіті: токен — з дефісами, дослівне значення — як є. */
const nameOf = (layer: string): string => (tokens.has(layer) ? `--${layer}` : layer);

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
	['text-primary', ['accent-soft', 'bg-page']],

	/*
	 * ПІДКЛАДКА, ЗРОБЛЕНА З САМОГО ТЕКСТУ.
	 *
	 * Смуга відповіді звукорежисера (`VerdictToast.svelte`) пише кольором типу
	 * по 14% ТОГО САМОГО кольору. Це найтонша пара застосунку — у світлій темі
	 * рівно 4.52 при потрібних 4.5, тобто запас у дві соті, — і доти її не
	 * міряло ніщо: розв'язувач не знав `color-mix()`, а axe цієї смуги не
	 * бачить, бо вона з'являється лише на відповідь, якої в прогоні немає.
	 *
	 * Ті самі три кольори стоять кнопками вердикту в журналі
	 * (`PanelLog.svelte`) — у спокої на рядку журналу, під курсором на
	 * втопленій поверхні. Обидва стани тут, бо саме ДРУГИЙ і був дефектом: доти
	 * підсвітка домішувала 14% самої кнопки, і напис на ній падав до 4.20.
	 */
	['ok', ['color-mix(in oklab, var(--ok) 14%, var(--bg-surface))']],
	['danger', ['color-mix(in oklab, var(--danger) 14%, var(--bg-surface))']],
	['warn', ['color-mix(in oklab, var(--warn) 14%, var(--bg-surface))']],
	['ok', ['bg-surface-raised']],
	['danger', ['bg-surface-raised']],
	['warn', ['bg-surface-raised']],
	['ok', ['bg-sunken']],
	['danger', ['bg-sunken']],

	/*
	 * КОЛІР ВІДЖЕТА — та сама підкладка, але колір приходить із палітри.
	 *
	 * `PanelGrid` заливає клітинку 12% кольору віджета, а кнопку всередині —
	 * 22%; підпис на обох — звичайний `--text-primary`. Пари зібрані з
	 * `TRACK_COLORS`, а не виписані руками, і це головне: одинадцята заготовка
	 * потрапить під вимір тим самим комітом, яким її додадуть. Обіцянку
	 * «кожен читається і на світлій картці, і на темній» дає докблок палітри —
	 * доти її не перевіряв ніхто.
	 */
	...TRACK_COLORS.flatMap(({ hex }): [string, string[]][] => [
		['text-primary', [`color-mix(in oklab, ${hex} 12%, var(--bg-surface-raised))`]],
		['text-primary', [`color-mix(in oklab, ${hex} 22%, var(--bg-surface))`]]
	])
];

const AA = 4.5;
const THEMES: Theme[] = ['light', 'dark'];

/** Колір стеку тла: знизу вгору, кожен шар кладеться на попередній. */
function backdrop(stack: string[], theme: Theme): Rgb | null {
	const layers = stack.map((name) => paintOf(name, theme));
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
				if (!paintOf(fg, theme)) unresolved.push(`${theme}: ${nameOf(fg)}`);
				for (const layer of stack) {
					if (!paintOf(layer, theme)) unresolved.push(`${theme}: ${nameOf(layer)}`);
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

	it('перевірка жива: розв’язувач змішує в oklab, а не в sRGB', () => {
		/*
		 * Доти будь-який `color-mix()` віддавав `null`, тобто дев'ять підкладок
		 * застосунку просто випадали з підрахунку — той самий мовчазний нуль, від
		 * якого стереже опис вище. Числа взяті з простого випадку: 50% чорного на
		 * білому дають у Oklab 99, а в sRGB — 128. Розбіжність у двадцять дев'ять
		 * одиниць і є те, заради чого тут узагалі є матриці: наївне середнє
		 * завищувало б яскравість підкладки, тобто БРЕХАЛО б у безпечний бік.
		 */
		const half = resolve('color-mix(in oklab, #000000 50%, #ffffff)', 'light');
		expect(half?.rgb[0], 'змішано не в oklab').toBe(99);
		expect(half?.alpha, 'два непрозорі кольори дали прозорий').toBe(1);

		// `transparent` другим аргументом мусить дати фарбу з альфою, а не сірий.
		const tint = resolve('color-mix(in oklab, #ff0000 14%, transparent)', 'light');
		expect(tint?.rgb, 'фарба втратила свій колір').toEqual([255, 0, 0]);
		expect(tint?.alpha, 'фарба вийшла непрозорою').toBeCloseTo(0.14, 5);
	});

	it('нижній шар кожного тла непрозорий', () => {
		// Стек, що закінчується альфою, дає колір, якого на екрані немає: вимір
		// при цьому не падає, а бреше.
		const leaky: string[] = [];
		for (const theme of THEMES) {
			for (const [, stack] of PAIRS) {
				const name = stack[stack.length - 1];
				const bottom = paintOf(name, theme);
				if (bottom && bottom.alpha < 1) leaky.push(`${theme}: ${nameOf(name)}`);
			}
		}
		expect([...new Set(leaky)], 'під нижнім шаром лишилося невідоме тло').toEqual([]);
	});

	it.each(THEMES)('у темі «%s» кожна пара не нижче AA', (theme) => {
		const low = PAIRS.map(([fg, stack]) => {
			const back = backdrop(stack, theme);
			const paint = paintOf(fg, theme);
			if (!back || !paint) return null;
			const front = flatten(paint, back);
			const ratio = contrast(front, back);
			const where = stack.map(nameOf).join(' над ');
			return ratio < AA
				? `${nameOf(fg)} на ${where}: ${ratio.toFixed(2)} при потрібних ${AA}`
				: null;
		}).filter((entry): entry is string => entry !== null);

		expect(low, `нижче AA у темі «${theme}»:\n${low.join('\n')}`).toEqual([]);
	});
});
