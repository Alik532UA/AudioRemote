import { isAssignable } from '$lib/hotkeys/hotkeys';
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
		color: typeof change.color === 'string' ? change.color : null,
		icon: typeof change.icon === 'string' ? change.icon.trim().slice(0, MAX_ICON) || null : null,
		hotkey,
		visibility: isVisibility(change.visibility) ? change.visibility : 'all',
		plays: whole(change.plays, MAX_PLAYS, 1),
		gapSec: whole(change.gapSec, MAX_GAP_SEC, 0),
		trigger: toTrigger(change.trigger)
	};
}
