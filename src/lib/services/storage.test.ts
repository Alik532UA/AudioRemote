import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../gates/storage';
import {
	PREFIX,
	clearOwn,
	clearOwnSession,
	readItem,
	readJson,
	readSessionItem,
	readSessionJson,
	removeItem,
	removeSessionItem,
	writeItem,
	writeJson,
	writeSessionItem,
	writeSessionJson
} from './storage';

describe('storage facade (STORAGE-NAMESPACE-v10)', () => {
	let memLocal: Storage;
	let memSession: Storage;

	beforeEach(() => {
		memLocal = memoryStorage();
		memSession = memoryStorage();
		vi.stubGlobal('window', {
			localStorage: memLocal,
			sessionStorage: memSession
		});
	});

	it('uses correct unique prefix ending in underscore', () => {
		expect(PREFIX).toBe('audioremote_');
		expect(PREFIX.endsWith('_')).toBe(true);
	});

	it('automatically namespaces written keys', () => {
		writeItem('theme', 'dark');
		expect(memLocal.getItem('audioremote_theme')).toBe('dark');
		expect(readItem('theme')).toBe('dark');

		writeSessionItem('tab', '1');
		expect(memSession.getItem('audioremote_tab')).toBe('1');
		expect(readSessionItem('tab')).toBe('1');
	});

	it('clearOwn removes only own keys and leaves neighbour keys intact', () => {
		// Neighbour project keys
		memLocal.setItem('mindstep_user', 'alice');
		memLocal.setItem('slovko_stats', '{"wins": 5}');
		memLocal.setItem('cv-svelte_lang', 'uk');

		// AudioRemote keys
		writeItem('setting_vol', '80');
		writeItem('recent', 'item1');

		expect(memLocal.length).toBe(5);

		const removed = clearOwn();
		expect(removed).toBe(2);

		// AudioRemote keys gone
		expect(readItem('setting_vol')).toBeNull();
		expect(readItem('recent')).toBeNull();

		// Neighbour keys preserved
		expect(memLocal.getItem('mindstep_user')).toBe('alice');
		expect(memLocal.getItem('slovko_stats')).toBe('{"wins": 5}');
		expect(memLocal.getItem('cv-svelte_lang')).toBe('uk');
	});

	it('clearOwnSession removes only own session keys and leaves neighbour keys intact', () => {
		memSession.setItem('other_app_session', 'secret');
		writeSessionItem('active_temp', 'board1');

		expect(memSession.length).toBe(2);

		const removed = clearOwnSession();
		expect(removed).toBe(1);

		expect(readSessionItem('active_temp')).toBeNull();
		expect(memSession.getItem('other_app_session')).toBe('secret');
	});

	it('handles structured JSON reading and writing safely', () => {
		writeJson('profile', { volume: 75, mute: false });
		expect(readJson('profile', { volume: 0, mute: true })).toEqual({ volume: 75, mute: false });

		// Broken json falls back and removes invalid key
		memLocal.setItem('audioremote_corrupted', 'invalid json{');
		expect(readJson('corrupted', 'fallback')).toBe('fallback');
		expect(memLocal.getItem('audioremote_corrupted')).toBeNull();

		// Session JSON
		writeSessionJson('session_info', { id: 123 });
		expect(readSessionJson('session_info', null)).toEqual({ id: 123 });
	});

	it('does not throw when storage throws QuotaExceededError or SecurityError', () => {
		memLocal.setItem = vi.fn(() => {
			throw new DOMException('Quota exceeded', 'QuotaExceededError');
		});

		expect(() => writeItem('huge', 'data')).not.toThrow();
		expect(() => writeJson('huge_json', { a: 1 })).not.toThrow();
	});

	it('removeItem and removeSessionItem delete only the targeted key', () => {
		writeItem('k1', 'v1');
		writeItem('k2', 'v2');
		removeItem('k1');
		expect(readItem('k1')).toBeNull();
		expect(readItem('k2')).toBe('v2');

		writeSessionItem('sk1', 'sv1');
		removeSessionItem('sk1');
		expect(readSessionItem('sk1')).toBeNull();
	});
});
