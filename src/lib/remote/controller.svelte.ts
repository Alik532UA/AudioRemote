import type { ActiveBoard } from '$lib/board/session.svelte';
import { watchInfo, watchLibrary, watchState } from '$lib/net/board';
import type { BoardInfo, CommandType, Library, PlayerState, Track } from '$lib/net/boardTypes';
import { sendCommand, serverNow, waitForAck } from '$lib/net/commands';
import { hasPlayer, trackPresence, watchPresence } from '$lib/net/presence';
import {
	builtinFor,
	isHotkeyEvent,
	keyLabelsFor,
	trackForDigit,
	type HotkeyAction
} from '$lib/hotkeys/hotkeys';

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
	state = $state<PlayerState | null>(null);
	playerOnline = $state(false);

	/**
	 * ЧИ БАЗА ВЖЕ ВІДПОВІЛА — окремо від того, що вона відповіла.
	 *
	 * `playerOnline` дорівнює `false` і тоді, коли приймач працює, а перший
	 * знімок присутності ще в дорозі; `library` так само порожня, доки не
	 * приїхала. Доти пульт устигав показати «вкладку на комп'ютері закрито» й
	 * «ще не обрано папку» — дві страшні фрази про те, чого він просто ще не
	 * знає. За мить усе відкривалося правильно, і людина лишалася з відчуттям,
	 * що застосунок ледь не зламався.
	 *
	 * Та сама пара, що й `armKnown` у рушії: висновок робиться лише тоді, коли
	 * є з чого.
	 */
	presenceKnown = $state(false);
	libraryKnown = $state(false);

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
		/*
		 * Сортування за `order`, а не порядок, у якому прийшла мапа.
		 *
		 * `tracks` у RTDB — мапа, а її діти приходять упорядкованими за КЛЮЧЕМ, і
		 * ключ тут — хеш шляху. Тобто доти пульт малював треки в порядку, який не
		 * означав нічого, і «двійка» на двох екранах вказувала на різні треки.
		 * Приховані сюди не приходять узагалі: приймач їх не оголошує.
		 */
		return Object.entries(this.library.tracks)
			.map(([id, track]) => ({ id, ...track }))
			.sort((left, right) => left.order - right.order);
	});

	/**
	 * Яка клавіша діє для кожного треку — ПОРАХОВАНА НА ПРИЙМАЧІ.
	 *
	 * Свій рахунок тут був правильним рівно доти, доки списки збігалися. Тепер
	 * трек «лише приймач» у списку приймача є, а сюди не приїжджає — і цифри
	 * після нього зсунулися б. Тому підпис приїжджає разом із треком, а пульт
	 * лише показує його: на обох екранах під цифрою той самий трек, а цифри
	 * прихованих просто відсутні.
	 *
	 * Запасний шлях — власний рахунок: дошку могла оголосити вкладка приймача
	 * зі старішої збірки, і тоді підписів у ній ще немає.
	 */
	readonly keyLabels: Record<string, string> = $derived.by(() => {
		const published: Record<string, string> = {};
		for (const track of this.tracks) if (track.key) published[track.id] = track.key;
		return Object.keys(published).length > 0 ? published : keyLabelsFor(this.tracks);
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
		this.track(
			await watchLibrary(this.board.key, (library) => {
				this.library = library;
				this.libraryKnown = true;
			})
		);
		this.track(await watchState(this.board.key, (state) => (this.state = state)));
		this.track(
			await watchPresence(this.board.key, (present) => {
				this.playerOnline = hasPlayer(present);
				this.presenceKnown = true;
			})
		);

		/*
		 * Раз на чверть секунди — рівно щоб смужка йшла плавно на око. Це
		 * ЛОКАЛЬНИЙ такт, мережею нічого не йде; будити його, коли нічого не
		 * грає, теж нема сенсу.
		 */
		const clock = setInterval(() => {
			if (this.state?.playing) this.tick += 1;
		}, 250);
		this.track(() => clearInterval(clock));

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

	/**
	 * ЛОКАЛЬНИЙ ГОДИННИК — щоб смужка йшла між оголошеннями.
	 *
	 * Приймач шле стан лише на ЗМІНУ: почав, спинив, перемотав. Між ними
	 * позиція обчислювалася правильно — «оголошена плюс час відтоді», — але
	 * ніхто не просив її перерахувати, і смужка просто стояла. Тікати
	 * мережею чотири рази на секунду заради цього не треба: годинник на
	 * телефоні йде той самий.
	 */
	private tick = $state(0);

	/** Позиція, яку зараз показувати: оголошена плюс час, що минув відтоді. */
	get positionMs(): number {
		const state = this.state;
		if (!state) return 0;
		if (!state.playing) return state.positionMs;
		// Читання — і є підписка: без нього перерахунку ніхто не замовить.
		void this.tick;
		return state.positionMs + Math.max(0, serverNow() - state.atServer);
	}

	/**
	 * Тривалість поточного треку. Зі СТАНУ, а не з бібліотеки.
	 *
	 * У бібліотеці вона нульова й такою лишиться: щоб її туди покласти,
	 * приймач мусив би розкодувати кожен файл у теці. Смужка без тривалості —
	 * це смужка, по якій нема куди тягти.
	 */
	get durationMs(): number {
		const announced = this.state?.durationMs ?? 0;
		if (announced > 0) return announced;
		const id = this.state?.trackId;
		return id ? (this.library?.tracks?.[id]?.durationMs ?? 0) : 0;
	}

	/** Перемотати на абсолютну позицію. */
	async seek(positionMs: number): Promise<void> {
		await this.send('seek', Math.max(0, Math.round(positionMs)));
	}

	/** Перемотати на стільки мілісекунд від поточної позиції. */
	async seekBy(deltaMs: number): Promise<void> {
		await this.seek(this.positionMs + deltaMs);
	}

	/** Що робити на це натискання. Синхронна — див. пояснення в приймачі. */
	resolveKey(event: KeyboardEvent): HotkeyAction | { kind: 'track'; id: string } | null {
		if (!isHotkeyEvent(event)) return null;
		const assigned = this.tracks.find((entry) => entry.hotkey === event.code);
		if (assigned) return { kind: 'track', id: assigned.id };
		return builtinFor(event);
	}

	async run(action: HotkeyAction | { kind: 'track'; id: string }): Promise<void> {
		if (action.kind === 'track') {
			await this.send('play', action.id);
			return;
		}
		await this.handleHotkey(action);
	}

	/** Гаряча клавіша на боці пульта — усе через ті самі команди. */
	async handleHotkey(action: HotkeyAction): Promise<void> {
		switch (action.kind) {
			case 'play': {
				/*
				 * Цифру шукаємо за ПІДПИСОМ, а не за місцем у масиві. Місце більше
				 * не означає цифру: трек «лише приймач» займає свою на приймачі й
				 * сюди не приходить, тож у списку пульта цифри йдуть із пропусками.
				 * Пропущена цифра не робить нічого — і це правильно: пульт не мусить
				 * запускати те, чого йому не показали.
				 */
				const id = trackForDigit(this.tracks, this.keyLabels, action.index);
				if (id) await this.send('play', id);
				break;
			}
			case 'playPause':
				await this.send(this.state?.playing ? 'pause' : 'resume');
				break;
			case 'stop':
				await this.send('stop');
				break;
			case 'volume':
				this.adjustVolume(action.delta);
				break;
			case 'seek':
				await this.seekBy(action.deltaMs);
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
