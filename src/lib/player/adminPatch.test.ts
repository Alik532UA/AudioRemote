// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyPatch } from './adminPatch';
import { MAX_GAP_SEC, MAX_ICON, MAX_PLAYS } from '$lib/audio/boardConfig';
import type { BoardTrack } from '$lib/board/editor';

/**
 * ЩО ПРОХОДИТЬ КРІЗЬ АДМІНСЬКУ ЗМІНУ, А ЩО НІ.
 *
 * `applyPatch` — це МЕЖА: по один її бік рядок, який прислав чужий пристрій,
 * по другий — файл налаштувань біля музики й запис у базі. Усе, що звідси
 * вийде, поїде в базу без жодної дальшої перевірки, а правило бази відкидає
 * незнане значення РАЗОМ З УСІМ записом (`$other: false`). Тобто ціна одного
 * непропущеного поля тут — не зіпсутий колір, а бібліотека, якої на пульті
 * «немає», при обраній папці.
 *
 * Через це перевірки нижче написані від зловмисника, а не від користувача:
 * кожна питає «що станеться, якщо в полі буде НЕ те». Щасливий шлях тут
 * потрібен рівно для того, щоб довести, що перевірка взагалі щось пропускає.
 */

const base: BoardTrack = {
	id: 'track-1',
	path: 'music/fanfare.mp3',
	title: 'Фанфари',
	fileName: 'fanfare',
	color: 'amber',
	icon: '🎺',
	hotkey: 'KeyF',
	visibility: 'all',
	plays: 1,
	gapSec: 0,
	trigger: null
};

describe('межа адмінської зміни (SECURITY-v9 § 1)', () => {
	it('перевірка жива: законна зміна проходить цілком', () => {
		const out = applyPatch(base, {
			title: 'Фанфари довгі',
			color: 'ruby',
			icon: '🥁',
			hotkey: 'KeyG',
			visibility: 'player',
			plays: 3,
			gapSec: 10
		});

		expect(out).toMatchObject({
			title: 'Фанфари довгі',
			color: 'ruby',
			icon: '🥁',
			hotkey: 'KeyG',
			visibility: 'player',
			plays: 3,
			gapSec: 10
		});
	});

	it('шлях до файлу змінити не можна — це знання про папку', () => {
		const out = applyPatch(base, {
			path: '../../etc/passwd',
			fileName: 'passwd'
		} as Partial<BoardTrack>);
		expect(out.path).toBe('music/fanfare.mp3');
		expect(out.fileName).toBe('fanfare');
		expect(out.id).toBe('track-1');
	});

	/*
	 * ЦЕЙ ОПИС І Є ПРИЧИНОЮ ФАЙЛУ. Колір був єдиним полем, яке проходило сюди
	 * будь-яким рядком: перевірялося `typeof === 'string'` і нічого більше.
	 * Рядок, що не збігається з формою правила бази, лягав у файл біля музики
	 * й далі відкидався разом з усією бібліотекою.
	 */
	describe('колір приймається лише у формі, яку приймає база', () => {
		it.each([
			['порожній рядок', ''],
			['із пробілом', 'light blue'],
			['великі літери', 'Amber'],
			['код кольору', '#d64550'],
			['занадто довгий', 'aaaaaaaaaaaaaaaaaaaa'],
			['занадто короткий', 'a'],
			['з цифрою', 'red2'],
			['з розміткою', '<script>'],
			['не рядок', 42]
		])('%s не проходить', (_name, value) => {
			expect(applyPatch(base, { color: value as string }).color).toBeNull();
		});

		it('назва з переліку проходить', () => {
			expect(applyPatch(base, { color: 'emerald' }).color).toBe('emerald');
		});

		it('назва, якої ще немає в переліку, теж проходить', () => {
			// Дошку могла пофарбувати новіша збірка: форма важлива, членство — ні.
			expect(applyPatch(base, { color: 'saffron' }).color).toBe('saffron');
		});
	});

	it('порожній підпис повертає імʼя файлу, а не порожнечу', () => {
		expect(applyPatch(base, { title: '   ' }).title).toBe('fanfare');
		expect(applyPatch(base, {}).title).toBe('fanfare');
	});

	it('довгий підпис і довгий значок вкорочуються', () => {
		const out = applyPatch(base, { title: 'я'.repeat(500), icon: '🎺'.repeat(50) });
		expect(out.title).toHaveLength(200);
		expect((out.icon as string).length).toBeLessThanOrEqual(MAX_ICON);
	});

	it('клавіша поза дозволеними не призначається', () => {
		expect(applyPatch(base, { hotkey: 'Space' }).hotkey).toBeNull();
		expect(applyPatch(base, { hotkey: 'не код' }).hotkey).toBeNull();
		expect(applyPatch(base, { hotkey: 'KeyQ' }).hotkey).toBe('KeyQ');
	});

	it('невідома видимість стає «всім», а не лишається як прийшла', () => {
		expect(applyPatch(base, { visibility: 'nobody' as never }).visibility).toBe('all');
	});

	it('повтори й пауза затискаються в межі', () => {
		expect(applyPatch(base, { plays: 10_000 }).plays).toBe(MAX_PLAYS);
		expect(applyPatch(base, { plays: -5 }).plays).toBe(1);
		expect(applyPatch(base, { plays: Number.NaN }).plays).toBe(1);
		expect(applyPatch(base, { plays: 2.6 }).plays).toBe(3);
		expect(applyPatch(base, { gapSec: 10_000 }).gapSec).toBe(MAX_GAP_SEC);
		expect(applyPatch(base, { gapSec: -1 }).gapSec).toBe(0);
	});

	it('сміття замість тригера лишає трек без тригера', () => {
		expect(applyPatch(base, { trigger: 'дай' as never }).trigger).toBeNull();
	});

	it('поле, якого немає в переліку, до треку не доїжджає', () => {
		const out = applyPatch(base, { boom: true } as Partial<BoardTrack>) as unknown as Record<
			string,
			unknown
		>;
		expect(out.boom).toBeUndefined();
	});
});
