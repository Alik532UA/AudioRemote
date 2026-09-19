import type { ActiveBoard } from '$lib/board/session.svelte';
import { watchHidden, watchInfo, watchLibrary, watchState } from '$lib/net/board';
import type { BoardInfo, CommandType, Library, PlayerState, Track } from '$lib/net/boardTypes';
import { sendCommand, waitForAck } from '$lib/net/commands';
import { hasPlayer, trackPresence, watchPresence } from '$lib/net/presence';

export interface VisibleTrack extends Track {
	id: string;
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
	state = $state<PlayerState | null>(null);
	playerOnline = $state(false);

	/** Команда в дорозі — щоб кнопки не приймали друге натискання наосліп. */
	sending = $state(false);
	/** Ключ перекладу останньої невдачі. */
	trouble = $state<string | null>(null);

	private readonly cleanups: (() => void)[] = [];

	constructor(private readonly board: ActiveBoard) {}

	/**
	 * Видимі треки — без прихованих, у порядку бібліотеки.
	 *
	 * Порядок бере `Object.entries`, а не сортування тут: приймач уже впорядкував
	 * список за назвою, коли викладав його. Друге сортування на пульті могло б
	 * дати ІНШИЙ порядок (інша локаль у телефоні), і «наступний трек» означав би
	 * на двох екранах різне.
	 */
	get tracks(): VisibleTrack[] {
		if (!this.library?.tracks) return [];
		return Object.entries(this.library.tracks)
			.filter(([id]) => !this.hidden[id])
			.map(([id, track]) => ({ id, ...track }));
	}

	get currentTitle(): string | null {
		const id = this.state?.trackId;
		if (!id) return null;
		return this.library?.tracks?.[id]?.title ?? null;
	}

	async start(): Promise<() => void> {
		this.cleanups.push(await trackPresence(this.board.key, 'remote'));
		this.cleanups.push(await watchInfo(this.board.key, (info) => (this.info = info)));
		this.cleanups.push(await watchLibrary(this.board.key, (library) => (this.library = library)));
		this.cleanups.push(await watchHidden(this.board.key, (hidden) => (this.hidden = hidden)));
		this.cleanups.push(await watchState(this.board.key, (state) => (this.state = state)));
		this.cleanups.push(
			await watchPresence(this.board.key, (present) => (this.playerOnline = hasPlayer(present)))
		);

		return () => this.stop();
	}

	stop(): void {
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

	setVolume(percent: number): void {
		if (this.volumeTimer) clearTimeout(this.volumeTimer);
		this.volumeTimer = setTimeout(() => {
			void sendCommand(this.board.key, 'volume', Math.round(percent)).catch(() => {
				this.trouble = 'error.network';
			});
		}, 150);
	}
}
