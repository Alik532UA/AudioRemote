import { AudioEngine, EngineError } from '$lib/audio/engine.svelte';
import { LocalFolderSource } from '$lib/audio/localSource';
import type { SourceStatus, SourceTrack } from '$lib/audio/source';
import { hotkeyLabel, type HotkeyAction } from '$lib/hotkeys/hotkeys';
import type { ActiveBoard } from '$lib/board/session.svelte';
import {
	ensureBoard,
	publishLibrary,
	publishState,
	setHidden,
	setTrackColor,
	watchColors,
	watchHidden
} from '$lib/net/board';
import type { BoardInfo, Command, Track } from '$lib/net/boardTypes';
import { pruneAcks, watchCommands } from '$lib/net/commands';
import { countRemotes, trackPresence, watchPresence } from '$lib/net/presence';

/**
 * ПРИЙМАЧ: усе, що робить комп'ютер, який грає.
 *
 * Контролер, а не логіка в компоненті, з однієї причини: тут п'ять живих
 * підписок (команди, приховане, присутність, стан, дескриптор теки) і одна
 * вимога, яку легко порушити непомітно — кожну з них треба зняти. Підписка, яку
 * не зняли, переживає перехід на іншу сторінку, і після трьох відкриттів
 * приймач виконує кожну команду тричі.
 */
export class PlayerController {
	/** Що показувати: стан доступу до теки. */
	sourceStatus = $state<SourceStatus>('none');
	folderName = $state<string | null>(null);
	scanning = $state(false);

	/** Треки в порядку списку. Джерело правди для «наступного». */
	tracks = $state<SourceTrack[]>([]);
	hidden = $state<Record<string, boolean>>({});
	/** Колір треку: `trackId` → назва заготовки з `config/trackColors.ts`. */
	colors = $state<Record<string, string>>({});

	/** Чи належить дошка САМЕ ЦЬОМУ браузеру. */
	owned = $state(true);
	remotes = $state(0);

	/** Остання помилка відтворення — ключ перекладу й назва треку. */
	trouble = $state<{ key: string; name: string } | null>(null);

	readonly engine: AudioEngine;
	private readonly source: LocalFolderSource;
	private readonly cleanups: (() => void)[] = [];
	private publishing = false;

	constructor(private readonly board: ActiveBoard) {
		this.source = new LocalFolderSource(board.key);
		this.engine = new AudioEngine(this.source);
	}

	get supported(): boolean {
		return this.source.supported;
	}

	/** Підняти все. Повертає функцію, яка знімає все назад. */
	async start(): Promise<() => void> {
		const info: BoardInfo = await ensureBoard(this.board.key, this.board.name);
		const { uid } = await import('$lib/net/firebase').then((module) => module.connect());
		this.owned = info.ownerUid === uid;

		this.sourceStatus = await this.source.status();
		this.folderName = this.source.label;
		if (this.sourceStatus === 'ready') await this.rescan();

		this.cleanups.push(await trackPresence(this.board.key, 'player'));
		this.cleanups.push(
			await watchPresence(this.board.key, (present) => (this.remotes = countRemotes(present)))
		);
		this.cleanups.push(await watchHidden(this.board.key, (map) => (this.hidden = map)));
		this.cleanups.push(await watchColors(this.board.key, (map) => (this.colors = map)));
		this.cleanups.push(await watchCommands(this.board.key, (command) => this.execute(command)));

		await pruneAcks(this.board.key);
		await this.announce();

		/*
		 * Стан оголошується на КОЖНУ зміну, яку видно ззовні. `$effect.root`
		 * потрібен тому, що контролер живе поза компонентом: без нього ефект не
		 * має власника й не знявся б разом зі сторінкою.
		 */
		const stopEffect = $effect.root(() => {
			$effect(() => {
				// Читання полів тут і є підпискою на них.
				void this.engine.playing;
				void this.engine.trackId;
				void this.engine.armed;
				void this.engine.volume;
				void this.announce();
			});
		});
		this.cleanups.push(stopEffect);

		return () => this.stop();
	}

	stop(): void {
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.engine.destroy();
	}

	/** Обрати теку. Лише з жесту — інакше браузер не відкриє діалог. */
	async pickFolder(): Promise<void> {
		if (!(await this.source.pick())) return;
		this.folderName = this.source.label;
		this.sourceStatus = await this.source.status();
		await this.rescan();
	}

	/** Підтвердити дозвіл на запам'ятовану теку. Теж лише з жесту. */
	async restoreFolder(): Promise<void> {
		if (!(await this.source.restore())) return;
		this.folderName = this.source.label;
		this.sourceStatus = await this.source.status();
		await this.rescan();
	}

	async rescan(): Promise<void> {
		this.scanning = true;
		try {
			this.tracks = await this.source.scan();
			this.engine.setOrder(this.tracks);

			const forCloud: Record<string, Track> = {};
			for (const track of this.tracks) {
				forCloud[track.id] = { title: track.title, path: track.path, durationMs: 0 };
			}
			if (this.owned) await publishLibrary(this.board.key, forCloud);
		} finally {
			this.scanning = false;
		}
	}

	async toggleHidden(trackId: string): Promise<void> {
		await setHidden(this.board.key, trackId, !this.hidden[trackId]);
	}

	/** Пофарбувати трек. `null` — зняти колір. */
	async setColor(trackId: string, slug: string | null): Promise<void> {
		await setTrackColor(this.board.key, trackId, slug);
	}

	/**
	 * Треки з номерами гарячих клавіш.
	 *
	 * Номери дістаються ЛИШЕ показаним, і в тому ж порядку, у якому їх бачить
	 * пульт. Інакше «двійка» означала б на двох екранах різні треки: тут
	 * приховані видно (перекресленими), а там їх немає взагалі.
	 */
	get numbered(): {
		track: SourceTrack;
		hidden: boolean;
		color: string | null;
		hotkey: string | null;
	}[] {
		let shown = 0;
		return this.tracks.map((track) => {
			const isHidden = this.hidden[track.id] === true;
			return {
				track,
				hidden: isHidden,
				color: this.colors[track.id] ?? null,
				hotkey: isHidden ? null : hotkeyLabel(shown++)
			};
		});
	}

	/** Показані треки в порядку списку — те, на що дивляться гарячі клавіші. */
	get visibleTracks(): SourceTrack[] {
		return this.tracks.filter((track) => this.hidden[track.id] !== true);
	}

	/**
	 * Запустити трек ТУТ, із цього ж пристрою.
	 *
	 * Через базу це не йде, і не з міркувань швидкості: команда від себе самого
	 * мусила б пройти запис, підписку й квитанцію, щоб повернутися в той самий
	 * процес. Дорога туди — це ще й спосіб не програти нічого, якщо мережа впала,
	 * хоч файл лежить на цьому ж диску.
	 *
	 * ОЗБРОЮЄ ЗАОДНО. Натискання на трек — це жест людини, тобто рівно те, чого
	 * браузер чекає для дозволу грати. Вимагати перед ним ще й окремого
	 * натискання «увімкнути звук» означало б два кліки там, де вистачає одного.
	 */
	async playLocal(trackId: string): Promise<void> {
		if (this.hidden[trackId]) return;

		try {
			if (!this.engine.armed && !(await this.engine.arm())) {
				this.trouble = { key: 'error.playback', name: '' };
				return;
			}
			await this.engine.play(trackId);
			this.trouble = null;
		} catch (error) {
			if (error instanceof EngineError) {
				this.trouble = {
					key: error.kind === 'missing' ? 'error.fileGone' : 'error.playback',
					name: error.trackTitle
				};
			} else {
				this.trouble = { key: 'error.unknown', name: '' };
			}
		} finally {
			await this.announce();
		}
	}

	/** Гаряча клавіша на боці приймача — робить усе напряму, без бази. */
	async handleHotkey(action: HotkeyAction): Promise<void> {
		switch (action.kind) {
			case 'play': {
				const track = this.visibleTracks[action.index];
				if (track) await this.playLocal(track.id);
				break;
			}
			case 'stop':
				this.engine.stop();
				await this.announce();
				break;
			case 'volume':
				this.engine.adjustVolume(action.delta);
				await this.announce();
				break;
			case 'mute':
				this.engine.toggleMute();
				await this.announce();
				break;
		}
	}

	/** Озброїти звук. Лише з жесту. */
	async arm(): Promise<boolean> {
		const armed = await this.engine.arm();
		if (armed) await this.announce();
		return armed;
	}

	/**
	 * Виконати команду з пульта. Повертає ключ перекладу помилки або `null`.
	 *
	 * Прихований трек НЕ грається навіть за прямою командою: пульт його не
	 * бачить, але команда могла приїхати від пульта зі старим списком, або
	 * взагалі не від нашого інтерфейсу. Рішення людини «не показувати цей трек»
	 * мусить діяти й у цьому випадку.
	 */
	private async execute(command: Command): Promise<string | null> {
		try {
			switch (command.type) {
				case 'play': {
					const id = String(command.value ?? '');
					if (this.hidden[id]) return 'error.fileGone';
					await this.engine.play(id);
					break;
				}
				case 'pause':
					this.engine.pause();
					break;
				case 'resume':
					await this.engine.resume();
					break;
				case 'stop':
					this.engine.stop();
					break;
				case 'next': {
					const next = this.engine.nextTrackId();
					if (next) await this.engine.play(next);
					break;
				}
				case 'volume':
					this.engine.setVolume(Number(command.value ?? 0) / 100);
					break;
			}

			this.trouble = null;
			await this.announce();
			return null;
		} catch (error) {
			if (error instanceof EngineError) {
				const key = error.kind === 'missing' ? 'error.fileGone' : 'error.playback';
				this.trouble = { key, name: error.trackTitle };
				await this.announce();
				return key;
			}
			this.trouble = { key: 'error.unknown', name: '' };
			return 'error.unknown';
		}
	}

	/**
	 * Розповісти пульту, що зараз відбувається.
	 *
	 * Записи не накладаються: поки один іде, наступний пропускається. Без цього
	 * подія `timeupdate` (чотири рази на секунду) перетворилася б на чотири
	 * записи в базу щосекунди на кожен трек, що грає.
	 */
	private async announce(): Promise<void> {
		if (!this.owned || this.publishing) return;
		this.publishing = true;
		try {
			await publishState(this.board.key, {
				trackId: this.engine.trackId,
				playing: this.engine.playing,
				positionMs: this.engine.positionMs,
				volume: this.engine.volume,
				armed: this.engine.armed
			});
		} catch {
			// Мережа впала — стан оголосимо наступною зміною. Ламати відтворення
			// через невдалий запис довідки було б гірше за застарілу довідку.
		} finally {
			this.publishing = false;
		}
	}
}
