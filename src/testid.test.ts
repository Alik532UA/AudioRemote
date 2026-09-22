// @vitest-environment node
// Перевірка лише читає файли — DOM їй не потрібен.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * КОНВЕНЦІЇ `data-testid` (TESTID-AND-NAMING-v9 § 1.2–§ 1.4, § 1.9.1).
 *
 * ## Чому статично по джерелах
 *
 * Тут увесь текст іде через i18n, тож `getByText` непридатний, а
 * `getByRole(name:)` ламався б на кожній мові — `data-testid` лишається
 * ОСНОВНИМ локатором (§ 1.1, уточнення для локалізованих проєктів). А раз він
 * основний, то його форма — контракт, і контракт без перевірки розходиться:
 * на день постановки гейта в проєкті вже співіснували `-dialog` і `-modal`,
 * `-head` і `-header`.
 *
 * Сканер бачить 100% testid — включно з тими, що всередині `{#if}`, вікон і
 * гілок помилок, куди браузерна перевірка після `goto()` не заходить ніколи.
 * Браузерного доповнення (§ 1.9.2, рантайм-дублікати) тут немає: E2E-набору в
 * проєкті немає навмисно (PROJECT-CONTEXT.md § 4).
 *
 * ## Чому перелік `LEGACY_ALLOWED` такий довгий
 *
 * Проєкт писався до того, як цей гейт зʼявився, і більшість назв не має
 * канонічного типу. Одним комітом це не мігрується (§ 1.10): кожна назва
 * потребує рішення про HTML-семантику елемента, а не заміни за схожістю.
 * Скільки їх — видно з переліку нижче, а не з числа в цьому реченні: число в
 * прозі застаріває тим самим комітом, яким його записали.
 *
 * Тому тут ратчет, як в `OVERSIZED_ALLOWLIST` зі `structure.test.ts`: перелік
 * лише СКОРОЧУЄТЬСЯ, новий testid мусить бути канонічним із першого рядка, а
 * виправлений вимагає прибрати рядок звідси тим самим комітом. Порожній
 * перелік = міграцію завершено.
 *
 * Механічну частину міграції (§ 1.10, крок 2 — заборонені слова) виконано
 * одразу: `-dialog` → `-modal` у семи вікнах, `open-trigger` →
 * `open-trigger-btn`. Заборонені слова винятків не мають і не матимуть.
 *
 * Зворотний експеримент — в описі коміту, що приніс файл.
 */

const CANON = new Set([
	// інтерактивні
	'btn',
	'link',
	'input',
	'textarea',
	'checkbox',
	'radio',
	'select',
	'toggle',
	'slider',
	'option',
	// форми
	'form',
	'fieldset',
	'label',
	'error',
	'hint',
	// оверлеї
	'modal',
	'drawer',
	'backdrop',
	'overlay',
	'tooltip',
	'toast',
	// структура
	'card',
	'list',
	'item',
	'row',
	'cell',
	'tabs',
	'tab',
	'panel',
	'section',
	'header',
	'footer',
	'nav',
	'banner',
	'menu',
	'toolbar',
	'container',
	// медіа
	'icon',
	'img',
	// read-only контент
	'title',
	'text',
	'message',
	'warning',
	'value',
	'count',
	'status',
	'badge',
	'progress',
	'spinner',
	'skeleton'
]);

/**
 * Заборонено в позиції типу — тобто останнім статичним сегментом.
 *
 * Саме в ПОЗИЦІЇ, а не будь-де: ці слова цілком законні як частина назви фічі.
 * `open-trigger-btn` — це кнопка, що відкриває запуск за API, і слово
 * «trigger» тут предметне. Заборона всюди змусила б перевірку боротися з
 * предметною областю проєкту, і її б вимкнули.
 */
const BANNED_AS_TYPE: Record<string, string> = {
	wrapper: 'container',
	wrap: 'container',
	box: 'container',
	root: 'container',
	block: 'section',
	area: 'section',
	group: 'fieldset | toolbar | section',
	content: 'panel',
	grid: 'list',
	widget: 'card | panel | section',
	display: 'value',
	switcher: 'select | toggle | tabs',
	trigger: 'btn',
	help: 'hint',
	dialog: 'modal',
	popup: 'modal',
	step: 'item',
	dot: 'item | badge',
	subtab: 'tab'
};

/**
 * Заборонено в БУДЬ-ЯКІЙ позиції: щойно в проєкті співіснують `-btn` і
 * `-button`, кожен локатор стає здогадкою про те, який із двох обрав автор.
 */
const BANNED_ANYWHERE: Record<string, string> = { button: 'btn', buttons: 'btn | toolbar' };

/** Назви без канонічного типу, що чекають на міграцію. Перелік лише коротшає. */
const LEGACY_ALLOWED = new Set<string>([
	'about',
	'admin-apply',
	'admin-bar',
	'admin-down-{track.id}',
	'admin-enter-submit',
	'admin-leave',
	'admin-open',
	'admin-rescan',
	'admin-settings-{track.id}',
	'admin-trouble',
	'admin-up-{track.id}',
	'admin-wrong',
	'arm',
	'arm-refused',
	'armed',
	'back',
	'board-head',
	'board-id',
	'board-name',
	'board-sheet',
	'brand',
	'capture-key',
	'change-folder',
	'clear-key',
	'cmd-next',
	'cmd-pause',
	'cmd-prev',
	'cmd-resume',
	'cmd-stop',
	'cmd-volume',
	'config-readonly',
	'connect-id',
	'connect-remember',
	'connect-submit',
	'copy-pair',
	'copy-secret',
	'copy-trail',
	'crash-retry',
	'create-submit',
	'db-offline',
	'deck',
	'deck-collapse',
	'deck-expand',
	'dialog-address',
	'dialog-id',
	'down-{entry.id}',
	'empty-library',
	'equalizer',
	'fixed-id',
	'fixed-pair',
	'folder-mark-{entry.id}',
	'folder-mark-{track.id}',
	'folder-path',
	'folder-pick',
	'folder-save',
	'go-connect',
	'go-create',
	'go-settings',
	'go-settings-full',
	'half-pair',
	'key-rejected',
	'key-{entry.id}',
	'leave-go',
	'leave-stay',
	'library-denied',
	'my-boards',
	'no-support',
	'now-playing',
	'open-hidden',
	'open-remote',
	'page-crash',
	'pick-folder',
	'pinned-id',
	'pinned-save',
	'play-here-{entry.id}',
	'play-{track.id}',
	'player-mute',
	'player-next',
	'player-only-{entry.id}',
	'player-pause',
	'player-prev',
	'player-resume',
	'player-seek',
	'player-stop',
	'player-trouble',
	'player-volume',
	'qr-code',
	'reload-prompt',
	'remote-mute',
	'remote-seek',
	'remote-trouble',
	'rescan',
	'schedule-asleep',
	'settings-clear',
	'settings-lang-{locale}',
	'settings-save',
	'start-notice',
	'starting',
	"theme-{option.value ?? 'system'}",
	'tips',
	'track-settings-{entry.id}',
	'trail',
	'trigger-clear',
	'trigger-headers',
	'trigger-health',
	'trigger-mark-{entry.id}',
	'trigger-mark-{track.id}',
	'trigger-path',
	'trigger-save',
	'trigger-test-{test}',
	'trigger-url',
	'up-{entry.id}',
	'visibility-{option}-{trackId}',
	'weak-password',
	'week-from-{index}',
	'week-on-{index}',
	'week-same',
	'week-to-{index}',
	'{id}-caps',
	'{id}-layout'
]);

/**
 * Свідомі повтори в межах файлу: той самий елемент у взаємовиключних гілках
 * `{#if}/{:else}`, коли тесту потрібен ОДИН локатор незалежно від гілки.
 *
 * `go-settings` — саме такий випадок і єдиний тут: у шапці це гамбургер на
 * дошці, посилання на сторінці налаштувань і кнопка всюди інакше. Для того,
 * хто шукає «як звідси потрапити в налаштування», це одна річ, а не три.
 *
 * Не плутати з реальним дублікатом, коли обидва елементи в DOM одночасно:
 * такий розводять, а не вносять сюди.
 */
const ALLOWED_DUPLICATES = new Set<string>(['go-settings']);

/**
 * Чим замінюємо `{…}` та `${…}`. Саме літера, а не порожній рядок: інакше
 * `news-card-${id}` стає `news-card-`, і перевірка kebab-case падає на
 * висячому дефісі, якого в коді немає.
 */
const DYNAMIC = 'x';

const IGNORED_DIRS = new Set(['node_modules', '.svelte-kit', 'build', 'dev-dist']);

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (IGNORED_DIRS.has(entry)) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) svelteFiles(full, out);
		else if (entry.endsWith('.svelte')) out.push(full.split('\\').join('/'));
	}
	return out;
}

/**
 * Прибирає те, що не є розміткою: `<style>` (там testid трапляється в
 * селекторах `:global([data-testid="…"])`) і коментарі (там лишаються старі
 * назви та пояснення). Без цього перевірка рахувала б їх за окремі елементи й
 * повідомляла про дублікати, яких у DOM немає.
 */
const markupOnly = (text: string): string =>
	text.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');

interface Found {
	id: string;
	file: string;
}

const all: Found[] = svelteFiles('src').flatMap((file) => {
	const text = markupOnly(readFileSync(file, 'utf8'));
	const re = /data-testid=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;
	return [...text.matchAll(re)].map((m) => ({ id: m[1] ?? m[2] ?? m[3] ?? m[4], file }));
});

/**
 * Динаміка замінюється на `-x-`, а не просто на `x`: вставка трапляється без
 * дефіса (`…-link{suffix}`), і без штучної межі тип злипся б із нею в один
 * сегмент `linkx`, якого в каноні немає — перевірка сварилась би на цілком
 * правильний id.
 */
const segmentsOf = (id: string): string[] =>
	id
		.replace(/\$?\{[^}]*\}/g, `-${DYNAMIC}-`)
		.split('-')
		.filter(Boolean);

/** Останній сегмент, що не є динамічним чи числовим дискримінатором. */
function typeSegment(id: string): string {
	const segs = segmentsOf(id);
	while (segs.length && (segs.at(-1) === DYNAMIC || /^\d+$/.test(segs.at(-1) as string)))
		segs.pop();
	return segs.at(-1) ?? '';
}

const checked = all.filter(({ id }) => !LEGACY_ALLOWED.has(id));

describe('конвенції data-testid (TESTID-AND-NAMING-v9 § 1)', () => {
	it('перевірка жива: testid у джерелах знайдено', () => {
		// Межа не нуль: на день коміту їх 165. Не рівність — гейт, що червоніє
		// від кожного доданого елемента, вимикають.
		expect(all.length, 'сканер не бачить testid — далі все зелене дарма').toBeGreaterThan(100);
	});

	it('перевірка жива: поза переліком лишилося що перевіряти', () => {
		// Порожній `checked` означав би, що ратчет проковтнув геть усе, і три
		// описи нижче зелені від того, що дивляться в порожнечу.
		expect(checked.length, 'усе під винятком — перевіряти нема чого').toBeGreaterThan(20);
	});

	it('не вживає заборонених слів у позиції типу (§ 1.4)', () => {
		const bad = checked
			.filter(({ id }) => typeSegment(id) in BANNED_AS_TYPE)
			.map(
				({ id, file }) =>
					`${id}  (${file}) — «${typeSegment(id)}» → ${BANNED_AS_TYPE[typeSegment(id)]}`
			);
		expect(bad, `заборонений тип:\n${bad.join('\n')}`).toEqual([]);
	});

	it('не змішує -btn і -button (§ 1.4)', () => {
		// Ця заборона діє в будь-якій позиції й винятків не має: два написання
		// одного типу роблять кожен локатор здогадкою.
		const bad = all
			.filter(({ id }) => segmentsOf(id).some((segment) => segment in BANNED_ANYWHERE))
			.map(({ id, file }) => `${id}  (${file}) — «button» → btn`);
		expect(bad, `заборонене слово в будь-якій позиції:\n${bad.join('\n')}`).toEqual([]);
	});

	it('кожен testid має канонічний тип (§ 1.3)', () => {
		const bad = checked
			.filter(({ id }) => !segmentsOf(id).some((segment) => CANON.has(segment)))
			.map(({ id, file }) => `${id}  (${file})`);
		expect(
			bad,
			'тип елемента не визначається з назви — схема «домен → елемент → тип»:\n' + bad.join('\n')
		).toEqual([]);
	});

	it('тільки kebab-case ASCII (§ 1.2)', () => {
		// Кирилична літера тут дає адресу локатора, яка ВИГЛЯДАЄ правильною й не
		// збігається ні з чим.
		const bad = all
			.filter(({ id }) => /[A-Z]|[Ѐ-ӿ]|--|^-|-$/.test(id.replace(/\$?\{[^}]*\}/g, DYNAMIC)))
			.map(({ id, file }) => `${id}  (${file})`);
		expect(bad, `порушення kebab-case:\n${bad.join('\n')}`).toEqual([]);
	});

	it('немає недетермінованих id (§ 1.6)', () => {
		// Випадкове значення в локаторі — це тест, що падає раз на прогін.
		const bad = all
			.filter(({ id }) => /randomUUID|Math\.random|Date\.now/.test(id))
			.map(({ id, file }) => `${id}  (${file})`);
		expect(bad, `недетерміновані id:\n${bad.join('\n')}`).toEqual([]);
	});

	it('немає дублікатів у межах одного компонента (§ анти-патерн HIGH)', () => {
		/*
		 * Саме «в межах файлу», а не проєкту: той самий id у двох компонентах не
		 * обовʼязково помилка — вони можуть ніколи не показуватися разом (плеєр і
		 * пульт мають спільні назви для однакових за змістом елементів). Довести
		 * це статично неможливо, тож глобальна перевірка давала б хибні
		 * спрацювання й привчила б їх ігнорувати.
		 *
		 * Динамічні id пропускаються: той самий шаблон у двох циклах дає різні
		 * значення в DOM. Статичний, повторений у файлі, — колізія завжди, бо
		 * компонент рендериться цілком.
		 */
		const byFile = new Map<string, string[]>();
		for (const { id, file } of all) {
			if (id.includes('{') || ALLOWED_DUPLICATES.has(id)) continue;
			byFile.set(file, [...(byFile.get(file) ?? []), id]);
		}

		const dupes: string[] = [];
		for (const [file, ids] of byFile) {
			const seen = new Set<string>();
			for (const id of ids) {
				if (seen.has(id)) dupes.push(`${id}  (${file})`);
				seen.add(id);
			}
		}
		expect(dupes, `дублікати в одному файлі:\n${dupes.join('\n')}`).toEqual([]);
	});

	it('перелік міграції лише скорочується (§ 1.10)', () => {
		/*
		 * Прострочений виняток — така сама проблема, як його відсутність: він
		 * приховає наступну назву, що випадково збіглася зі старою. Тому назва,
		 * якої в джерелах уже немає, валить прогін і вимагає прибрати рядок.
		 */
		const live = new Set(all.map(({ id }) => id));
		const gone = [...LEGACY_ALLOWED].filter((id) => !live.has(id));
		expect(gone, `назви вже немає — прибрати з LEGACY_ALLOWED:\n${gone.join('\n')}`).toEqual([]);

		const staleDuplicates = [...ALLOWED_DUPLICATES].filter((id) => !live.has(id));
		expect(staleDuplicates, 'прибрати з ALLOWED_DUPLICATES').toEqual([]);
	});
});
