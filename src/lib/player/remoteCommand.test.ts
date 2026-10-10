import { describe, expect, it, vi } from 'vitest';
import { executeRemote } from './remoteCommand';
import type { AudioEngine } from '$lib/audio/engine.svelte';
import type { BoardTrack } from '$lib/board/editor';

describe('executeRemote', () => {
	const dummyTracks: BoardTrack[] = [
		{
			id: 't1',
			title: 'Track 1',
			fileName: 'track1.mp3',
			path: 'track1.mp3',
			visibility: 'all',
			hotkey: null,
			color: null,
			icon: null,
			plays: 1,
			gapSec: 0,
			trigger: null
		},
		{
			id: 't2',
			title: 'Hidden',
			fileName: 'track2.mp3',
			path: 'track2.mp3',
			visibility: 'none',
			hotkey: null,
			color: null,
			icon: null,
			plays: 1,
			gapSec: 0,
			trigger: null
		}
	];

	const repeatOf = () => ({ plays: 1, gapSec: 0 });

	it('відхиляє команду play для невидимого треку', async () => {
		const engine = { play: vi.fn() } as unknown as AudioEngine;
		const res = await executeRemote(
			engine,
			{ by: 'u1', type: 'play', value: 't2', at: 1 },
			dummyTracks,
			repeatOf
		);
		expect(res).toBe('error.fileGone');
		expect(engine.play).not.toHaveBeenCalled();
	});

	it('виконує play для доступного треку', async () => {
		const engine = { play: vi.fn() } as unknown as AudioEngine;
		const res = await executeRemote(
			engine,
			{ by: 'u1', type: 'play', value: 't1', at: 1 },
			dummyTracks,
			repeatOf
		);
		expect(res).toBeNull();
		expect(engine.play).toHaveBeenCalledWith('t1', { plays: 1, gapSec: 0 });
	});

	it('виконує pause, resume, stop', async () => {
		const engine = {
			pause: vi.fn(),
			resume: vi.fn(),
			stop: vi.fn(),
			setVolume: vi.fn(),
			seek: vi.fn()
		} as unknown as AudioEngine;

		await executeRemote(engine, { by: 'u1', type: 'pause', at: 1 }, dummyTracks, repeatOf);
		expect(engine.pause).toHaveBeenCalled();

		await executeRemote(engine, { by: 'u1', type: 'resume', at: 1 }, dummyTracks, repeatOf);
		expect(engine.resume).toHaveBeenCalled();

		await executeRemote(engine, { by: 'u1', type: 'stop', at: 1 }, dummyTracks, repeatOf);
		expect(engine.stop).toHaveBeenCalled();
	});
});
