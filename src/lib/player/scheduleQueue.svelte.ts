import { deckLog } from '$lib/services/deckLog.svelte';

export interface QueuedTrack {
	trackId: string;
	at: number;
}

/**
 * ЧЕРГА ОЧІКУВАННЯ ДЛЯ ЗАПЛАНОВАНИХ ТРЕКІВ.
 *
 * Коли трек спрацьовує за розкладом, а на дошці вже грає звук:
 * 1. Трек стає в чергу на 1 місце (новіший витісняє старіший).
 * 2. Чекає до 2 хвилин (120 000 мс).
 * 3. Якщо поточний звук закінчився вчасно — запускається.
 * 4. Якщо поточний звук триває довше 2 хв — черга скасовується як прострочена.
 */
export class ScheduleQueue {
	queued = $state<QueuedTrack | null>(null);
	private timer: ReturnType<typeof setInterval> | null = null;

	start(): () => void {
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(() => this.checkTimeout(), 1000);
		return () => this.stop();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	clear(): void {
		this.stop();
		this.queued = null;
	}

	set(trackId: string): void {
		this.queued = { trackId, at: Date.now() };
		deckLog.scheduleQueued(trackId);
	}

	cancel(): void {
		if (!this.queued) return;
		const id = this.queued.trackId;
		this.queued = null;
		deckLog.scheduleCancelled(id);
	}

	pop(): string | null {
		if (!this.queued) return null;
		const { trackId, at } = this.queued;
		this.queued = null;
		if (Date.now() - at <= 120_000) {
			return trackId;
		}
		deckLog.scheduleExpired(trackId);
		return null;
	}

	checkTimeout(): void {
		if (!this.queued) return;
		if (Date.now() - this.queued.at > 120_000) {
			const id = this.queued.trackId;
			this.queued = null;
			deckLog.scheduleExpired(id);
		}
	}
}
