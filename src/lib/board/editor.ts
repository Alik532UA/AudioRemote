import type { TrackVisibility } from '$lib/audio/boardConfig';
import type { TrackTrigger } from '$lib/triggers/trigger';

/**
 * ХТО МОЖЕ МІНЯТИ ДОШКУ — і чому це інтерфейс, а не клас.
 *
 * Міняти налаштування вміють двоє, і роблять це зовсім по-різному. Плеєр
 * править свій список і пише файл у папці з музикою. Адміністратор на пульті
 * файлу не бачить узагалі: він править копію, а зміну надсилає командою тому,
 * хто файл має.
 *
 * Спільне в них — рівно те, що потрібне вікну налаштувань треку. Тому вікно
 * знає лише цей інтерфейс, а не котрийсь із контролерів: інакше довелося б
 * або тримати друге таке вікно для пульта, або протягувати в нього прапорець
 * «я насправді пульт», і кожне нове поле треба було б додавати двічі.
 *
 * Межа названа прямо: ПАПКУ ЗВІДСИ НЕ ОБРАТИ. Браузер видає доступ до теки лише
 * під натисканням людини, яка сидить за тим комп'ютером, — це та стіна, об яку
 * впирається будь-яке віддалене керування, і обійти її не можна нічим.
 */
export interface BoardTrack {
	id: string;
	path: string;
	/** Підпис на екрані: свій, якщо його дали, інакше імʼя файлу. */
	title: string;
	/** Імʼя файлу без розширення — щоб було видно, що саме перейменували. */
	fileName: string;
	color: string | null;
	/** Код гарячої клавіші (`KeyQ`, `F5`), або `null`. */
	hotkey: string | null;
	/** Кого трек стосується. Див. `TrackVisibility`. */
	visibility: TrackVisibility;
	/** Скільки разів програти поспіль. `1` — як завжди. */
	plays: number;
	/** Пауза між відтвореннями, секунди. */
	gapSec: number;
	/** Запуск за зовнішнім API. `null` — трек запускають руками. */
	trigger: TrackTrigger | null;
}

export interface BoardEditor {
	/** Усі треки, включно з тими, яких не видно нікому. */
	readonly entries: BoardTrack[];
	/** Яка клавіша діє для кожного треку — з урахуванням цифр за порядком. */
	readonly keyLabels: Record<string, string>;

	setTitle(trackId: string, title: string): void;
	setColor(trackId: string, slug: string | null): void;
	setHotkey(trackId: string, hotkey: string | null): void;
	setVisibility(trackId: string, visibility: TrackVisibility): void;
	setRepeat(trackId: string, plays: number, gapSec: number): void;
	setTrigger(trackId: string, trigger: TrackTrigger | null): void;
	triggerFor(trackId: string): TrackTrigger;
	/** Пересунути трек на одну позицію. `-1` — вище, `+1` — нижче. */
	move(trackId: string, delta: number): void;
}
