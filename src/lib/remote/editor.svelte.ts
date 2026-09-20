import { adminPath } from '$lib/board/boardPath';
import type { BoardEditor, BoardTrack } from '$lib/board/editor';
import { watchTracks } from '$lib/net/admin';
import type { AdminCommandType } from '$lib/net/boardTypes';
import { sendCommand, waitForAck } from '$lib/net/commands';
import { keyLabelsFor } from '$lib/hotkeys/hotkeys';
import { emptyTrigger, type TrackTrigger } from '$lib/triggers/trigger';
import type { TrackVisibility } from '$lib/audio/boardConfig';

/**
 * АДМІНІСТРАТОР НА ПУЛЬТІ: те саме вікно налаштувань, інший шлях до файлу.
 *
 * Плеєр править свій список і пише файл у папці з музикою. Тут файлу немає
 * зовсім: список приходить каналом, правка йде назад командою, а записує її
 * однаково той комп'ютер, у якого папка. Тобто це не «другий джерело правди», а
 * поштова скринька — і саме тому зміна тут показується ОДРАЗУ, ще до відповіді.
 *
 * Без миттєвого показу кожна літера в підписі чекала б на мережу, і поле вводу
 * смикалося б назад на кожному натисканні клавіші.
 *
 * ## Чому надсилання відкладене
 *
 * Набраний підпис — це десяток змін за секунду, і команда на кожну означала б
 * десяток записів у базу та десяток записів файлу на чужому диску. Пауза
 * збирає їх в одну — рівно так само, як це робить плеєр перед записом файлу.
 *
 * ## Чому надсилається ВЕСЬ список
 *
 * Правка одного поля одного треку — це майже завжди ще й порядок: пересунули
 * трек, сховали інший. Надсилати «дельту» означало б вигадати мову опису змін і
 * підтримувати її з обох боків. Список цілий разом із номером версії відповідає
 * на те саме питання без жодної нової мови, а номер не дає двом адміністраторам
 * тихо затерти один одного.
 */

/** Скільки збирати зміни, перш ніж надсилати. Та сама пауза, що й перед файлом. */
const SEND_DELAY_MS = 500;

export class RemoteEditor implements BoardEditor {
	entries = $state<BoardTrack[]>([]);
	/** Перший знімок уже прийшов. Доти список порожній, а не «порожня дошка». */
	known = $state(false);
	/** Правка в дорозі — щоб сказати про це замість мовчання. */
	sending = $state(false);
	/** Ключ перекладу останньої невдачі. */
	trouble = $state<string | null>(null);

	/** Номер версії, яку ми бачили. Їде разом із правкою. */
	private rev = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	constructor(private readonly adminKey: string) {}

	async start(): Promise<() => void> {
		const stop = await watchTracks(this.adminKey, (tracks) => {
			if (this.stopped) return;
			this.known = true;
			if (!tracks) {
				this.entries = [];
				return;
			}
			this.rev = tracks.rev;
			/*
			 * Поки наша правка ще не пішла, вхідний знімок НЕ затирає список.
			 *
			 * Інакше кожна пауза в наборі підпису поверталася б до того, що на
			 * комп'ютері, — тобто до тексту без останніх літер.
			 */
			if (this.timer === null) this.entries = parse(tracks.json);
		});

		return () => {
			this.stopped = true;
			if (this.timer) clearTimeout(this.timer);
			stop();
		};
	}

	readonly keyLabels: Record<string, string> = $derived(
		keyLabelsFor(this.entries.filter((entry) => entry.visibility !== 'none'))
	);

	setTitle(trackId: string, title: string): void {
		const trimmed = title.trim().slice(0, 200);
		this.update(trackId, (entry) => ({
			...entry,
			title: trimmed.length > 0 ? trimmed : entry.fileName
		}));
	}

	setColor(trackId: string, slug: string | null): void {
		this.update(trackId, (entry) => ({ ...entry, color: slug }));
	}

	setHotkey(trackId: string, hotkey: string | null): void {
		// Клавіша унікальна — так само, як у плеєра: інакше дошка приїхала б туди
		// з двома треками на одній клавіші, і виграв би той, хто вище.
		this.entries = this.entries.map((entry) => {
			if (entry.id === trackId) return { ...entry, hotkey };
			if (hotkey !== null && entry.hotkey === hotkey) return { ...entry, hotkey: null };
			return entry;
		});
		this.schedule();
	}

	setVisibility(trackId: string, visibility: TrackVisibility): void {
		this.update(trackId, (entry) => ({ ...entry, visibility }));
	}

	setRepeat(trackId: string, plays: number, gapSec: number): void {
		this.update(trackId, (entry) => ({ ...entry, plays, gapSec }));
	}

	setTrigger(trackId: string, trigger: TrackTrigger | null): void {
		this.update(trackId, (entry) => ({ ...entry, trigger }));
	}

	triggerFor(trackId: string): TrackTrigger {
		return this.entries.find((entry) => entry.id === trackId)?.trigger ?? emptyTrigger();
	}

	move(trackId: string, delta: number): void {
		const at = this.entries.findIndex((entry) => entry.id === trackId);
		const to = at + delta;
		if (at < 0 || to < 0 || to >= this.entries.length) return;

		const next = [...this.entries];
		[next[at], next[to]] = [next[to], next[at]];
		this.entries = next;
		this.schedule();
	}

	/** Попросити перечитати папку. Відповідь приходить новим списком. */
	async rescan(): Promise<void> {
		await this.send('rescan');
	}

	private update(trackId: string, change: (entry: BoardTrack) => BoardTrack): void {
		this.entries = this.entries.map((entry) => (entry.id === trackId ? change(entry) : entry));
		this.schedule();
	}

	private schedule(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.send('tracks', JSON.stringify({ rev: this.rev, tracks: this.entries }));
		}, SEND_DELAY_MS);
	}

	private async send(type: AdminCommandType, value?: string): Promise<void> {
		this.sending = true;
		this.trouble = null;
		try {
			const { id } = await sendCommand<AdminCommandType>(adminPath(this.adminKey), type, value);
			const ack = await waitForAck(adminPath(this.adminKey), id);
			// Мовчання — це не успіх: плеєр міг бути закритий. Людині ці два
			// випадки кажуть різні речі, і злити їх в один означало б збрехати.
			if (!ack) this.trouble = 'remote.noAck';
			else if (!ack.ok) this.trouble = ack.error ?? 'remote.failed';
		} catch {
			this.trouble = 'remote.failed';
		} finally {
			this.sending = false;
		}
	}
}

/** Список із каналу. Зіпсоване — порожньо, а не падіння сторінки. */
function parse(json: string): BoardTrack[] {
	try {
		const parsed: unknown = JSON.parse(json);
		return Array.isArray(parsed) ? (parsed as BoardTrack[]) : [];
	} catch {
		return [];
	}
}
