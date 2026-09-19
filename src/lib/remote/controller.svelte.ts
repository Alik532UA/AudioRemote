import type { ActiveBoard } from '$lib/board/session.svelte';
import { watchColors, watchHidden, watchInfo, watchLibrary, watchState } from '$lib/net/board';
import type { BoardInfo, CommandType, Library, PlayerState, Track } from '$lib/net/boardTypes';
import { sendCommand, waitForAck } from '$lib/net/commands';
import { hasPlayer, trackPresence, watchPresence } from '$lib/net/presence';
import { hotkeyLabel, type HotkeyAction } from '$lib/hotkeys/hotkeys';

export interface VisibleTrack extends Track {
	id: string;
	/** Підпис гарячої клавіші, або `null` — далі девʼятого треку їх немає. */
	hotkey: string | null;
	/** Назва заготовки кольору, або `null`. */
	color: string | null;
}

/**
 * ПУЛЬТ: усе, що робить телефон.
 *
 * Пульт нічого не вирішує сам. Він показує те, що оголосив приймач, і надсилає
 * натискання. Головне, що він мусить робити чесно, — РОЗРІЗНЯТИ ТРИ СТАНИ, які
 * легко злити в один «не працює»:
 *
 *  1. комп'ютер офлайн — вкладку закрили;
 *  2. комп'ютер онлайн, але звук не ввімкнено — ніхто не натиснув кнопку;
 *  3. команда пішла й не отримала квитанції.
 *
 * Людині в залі це три різні дії: піти й відкрити вкладку, попросити натиснути
 * кнопку, натиснути ще раз.
 */
export class RemoteController {
	info = $state<BoardInfo | null>(null);
	library = $state<Library | null>(null);
	hidden = $state<Record<string, boolean>>({});
	colors = $state<Record<string, string>>({});
	state = $state<PlayerState | null>(null);
	playerOnline = $state(false);

	/** Команда в дорозі — щоб кнопки не приймали друге натискання наосліп. */
	sending = $state(false);
	/** Ключ перекладу останньої невдачі. */
	trouble = $state<string | null>(null);

	private readonly cleanups: (() => void)[] = [];
	/** Сторінку вже покинули — див. той самий коментар у контролері приймача. */
	private stopped = false;

	constructor(private readonly board: ActiveBoard) {}

	/**
	 * Видимі треки — без прихованих, у порядку бібліотеки.
	 *
	 * `$derived`, а не геттер: інакше список перебудовувався б на кожне читання,
	 * тобто на кожне оновлення стану з приймача. Для сотні треків це сотня нових
	 * обʼєктів щоразу — і повне звіряння списку замість жодного.
	 *
	 * Порядок бере `Object.entries`, а не сортування тут: приймач уже впорядкував
	 * список за назвою, коли викладав його. Друге сортування на пульті могло б
	 * дати ІНШИЙ порядок (інша локаль у телефоні), і «наступний трек» означав би
	 * на двох екранах різне.
	 */
	readonly tracks: VisibleTrack[] = $derived.by(() => {
		if (!this.library?.tracks) return [];
		return Object.entries(this.library.tracks)
			.filter(([id]) => !this.hidden[id])
			.map(([id, track], index) => ({
				id,
				...track,
				hotkey: hotkeyLabel(index),
				color: this.colors[id] ?? null
			}));
	});

	get currentTitle(): string | null {
		const id = this.state?.trackId;
		if (!id) return null;
		return this.library?.tracks?.[id]?.title ?? null;
	}

	/** Записати прибирання — або виконати одразу, якщо сторінку вже покинули. */
	private track(cleanup: () => void): void {
		if (this.stopped) cleanup();
		else this.cleanups.push(cleanup);
	}

	async start(): Promise<() => void> {
		this.track(await trackPresence(this.board.key, 'remote'));
		this.track(await watchInfo(this.board.key, (info) => (this.info = info)));
		this.track(await watchLibrary(this.board.key, (library) => (this.library = library)));
		this.track(await watchHidden(this.board.key, (hidden) => (this.hidden = hidden)));
		this.track(await watchColors(this.board.key, (colors) => (this.colors = colors)));
		this.track(await watchState(this.board.key, (state) => (this.state = state)));
		this.track(
			await watchPresence(this.board.key, (present) => (this.playerOnline = hasPlayer(present)))
		);

		return () => this.stop();
	}

	stop(): void {
		this.stopped = true;
		for (const cleanup of this.cleanups.splice(0)) cleanup();
	}

	/**
	 * Надіслати команду й дочекатися квитанції.
	 *
	 * Чекає навмисно: без цього пульт показував би «зроблено» й тоді, коли
	 * вкладку приймача закрили хвилину тому. Тайм-аут — теж відповідь, і вона
	 * інша, ніж «не вдалося програти».
	 */
	async send(type: CommandType, value?: string | number): Promise<void> {
		if (this.sending) return;
		this.sending = true;
		this.trouble = null;

		try {
			const { id } = await sendCommand(this.board.key, type, value);
			const ack = await waitForAck(this.board.key, id);

			if (ack === null) this.trouble = 'remote.noAck';
			else if (!ack.ok) this.trouble = ack.error ?? 'error.unknown';
		} catch {
			this.trouble = 'error.network';
		} finally {
			this.sending = false;
		}
	}

	/**
	 * Гучність — БЕЗ очікування квитанції й без черги.
	 *
	 * Протягування повзунка дає десятки значень за секунду. Чекати на квитанцію
	 * після кожного означало б повзунок, який смикається й відстає; писати кожне
	 * — десятки записів у базу на один рух пальця. Тому сюди йде лише останнє
	 * значення, і відповідь не чекається: справжня гучність усе одно приїде
	 * назад у `state`.
	 */
	private volumeTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Гучність до тиші — памʼять САМОГО ПУЛЬТА.
	 *
	 * Приймач має свою; ця потрібна тому, що пульт мусить намалювати кнопку
	 * натиснутою одразу, не чекаючи, поки стан приїде назад. Розходження тут
	 * нешкідливе: «повернути звук» шле число, а число приймач приймає завжди.
	 */
	private mutedFrom: number | null = null;

	get muted(): boolean {
		return this.mutedFrom !== null;
	}

	/** Поточна гучність у відсотках, як її оголосив приймач. */
	get volumePercent(): number {
		return Math.round((this.state?.volume ?? 0) * 100);
	}

	/** Змінити гучність на стільки відсотків. */
	adjustVolume(delta: number): void {
		const next = Math.max(0, Math.min(100, this.volumePercent + delta));
		if (next > 0) this.mutedFrom = null;
		this.setVolume(next);
	}

	/**
	 * Тиша на пульті — це гучність нуль плюс памʼять, а не окрема команда.
	 *
	 * Окрема команда означала б новий тип у правилах бази й новий стан, який
	 * приймач мусив би оголошувати. Нуль робить те саме тими словами, які в
	 * протоколі вже є, — і на екрані приймача це видно так само чесно.
	 */
	toggleMute(): void {
		if (this.mutedFrom !== null) {
			const restore = this.mutedFrom;
			this.mutedFrom = null;
			this.setVolume(restore);
			return;
		}

		const current = this.volumePercent;
		if (current === 0) return;
		this.mutedFrom = current;
		this.setVolume(0);
	}

	/** Гаряча клавіша на боці пульта — усе через ті самі команди. */
	async handleHotkey(action: HotkeyAction): Promise<void> {
		switch (action.kind) {
			case 'play': {
				const track = this.tracks[action.index];
				if (track) await this.send('play', track.id);
				break;
			}
			case 'stop':
				await this.send('stop');
				break;
			case 'volume':
				this.adjustVolume(action.delta);
				break;
			case 'mute':
				this.toggleMute();
				break;
		}
	}

	setVolume(percent: number): void {
		if (this.volumeTimer) clearTimeout(this.volumeTimer);
		this.volumeTimer = setTimeout(() => {
			void sendCommand(this.board.key, 'volume', Math.round(percent)).catch(() => {
				this.trouble = 'error.network';
			});
		}, 150);
	}
}
