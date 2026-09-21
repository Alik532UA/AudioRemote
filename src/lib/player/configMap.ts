import { emptyConfig, type BoardConfig, type PlayPolicy } from '$lib/audio/boardConfig';
import type { SourceTrack } from '$lib/audio/source';
import type { BoardTrack } from '$lib/board/editor';

/**
 * ФАЙЛ У ТЕЦІ ↔ СПИСОК НА ЕКРАНІ — переклад в обидва боки, однією парою функцій.
 *
 * Це найдовша частина плеєра, у якій немає ні мережі, ні звуку, ні стану: на
 * вході дані, на виході дані. Усередині контролера вона тонула серед підписок і
 * таймерів, хоч перевіряти її можна числами — і саме її правила найлегше
 * зламати мовчки.
 *
 * ## Правило порядку
 *
 * Спершу йде те, що людина вже розклала (порядок файлу), потім — нові файли за
 * абеткою, як їх віддала тека. Так поява нового треку не переставляє нічого з
 * того, що вже стоїть на своєму місці.
 *
 * ## Що НЕ пишеться у файл
 *
 * Усе, що дорівнює типовому: підпис, який збігається з імʼям файлу; видимість
 * «усім»; одне відтворення; нульова пауза; політика «нічого не робити після
 * треку». Файл читає людина — і кожен зайвий рядок у ньому відволікає від
 * того, що справді змінили. Підпис окремо: записаний завжди, він заповнив би
 * файл іменами файлів, і перейменування файлу на диску вже нічого б не
 * змінило.
 */

/** Список на екрані → те, що ляже у файл теки. */
export function toConfig(entries: readonly BoardTrack[], play: PlayPolicy): BoardConfig {
	return {
		...emptyConfig(),
		...(play.autoNext || play.repeat !== 'none' ? { play: { ...play } } : {}),
		tracks: entries.map((entry) => ({
			path: entry.path,
			...(entry.title !== entry.fileName ? { title: entry.title } : {}),
			...(entry.color ? { color: entry.color } : {}),
			...(entry.icon ? { icon: entry.icon } : {}),
			...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
			...(entry.visibility === 'all' ? {} : { visibility: entry.visibility }),
			...(entry.plays > 1 ? { plays: entry.plays } : {}),
			...(entry.gapSec > 0 ? { gapSec: entry.gapSec } : {}),
			...(entry.trigger ? { trigger: entry.trigger } : {})
		}))
	};
}

/** Те, що знайшлося в теці, плюс файл налаштувань → список на екрані. */
export function toEntries(scanned: readonly SourceTrack[], config: BoardConfig): BoardTrack[] {
	/*
	 * Звичайні обʼєкти, а не `Map`: це короткі довідники в межах одного виклику,
	 * і реактивними вони бути не мусять. Правило `prefer-svelte-reactivity`
	 * вимагає `SvelteMap` від будь-якого `Map` у файлі з рунами — тут це було б
	 * реактивне сховище заради двох пошуків.
	 */
	const settings: Record<string, BoardConfig['tracks'][number] | undefined> = {};
	for (const entry of config.tracks) settings[entry.path] = entry;

	const byPath: Record<string, SourceTrack | undefined> = {};
	for (const track of scanned) byPath[track.path] = track;

	const inConfigOrder = config.tracks
		.map((entry) => byPath[entry.path])
		.filter((track): track is SourceTrack => track !== undefined);
	const fresh = scanned.filter((track) => settings[track.path] === undefined);

	return [...inConfigOrder, ...fresh].map((track) => {
		const setting = settings[track.path];
		return {
			id: track.id,
			path: track.path,
			fileName: track.title,
			title: setting?.title ?? track.title,
			color: setting?.color ?? null,
			icon: setting?.icon ?? null,
			hotkey: setting?.hotkey ?? null,
			visibility: setting?.visibility ?? 'all',
			plays: setting?.plays ?? 1,
			gapSec: setting?.gapSec ?? 0,
			trigger: setting?.trigger ?? null
		};
	});
}
