import { dev } from '$app/environment';

const KEY = 'audioremote_debug_mode';

function readSaved(): boolean | null {
	if (typeof window === 'undefined') return null;
	try {
		const val = window.localStorage.getItem(KEY);
		return val === '1' ? true : val === '0' ? false : null;
	} catch {
		return null;
	}
}

class DebugMode {
	saved = $state<boolean | null>(readSaved());
	enabled = $derived(this.saved ?? dev);

	get pressesToToggle(): number {
		return dev || this.enabled ? 5 : 55;
	}

	set(value: boolean): void {
		this.saved = value;
		try {
			window.localStorage.setItem(KEY, value ? '1' : '0');
		} catch {
			// ignore storage quota error
		}
	}

	toggle(): boolean {
		const next = !this.enabled;
		this.set(next);
		return next;
	}
}

export const debugMode = new DebugMode();
