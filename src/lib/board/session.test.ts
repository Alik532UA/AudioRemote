// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SavedBoard } from './myBoards';
import { toActive } from './session.svelte';

/**
 * ПЕРЕНОС ДОШКИ ЗІ СПИСКУ В СЕАНС НЕ МАЄ ПРАВА ГУБИТИ ПОЛЯ.
 *
 * `toActive` перелічує поля руками — інакше не можна, бо у збереженої дошки є
 * `at`, якого у відкритої немає. Ціна такого переліку: поле, додане в обидві
 * форми й забуте тут, зникає МОВЧКИ. Компілятор не скаже — усі поля, крім
 * ключа, необов'язкові; на екрані теж нічого: дошка відкривається, просто вже
 * без чогось.
 *
 * Так і сталося з `kind`: інфодошку зі списку «Мої дошки» не можна було
 * відкрити взагалі. Сторінка `/info` бачила дошку без виду, читала її як
 * аудіо (типове для записів, створених до появи видів) і відправляла назад у
 * меню. Аудіодошка при цьому відкривалася — для неї «вид втрачено» і «вид
 * аудіо» збігаються.
 *
 * Тому опис не перелічує поля вдруге, а питає РІЗНИЦЮ: усе, що є у збереженій
 * дошці, крім свідомо залишеного, мусить доїхати.
 */

/** Збережена дошка з УСІМА полями, які взагалі бувають. */
const FULL: Required<SavedBoard> = {
	key: '8d5147727f3cc103ee37ea0e4612b510',
	id: 'VNUTJ',
	name: 'Проба',
	role: 'player',
	kind: 'info',
	password: 'пароль-достатньо-довгий',
	adminPassword: 'другий-пароль-теж-довгий',
	at: 1_790_074_152_093
};

/*
 * `at` — «коли востаннє відкривали»: питання списку, а не відкритої дошки.
 * Список сортується за ним, і у відкритої такого поля немає за задумом.
 */
const LEFT_BEHIND = ['at'];

describe('toActive', () => {
	it('доносить кожне поле, крім свідомо залишених', () => {
		const active = toActive(FULL) as unknown as Record<string, unknown>;
		const lost = Object.keys(FULL).filter(
			(field) => !LEFT_BEHIND.includes(field) && active[field] === undefined
		);
		expect(lost, `загублені поля: ${lost.join(', ')}`).toEqual([]);
	});

	it('значення доїжджають ті самі, а не просто присутні', () => {
		expect(toActive(FULL)).toEqual({
			key: FULL.key,
			id: FULL.id,
			name: FULL.name,
			role: FULL.role,
			kind: FULL.kind,
			password: FULL.password,
			adminPassword: FULL.adminPassword
		});
	});

	it('дошка без необов\u2019язкових полів не набуває чужих значень', () => {
		// Запис, створений до появи видів: `kind` немає, і вигадувати його тут
		// не можна — за це відповідає `kindOf`, і лише воно.
		const old: SavedBoard = { key: 'ключ', id: 'ABCDE', name: '', role: 'remote', at: 0 };
		const active = toActive(old);
		expect(active.kind).toBeUndefined();
		expect(active.password).toBeUndefined();
	});
});
