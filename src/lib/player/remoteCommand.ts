import type { AudioEngine } from '$lib/audio/engine.svelte';
import type { BoardTrack } from '$lib/board/editor';
import type { Command } from '$lib/net/boardTypes';

export type RepeatLookup = (trackId: string) => { plays: number; gapSec: number };

/**
 * ВИКОНАТИ КОМАНДУ З ПУЛЬТА.
 *
 * Перевіряє права (пульт не може запустити те, чого йому не показували)
 * та спрямовує дію у рушій звуку.
 */
export async function executeRemote(
	engine: AudioEngine,
	command: Command,
	entries: readonly BoardTrack[],
	repeatOf: RepeatLookup
): Promise<string | null> {
	switch (command.type) {
		case 'play': {
			const id = String(command.value ?? '');
			if (entries.find((entry) => entry.id === id)?.visibility !== 'all') {
				return 'error.fileGone';
			}
			await engine.play(id, repeatOf(id));
			break;
		}
		case 'pause':
			engine.pause();
			break;
		case 'resume':
			await engine.resume();
			break;
		case 'stop':
			engine.stop();
			break;
		case 'prev': {
			const prev = engine.prevTrackId();
			if (prev) await engine.play(prev, repeatOf(prev));
			break;
		}
		case 'next': {
			const next = engine.nextTrackId();
			if (next) await engine.play(next, repeatOf(next));
			break;
		}
		case 'volume':
			engine.setVolume(Number(command.value ?? 0) / 100);
			break;
		case 'seek':
			engine.seek(Number(command.value ?? 0));
			break;
	}
	return null;
}
