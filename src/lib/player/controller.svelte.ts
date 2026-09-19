import { untrack } from 'svelte';
import { AudioEngine, EngineError } from '$lib/audio/engine.svelte';
import { LocalFolderSource } from '$lib/audio/localSource';
import type { AudioSource, SourceStatus } from '$lib/audio/source';
import { emptyConfig, type BoardConfig } from '$lib/audio/boardConfig';
import type { ActiveBoard } from '$lib/board/session.svelte';
import { ensureBoard, publishLibrary, publishState } from '$lib/net/board';
import type { BoardInfo, Command, Track } from '$lib/net/boardTypes';
import { pruneAcks, watchCommands } from '$lib/net/commands';
import { countRemotes, trackPresence, watchPresence } from '$lib/net/presence';
import { HOTKEY_SLOTS, type HotkeyAction } from '$lib/hotkeys/hotkeys';
import { mark } from '$lib/services/breadcrumbs';

/** Трек так, як його бачить дошка: файл плюс рішення людини про нього. */
export interface BoardTrack {
	id: string;
	title: string;
	path: string;
	color: string | null;
	/** Гаряча клавіша 1…9, або `null`. */
	hotkey: number | null;
	hidden: boolean;
}

/** Скільки чекати, перш ніж писати налаштування в теку. */
const SAVE_DELAY_MS = 500;

/**
 * ПРИЙМАЧ: усе, що робить комп'ютер, який грає.
 *
 * ## Хто тут джерело правди
 *
 * Про файли в теці — сканування. Про рішення щодо них (порядок, колір, клавіша,
 * приховане) — `audioremote.json` у ТІЙ САМІЙ теці. База отримує вже готову
 * суміш: пульт не вирішує нічого й лише показує те, що приймач оголосив.
 *
 * Це відповідь на два питання одразу. «Чому налаштування не переживають
 * перевідкривання» — бо жили в базі, прив'язані до дошки, а не до теки. «Чому
 * пульт показує інший порядок» — бо `tracks` у RTDB це мапа, а мапа порядку не
 * має; тепер порядок їде числом у кожному записі.
 *
 * ## Чому контролер, а не логіка в компоненті
 *
 * Тут три живі підписки, ефект і відкладений запис — і одна вимога, яку легко
 * порушити непомітно: кожне треба зняти. Підписка, яку не зняли, переживає
 * перехід на іншу сторінку, і після трьох відкриттів приймач виконує кожну
 * команду тричі.
 */
export class PlayerController {
	/** Що показувати: стан доступу до теки. */
	sourceStatus = $state<SourceStatus>('none');
	folderName = $state<string | null>(null);
	scanning = $state(false);

	/** Треки в порядку дошки. Джерело правди для списку й для «наступного». */
	entries = $state<BoardTrack[]>([]);

	/** Чи належить дошка САМЕ ЦЬОМУ браузеру. */
	owned = $state(true);
	remotes = $state(0);

	/** `false` — теку видали лише на читання, налаштування не збережуться. */
	configWritable = $state(true);

	/** Остання помилка відтворення — ключ перекладу й назва треку. */
	trouble = $state<{ key: string; name: string } | null>(null);

	readonly engine: AudioEngine;
	private readonly source: AudioSource;
	private readonly cleanups: (() => void)[] = [];
	private publishing = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Сторінку вже покинули.
	 *
	 * `start()` асинхронний і ставить підписки одну за одною. Якщо людина вийшла
	 * раніше, ніж він доїхав до кінця, `stop()` спорожнює перелік — а решта
	 * підписок падає в НЬОГО вже після цього й не знімається ніколи.
	 */
	private stopped = false;

	constructor(
		private readonly board: ActiveBoard,
		source?: AudioSource
	) {
		// Джерело можна підставити — саме так перевіряються правила плеєра без
		// діалогу вибору теки, у який не заходить жоден автотест.
		this.source = source ?? new LocalFolderSource();
		this.engine = new AudioEngine(this.source);
	}

	get supported(): boolean {
		return this.source.supported;
	}

	/** Показані треки в порядку дошки — те, що бачить пульт і клавіші. */
	readonly visible: BoardTrack[] = $derived(this.entries.filter((entry) => !entry.hidden));

	/** Скільки треків приховано — для підпису над списком. */
	readonly hiddenCount: number = $derived(this.entries.filter((entry) => entry.hidden).length);

	/** Записати прибирання — або виконати одразу, якщо вже пізно. */
	private track(cleanup: () => void): void {
		if (this.stopped) cleanup();
		else this.cleanups.push(cleanup);
	}

	/** Підняти все. Повертає функцію, яка знімає все назад. */
	async start(): Promise<() => void> {
		mark('player:start');
		const info: BoardInfo = await ensureBoard(this.board.key, this.board.name);
		const { uid } = await import('$lib/net/firebase').then((module) => module.connect());
		this.owned = info.ownerUid === uid;

		this.sourceStatus = await this.source.status();
		this.folderName = this.source.label;
		if (this.sourceStatus === 'ready') await this.rescan();

		this.track(await trackPresence(this.board.key, 'player'));
		this.track(
			await watchPresence(this.board.key, (present) => (this.remotes = countRemotes(present)))
		);
		this.track(await watchCommands(this.board.key, (command) => this.execute(command)));

		await pruneAcks(this.board.key);
		await this.announce();

		/*
		 * Стан оголошується на КОЖНУ зміну, яку видно ззовні. `$effect.root`
		 * потрібен тому, що контролер живе поза компонентом: без нього ефект не
		 * має власника й не знявся б разом зі сторінкою.
		 */
		const stopEffect = $effect.root(() => {
			$effect(() => {
				// Читання полів тут і є підпискою на них. `positionMs` сюди НЕ
				// входить навмисно — див. `announce()`.
				void this.engine.playing;
				void this.engine.trackId;
				void this.engine.armed;
				void this.engine.volume;
				void this.announce();
			});
		});
		this.track(stopEffect);
		mark('player:ready');

		return () => this.stop();
	}

	stop(): void {
		this.stopped = true;
		if (this.saveTimer) clearTimeout(this.saveTimer);
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

	/**
	 * Перечитати теку й змішати її з налаштуваннями.
	 *
	 * Порядок бере файл; файли, яких у ньому немає (щойно докинули), стають у
	 * хвіст за абеткою. Так додавання треку не переставляє нічого з того, що
	 * людина вже розклала.
	 */
	async rescan(): Promise<void> {
		this.scanning = true;
		try {
			const scanned = await this.source.scan();
			const config = await this.source.readConfig();

			/*
			 * Звичайні обʼєкти, а не `Map`: це короткі довідники в межах одного
			 * виклику, і реактивними вони бути не мусять. Правило
			 * `prefer-svelte-reactivity` вимагає `SvelteMap` від будь-якого `Map` у
			 * файлі з рунами — тут це було б реактивне сховище заради двох пошуків.
			 */
			const settings: Record<string, (typeof config.tracks)[number] | undefined> = {};
			for (const entry of config.tracks) settings[entry.path] = entry;

			const byPath: Record<string, (typeof scanned)[number] | undefined> = {};
			for (const track of scanned) byPath[track.path] = track;

			const inConfigOrder = config.tracks
				.map((entry) => byPath[entry.path])
				.filter((track): track is NonNullable<typeof track> => track !== undefined);
			const fresh = scanned.filter((track) => settings[track.path] === undefined);

			this.entries = [...inConfigOrder, ...fresh].map((track) => {
				const setting = settings[track.path];
				return {
					id: track.id,
					title: track.title,
					path: track.path,
					color: setting?.color ?? null,
					hotkey: setting?.hotkey ?? null,
					hidden: setting?.hidden === true
				};
			});

			await this.publish();
		} finally {
			this.scanning = false;
		}
	}

	// ─── Рішення людини про треки ────────────────────────────────────────────

	setColor(trackId: string, slug: string | null): void {
		this.update(trackId, (entry) => ({ ...entry, color: slug }));
	}

	toggleHidden(trackId: string): void {
		this.update(trackId, (entry) => ({ ...entry, hidden: !entry.hidden }));
	}

	/**
	 * Призначити гарячу клавішу. `null` — зняти.
	 *
	 * Клавіша УНІКАЛЬНА: якщо вона вже стоїть на іншому треку, той її втрачає.
	 * Альтернатива — «зайнято, оберіть іншу» — змушувала б людину спершу
	 * звільняти клавішу, тобто робити два кроки замість одного.
	 */
	setHotkey(trackId: string, hotkey: number | null): void {
		if (hotkey !== null && (hotkey < 1 || hotkey > HOTKEY_SLOTS)) return;

		this.entries = this.entries.map((entry) => {
			if (entry.id === trackId) return { ...entry, hotkey };
			// Забрати ту саму клавішу в того, хто її мав.
			if (hotkey !== null && entry.hotkey === hotkey) return { ...entry, hotkey: null };
			return entry;
		});
		void this.persist();
	}

	/** Пересунути трек на одну позицію. `-1` — вище, `+1` — нижче. */
	move(trackId: string, delta: number): void {
		const from = this.entries.findIndex((entry) => entry.id === trackId);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= this.entries.length) return;

		const next = [...this.entries];
		[next[from], next[to]] = [next[to], next[from]];
		this.entries = next;
		void this.persist();
	}

	private update(trackId: string, change: (entry: BoardTrack) => BoardTrack): void {
		this.entries = this.entries.map((entry) => (entry.id === trackId ? change(entry) : entry));
		void this.persist();
	}

	/**
	 * Зберегти рішення: файл у теці плюс оголошення пульту.
	 *
	 * Запис у файл ВІДКЛАДЕНИЙ: пересування треку через пів списку — це десяток
	 * перестановок, і писати файл після кожної означало б десяток записів на
	 * диск людини. Оголошення пульту йде одразу: там затримку видно.
	 */
	private async persist(): Promise<void> {
		await this.publish();
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
	}

	private async save(): Promise<void> {
		if (this.stopped) return;
		const config: BoardConfig = {
			...emptyConfig(),
			tracks: this.entries.map((entry) => ({
				path: entry.path,
				...(entry.color ? { color: entry.color } : {}),
				...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
				...(entry.hidden ? { hidden: true } : {})
			}))
		};
		this.configWritable = await this.source.writeConfig(config);
	}

	/**
	 * Оголосити бібліотеку пульту.
	 *
	 * Приховані сюди НЕ потрапляють узагалі — не «позначені прихованими», а
	 * відсутні. Рішення «не показувати» має діяти й тоді, коли пульт відкрив
	 * хтось інший, а не лише в нашому інтерфейсі.
	 */
	private async publish(): Promise<void> {
		if (!this.owned || this.stopped) return;

		const forCloud: Record<string, Track> = {};
		this.visible.forEach((entry, index) => {
			forCloud[entry.id] = {
				title: entry.title,
				path: entry.path,
				durationMs: 0,
				order: index,
				...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
				...(entry.color ? { color: entry.color } : {})
			};
		});

		this.engine.setOrder(this.visible);
		await publishLibrary(this.board.key, forCloud);
	}

	// ─── Відтворення ─────────────────────────────────────────────────────────

	/** Озброїти звук. Лише з жесту. */
	async arm(): Promise<boolean> {
		const armed = await this.engine.arm();
		if (armed) await this.announce();
		return armed;
	}

	/**
	 * Запустити трек ТУТ, із цього ж пристрою.
	 *
	 * Через базу це не йде: команда від себе самого мусила б пройти запис,
	 * підписку й квитанцію, щоб повернутися в той самий процес.
	 *
	 * ОЗБРОЮЄ ЗАОДНО. Натискання на трек — це жест людини, тобто рівно те, чого
	 * браузер чекає для дозволу грати.
	 */
	async playLocal(trackId: string): Promise<void> {
		if (this.entries.find((entry) => entry.id === trackId)?.hidden) return;

		try {
			if (!this.engine.armed && !(await this.engine.arm())) {
				this.trouble = { key: 'error.playback', name: '' };
				return;
			}
			await this.engine.play(trackId);
			this.trouble = null;
		} catch (error) {
			this.noteTrouble(error);
		} finally {
			await this.announce();
		}
	}

	/** Гаряча клавіша на боці приймача — усе напряму, без бази. */
	async handleHotkey(action: HotkeyAction): Promise<void> {
		switch (action.kind) {
			case 'play': {
				const track = this.byHotkey(action.index);
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
			case 'seek':
				this.engine.seekBy(action.deltaMs);
				await this.announce();
				break;
			case 'mute':
				this.engine.toggleMute();
				await this.announce();
				break;
		}
	}

	/**
	 * Який трек за цією цифрою.
	 *
	 * Спершу той, кому клавішу ПРИЗНАЧИЛИ: рішення людини важить більше за
	 * позицію. Якщо не призначено нікому — працює порядок списку, щоб клавіатура
	 * діяла одразу, без попереднього налаштування.
	 */
	private byHotkey(index: number): BoardTrack | undefined {
		const assigned = this.visible.find((entry) => entry.hotkey === index + 1);
		if (assigned) return assigned;
		return this.visible.some((entry) => entry.hotkey !== null) ? undefined : this.visible[index];
	}

	/**
	 * Виконати команду з пульта. Повертає ключ перекладу помилки або `null`.
	 *
	 * Прихований трек НЕ грається навіть за прямою командою: пульт його не
	 * бачить, але команда могла приїхати від пульта зі старим списком.
	 */
	private async execute(command: Command): Promise<string | null> {
		if (this.stopped) return null;
		try {
			switch (command.type) {
				case 'play': {
					const id = String(command.value ?? '');
					if (this.entries.find((entry) => entry.id === id)?.hidden) return 'error.fileGone';
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
				case 'seek':
					this.engine.seek(Number(command.value ?? 0));
					break;
			}

			this.trouble = null;
			await this.announce();
			return null;
		} catch (error) {
			const key = this.noteTrouble(error);
			await this.announce();
			return key;
		}
	}

	private noteTrouble(error: unknown): string {
		if (error instanceof EngineError) {
			const key = error.kind === 'missing' ? 'error.fileGone' : 'error.playback';
			this.trouble = { key, name: error.trackTitle };
			return key;
		}
		this.trouble = { key: 'error.unknown', name: '' };
		return 'error.unknown';
	}

	/**
	 * Розповісти пульту, що зараз відбувається.
	 *
	 * ЧИТАННЯ ПОЗА ВІДСТЕЖЕННЯМ. `announce()` кличе ефект, і все, що вона читає
	 * синхронно, стає його залежністю. Серед прочитаного був `positionMs`, а
	 * його оновлює `timeupdate` — чотири рази на секунду. Кожен такт ефекту
	 * перебудовував список; на теці в кілька сотень треків вкладка їла памʼять.
	 *
	 * Записи не накладаються: поки один іде, наступний пропускається.
	 */
	private async announce(): Promise<void> {
		if (this.stopped || !this.owned || this.publishing) return;
		this.publishing = true;
		try {
			const snapshot = untrack(() => ({
				trackId: this.engine.trackId,
				playing: this.engine.playing,
				positionMs: this.engine.positionMs,
				volume: this.engine.volume,
				armed: this.engine.armed
			}));
			await publishState(this.board.key, snapshot);
		} catch {
			// Мережа впала — стан оголосимо наступною зміною. Ламати відтворення
			// через невдалий запис довідки було б гірше за застарілу довідку.
		} finally {
			this.publishing = false;
		}
	}
}
