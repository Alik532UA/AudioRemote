import { SvelteDate } from 'svelte/reactivity';
import { scheduleReady, type TrackTrigger } from './trigger';

/**
 * ПЛАНУВАЛЬНИК РОЗКЛАДУ: запуск треків за системним годинником.
 *
 * ## Що робить
 *
 * Перевіряє системний час кожну секунду. Якщо поточна хвилина збігається з
 * точкою розкладу для сьогоднішнього дня — запускає трек через `onFire`.
 *
 * ## Захист від засинання та тротлінгу (Grace period 2 хв)
 *
 * Якщо комп'ютер спав або вкладка була заморожена:
 * 1. Якщо запізнення <= 2 хв (120 секунд) — подія вважається актуальною й
 *    запускається.
 * 2. Якщо запізнення > 2 хв — звук НЕ запускається, а подія передається в
 *    `onMissed`, щоб зафіксувати пропуск у журналі дій і не лякати людей.
 */
export class SchedulerWatcher {
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastTickMs = 0;
	private firedToday: Record<string, boolean> = {};
	private fire: ((trackId: string) => void) | null = null;
	private missed: ((trackId: string, time: string) => void) | null = null;
	private tracks: { id: string; trigger: TrackTrigger }[] = [];

	onFire(callback: (trackId: string) => void): void {
		this.fire = callback;
	}

	onMissed(callback: (trackId: string, time: string) => void): void {
		this.missed = callback;
	}

	clearHistoryFor(trackId: string): void {
		for (const key of Object.keys(this.firedToday)) {
			if (key.startsWith(`${trackId}|`)) {
				delete this.firedToday[key];
			}
		}
	}

	sync(entries: readonly { id: string; trigger?: TrackTrigger | null }[]): void {
		const nextTracks = entries
			.filter((entry): entry is { id: string; trigger: TrackTrigger } =>
				Boolean(entry.trigger && scheduleReady(entry.trigger))
			)
			.map((entry) => ({ id: entry.id, trigger: entry.trigger }));

		for (const track of nextTracks) {
			const old = this.tracks.find((t) => t.id === track.id);
			if (old && JSON.stringify(old.trigger.blocks) !== JSON.stringify(track.trigger.blocks)) {
				this.clearHistoryFor(track.id);
			}
		}

		this.tracks = nextTracks;

		if (this.tracks.length > 0 && !this.timer) {
			this.start();
		} else if (this.tracks.length === 0 && this.timer) {
			this.stop();
		}
	}

	start(): void {
		if (this.timer) return;
		this.lastTickMs = Date.now();
		this.timer = setInterval(() => this.tick(), 1000);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.lastTickMs = 0;
	}

	tick(now: Date = new SvelteDate()): void {
		const nowMs = now.getTime();
		const today = (now.getDay() + 6) % 7;
		const todayDateStr = now.toDateString();
		const currentMinutes = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

		for (const track of this.tracks) {
			const blocks = track.trigger.blocks ?? [];
			for (const block of blocks) {
				if (!block.days.includes(today)) continue;

				for (const time of block.times) {
					const key = `${track.id}|${todayDateStr}|${time}`;
					if (this.firedToday[key]) continue;

					const [hours, minutes] = time.split(':').map(Number);
					const scheduledDate = new SvelteDate(now);
					scheduledDate.setHours(hours, minutes, 0, 0);
					const scheduledMs = scheduledDate.getTime();

					if (nowMs < scheduledMs) continue;

					// Час настав у цьому такті: або поточна хвилина (будь-яка секунда :00..:59),
					// або момент перетнуто між тактами (після сну / тротлінгу вкладки).
					const isDueNow =
						time === currentMinutes ||
						(this.lastTickMs > 0 && scheduledMs >= this.lastTickMs && scheduledMs <= nowMs);

					if (isDueNow) {
						this.firedToday[key] = true;
						if (nowMs - scheduledMs <= 120_000) {
							this.fire?.(track.id);
						} else {
							this.missed?.(track.id, time);
						}
					} else if (this.lastTickMs === 0 || scheduledMs < this.lastTickMs) {
						// Подія була задовго до запуску планувальника сьогодні.
						this.firedToday[key] = true;
					}
				}
			}
		}

		this.lastTickMs = nowMs;
	}
}

export const schedulerWatcher = new SchedulerWatcher();
