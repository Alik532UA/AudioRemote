import { isAssignable } from '$lib/hotkeys/hotkeys';
import { isColorSlug } from '$lib/config/trackColors';
import { isVisibility, MAX_GAP_SEC, MAX_ICON, MAX_PLAYS, toTrigger } from '$lib/audio/boardConfig';
import type { BoardTrack } from '$lib/board/editor';

/**
 * ЩО САМЕ ДОЗВОЛЕНО ЗМІНИТИ АДМІНІСТРАТОРОВІ.
 *
 * Береться не «все, що прийшло», а перелічені поля — і кожне через ту саму
 * перевірку, крізь яку проходить файл налаштувань. Решта (шлях до файлу, імʼя,
 * сам факт існування треку) — це знання про папку, і воно лишається тим, що
 * прочитав із диска цей комп'ютер.
 *
 * Без цього підроблений запис підсунув би у файл чужий шлях, а застосунок
 * записав би його як своє рішення.
 */
export function applyPatch(entry: BoardTrack, change: Partial<BoardTrack>): BoardTrack {
	const title = typeof change.title === 'string' ? change.title.trim().slice(0, 200) : '';
	const hotkey =
		typeof change.hotkey === 'string' && isAssignable(change.hotkey) ? change.hotkey : null;
	const whole = (value: unknown, max: number, least: number): number =>
		typeof value === 'number' && Number.isFinite(value)
			? Math.min(max, Math.max(least, Math.round(value)))
			: least;

	return {
		...entry,
		title: title.length > 0 ? title : entry.fileName,
		/*
		 * ФОРМА, А НЕ «це рядок». Колір — єдине поле, яке звідси їде в базу
		 * незміненим, а правило бази приймає лише `/^[a-z]{2,12}$/`. Рядок іншої
		 * форми проходив крізь цю функцію, лягав у файл біля музики й далі
		 * відкидався правилом РАЗОМ З УСІЄЮ бібліотекою: на пульті це виглядало
		 * як «на плеєрі ще не обрано папку» при обраній папці (§ 6 гейтів).
		 */
		color: isColorSlug(change.color) ? change.color : null,
		icon: typeof change.icon === 'string' ? change.icon.trim().slice(0, MAX_ICON) || null : null,
		hotkey,
		visibility: isVisibility(change.visibility) ? change.visibility : 'all',
		plays: whole(change.plays, MAX_PLAYS, 1),
		gapSec: whole(change.gapSec, MAX_GAP_SEC, 0),
		trigger: toTrigger(change.trigger)
	};
}
