import { untrack } from 'svelte';
import { AudioEngine, EngineError } from '$lib/audio/engine.svelte';
import { LocalFolderSource } from '$lib/audio/localSource';
import { runningInTauri, TauriFolderSource } from '$lib/audio/tauriSource';
import type { AudioSource, SourceStatus } from '$lib/audio/source';
import {
	emptyConfig,
	isVisibility,
	MAX_GAP_SEC,
	MAX_ICON,
	MAX_PLAYS,
	toTrigger,
	type BoardConfig,
	type TrackVisibility
} from '$lib/audio/boardConfig';
import { adminPath, boardPath, deriveAdminKey } from '$lib/board/boardPath';
import type { BoardEditor, BoardTrack } from '$lib/board/editor';
import type { ActiveBoard } from '$lib/board/session.svelte';
import { closeChannel, openChannel, publishTracks } from '$lib/net/admin';
import { ensureBoard, publishLibrary, publishState } from '$lib/net/board';
import type { AdminCommandType, BoardInfo, Command, Track } from '$lib/net/boardTypes';
import { pruneAcks, watchCommands } from '$lib/net/commands';
import { countRemotes, trackPresence, watchConnection, watchPresence } from '$lib/net/presence';
import {
	builtinFor,
	isAssignable,
	isHotkeyEvent,
	keyLabelsFor,
	type HotkeyAction
} from '$lib/hotkeys/hotkeys';
import { describeError } from '$lib/net/describeError';
import { mark } from '$lib/services/breadcrumbs';
import { emptyTrigger, type TrackTrigger } from '$lib/triggers/trigger';
import { triggerWatcher } from '$lib/triggers/watcher.svelte';

/** Трек так, як його бачить дошка. Форма спільна з пультом — див. `editor.ts`. */
export type { BoardTrack };

/**
 * ЩО САМЕ ДОЗВОЛЕНО ЗМІНИТИ АДМІНІСТРАТОРОВІ.
 *
 * Береться не «все, що прийшло», а перелічені поля — і кожне через ту саму
 * перевірку, крізь яку проходить файл налаштувань. Решта (шлях до файлу, імʼя,
 * сам факт існування треку) — це знання про папку, і воно лишається тим, що
 * прочитав із диска цей комп'ютер.
 *
 * Без цього підроблений запис підсунув би у файл чужий шлях, а застосунок
 * записав би його як своє рішення.
 */
function applyPatch(entry: BoardTrack, change: Partial<BoardTrack>): BoardTrack {
	const title = typeof change.title === 'string' ? change.title.trim().slice(0, 200) : '';
	const hotkey =
		typeof change.hotkey === 'string' && isAssignable(change.hotkey) ? change.hotkey : null;
	const whole = (value: unknown, max: number, least: number): number =>
		typeof value === 'number' && Number.isFinite(value)
			? Math.min(max, Math.max(least, Math.round(value)))
			: least;

	return {
		...entry,
		title: title.length > 0 ? title : entry.fileName,
		color: typeof change.color === 'string' ? change.color : null,
		icon: typeof change.icon === 'string' ? change.icon.trim().slice(0, MAX_ICON) || null : null,
		hotkey,
		visibility: isVisibility(change.visibility) ? change.visibility : 'all',
		plays: whole(change.plays, MAX_PLAYS, 1),
		gapSec: whole(change.gapSec, MAX_GAP_SEC, 0),
		trigger: toTrigger(change.trigger)
	};
}

/** Скільки чекати, перш ніж писати налаштування в теку. */
const SAVE_DELAY_MS = 500;

/** Скільки мовчати, перш ніж казати «бази не чути»: сокет піднімається не миттєво. */
const OFFLINE_GRACE_MS = 6000;

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
export class PlayerController implements BoardEditor {
	/** Що показувати: стан доступу до теки. */
	sourceStatus = $state<SourceStatus>('none');
	folderName = $state<string | null>(null);
	scanning = $state(false);

	/** Треки в порядку дошки. Джерело правди для списку й для «наступного». */
	entries = $state<BoardTrack[]>([]);

	/** Чи належить дошка САМЕ ЦЬОМУ браузеру. */
	owned = $state(true);
	/** Доки це `false`, `owned` ще нічого не означає — база не відповіла. */
	private ownershipKnown = false;
	remotes = $state(0);

	/** `false` — теку видали лише на читання, налаштування не збережуться. */
	configWritable = $state(true);

	/**
	 * БАЗА НЕ ПРИЙНЯЛА СПИСОК ТРЕКІВ. Ключ перекладу або `null`.
	 *
	 * Найдорожчий рядок у цьому файлі, і ось чому. Правило `$other: false`
	 * відкидає незнане поле разом з УСІМ записом, тож одне поле, додане в коді
	 * раніше, ніж у правилах, зупиняє бібліотеку цілком. Помилка при цьому
	 * прилітала в `void this.persist()` і зникала без сліду, а симптом вилазив за
	 * два екрани звідси: пульт писав «на плеєрі ще не обрано папку», хоч папка
	 * обрана й список на екрані. Тричі поспіль причину шукали в папці.
	 *
	 * Тепер той, у кого є що виправити, бачить це там, де він стоїть.
	 */
	libraryTrouble = $state<string | null>(null);

	/**
	 * Базу не чути. Показувати це ОБОВ'ЯЗКОВО: без бази сторінка виглядає
	 * бездоганно (SDK тримає запис у локальній черзі), а пульт не бачить нічого.
	 */
	dbOffline = $state(false);

	/** Остання помилка відтворення — ключ перекладу й назва треку. */
	trouble = $state<{ key: string; name: string } | null>(null);

	/**
	 * ЧИ ВІДКРИТИЙ КАНАЛ ДЛЯ АДМІНІСТРАТОРА.
	 *
	 * Не «чи заданий пароль»: пароль може лежати в сховищі, а канал — не
	 * відкритися, бо бази немає. Інтерфейс мусить казати правду саме про доступ,
	 * а не про намір.
	 */
	adminOn = $state(false);
	private adminKey: string | null = null;
	private adminRev = 0;
	private adminStop: (() => void) | null = null;

	readonly engine: AudioEngine;
	private readonly source: AudioSource;
	private readonly cleanups: (() => void)[] = [];
	private publishing = false;
	/** Стан змінився, поки йшов запис. Оголосимо, щойно звільниться. */
	private pendingAnnounce = false;
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
		/*
		 * Джерело можна підставити — саме так перевіряються правила плеєра без
		 * діалогу вибору папки, у який не заходить жоден автотест.
		 *
		 * Типове вибирається за середовищем, і різниця не косметична: у
		 * застосунку на комп'ютері папка ЗАПАМ'ЯТОВУЄТЬСЯ (там це звичайний
		 * шлях), а в браузері її доводиться обирати щоразу — дескриптор не
		 * переживає перезавантаження. Плеєр цієї різниці не бачить.
		 */
		this.source = source ?? (runningInTauri() ? new TauriFolderSource() : new LocalFolderSource());
		this.engine = new AudioEngine(this.source);
	}

	get supported(): boolean {
		return this.source.supported;
	}

	/**
	 * Список ПРИЙМАЧА: усе, крім прихованого зовсім.
	 *
	 * Сюди входять і треки «лише приймач»: вони мусять лишатися під своєю
	 * клавішею й у своєму рядку — ховають їх від пульта, а не від того, хто
	 * стоїть за комп'ютером.
	 */
	readonly visible: BoardTrack[] = $derived(
		this.entries.filter((entry) => entry.visibility !== 'none')
	);

	/** Список ПУЛЬТА: лише те, що видно всім. */
	readonly forRemote: BoardTrack[] = $derived(
		this.entries.filter((entry) => entry.visibility === 'all')
	);

	/** Приховані зовсім — їх видно лише в окремому розділі налаштувань дошки. */
	readonly hiddenTracks: BoardTrack[] = $derived(
		this.entries.filter((entry) => entry.visibility === 'none')
	);

	/**
	 * Яка клавіша ДІЄ для кожного показаного треку — разом із запасними цифрами.
	 *
	 * Береться не з `hotkey`, а з правила: доки нікому нічого не призначено,
	 * цифри працюють за порядком, і в списку має стояти саме та цифра, яка
	 * спрацює. Раніше там стояла крапка, і екран заперечував клавішу, яка є.
	 */
	readonly keyLabels: Record<string, string> = $derived(keyLabelsFor(this.visible));

	/** Скільки треків приховано зовсім — для підпису над списком. */
	readonly hiddenCount: number = $derived(this.hiddenTracks.length);

	/** Скільки треків лишилося тільки приймачу. */
	readonly playerOnlyCount: number = $derived(
		this.entries.filter((entry) => entry.visibility === 'player').length
	);

	/** Записати прибирання — або виконати одразу, якщо вже пізно. */
	private track(cleanup: () => void): void {
		if (this.stopped) cleanup();
		else this.cleanups.push(cleanup);
	}

	/** Підняти все. Повертає функцію, яка знімає все назад. */
	async start(): Promise<() => void> {
		mark('player:start');

		/*
		 * ПЕРШИМ ДІЛОМ — СЛУХАТИ ЗВ'ЯЗОК, і саме тому, що нижче все залежить від
		 * бази. Коли бази немає, `ensureBoard` не повертається взагалі: читання
		 * лишається в черзі SDK і чекає сокета, якого не буде. Підписка, зроблена
		 * після нього, не робиться ніколи — тобто мовчить рівно в тому випадку,
		 * заради якого існує.
		 *
		 * Затримка перед скаргою — не пом'якшення, а точність: на старті сокета
		 * ще немає жодну мить, і попередження, що спалахує на кожному відкритті,
		 * перестають читати за тиждень.
		 */
		let grace: ReturnType<typeof setTimeout> | null = null;
		this.track(
			await watchConnection((online) => {
				if (grace) clearTimeout(grace);
				if (online) {
					this.dbOffline = false;
					return;
				}
				grace = setTimeout(() => (this.dbOffline = true), OFFLINE_GRACE_MS);
			})
		);
		this.track(() => {
			if (grace) clearTimeout(grace);
		});

		/*
		 * ПАПКА ЧИТАЄТЬСЯ ДО БАЗИ, І ЦЕ НЕ ПРО ШВИДКІСТЬ.
		 *
		 * Доти першим стояло звернення до бази, і все місцеве — папка, треки,
		 * порядок — чекало на нього. Коли бази немає, воно не повертається
		 * ніколи: читання лягає в чергу SDK і чекає сокета, якого не буде. Отже
		 * рядок нижче не виконувався, `sourceStatus` лишався `none`, і сторінка
		 * пропонувала «обрати папку» — хоч папка була записана, дозвіл на неї
		 * живий, а файли на місці.
		 *
		 * Інтернету для гри не потрібно. Комп'ютер із колонками мусить грати й
		 * тоді, коли мережа впала посеред заняття; без бази втрачається рівно
		 * одне — пульт, і про це сказано вголос вище.
		 */
		this.sourceStatus = await this.source.status();
		this.folderName = this.source.label;
		if (this.sourceStatus === 'ready') await this.rescan();

		/*
		 * СПЕРШУ СПРОБУВАТИ, І ЛИШЕ ПОТІМ ПРОСИТИ — теж ДО бази.
		 *
		 * Жест потрібен не завжди: сайту, з яким людина вже працювала, браузер
		 * дозволяє звук одразу, а у вікні застосунку політика автозапуску знята
		 * зовсім. Але доки ця спроба стояла після звернення до бази, без бази
		 * вона не робилася взагалі — і застосунок просив «Увімкнути звук» там,
		 * де дозвіл уже був. Не політика браузера, а власний порядок дій.
		 *
		 * Проба беззвучна й безпечна: якщо браузер таки відмовить, `arm()`
		 * поверне `false`, і кнопка лишиться на своєму місці.
		 */
		if (!this.engine.armed) await this.engine.arm();

		/*
		 * Опитувач тригерів — теж місцевий: він ходить у ЧУЖІ API, а не в нашу
		 * базу. Трек за повітряною тривогою мусить заграти й тоді, коли дошка
		 * недосяжна, — інакше сирена мовчала б саме тоді, коли потрібна.
		 */
		triggerWatcher.onFire((trackId) => void this.playLocal(trackId));
		this.track(() => triggerWatcher.stop());

		const info: BoardInfo = await ensureBoard(this.board.key, this.board.name);
		const { uid } = await import('$lib/net/firebase').then((module) => module.connect());
		this.owned = info.ownerUid === uid;

		/*
		 * Аж тепер відомо, чия це дошка, — і аж тепер можна оголошувати. Доти
		 * `publish()` мовчки виходить: другий комп'ютер із тією самою парою не
		 * має права переписати бібліотеку господаря лише тому, що встиг
		 * прочитати свою папку раніше.
		 */
		this.ownershipKnown = true;
		await this.publish();

		this.track(await trackPresence(this.board.key, 'player'));
		this.track(
			await watchPresence(this.board.key, (present) => (this.remotes = countRemotes(present)))
		);
		this.track(await watchCommands(boardPath(this.board.key), (command) => this.execute(command)));

		/*
		 * Опитувач запускається тут, а не в рушії: він стосується ДОШКИ, а не
		 * звуку, і живе рівно стільки, скільки відкрита сторінка приймача.
		 * Спрацювання йде тим самим шляхом, що й натискання на трек, — інакше
		 * тригер обходив би і приховані треки, і оголошення пульту.
		 */
		await pruneAcks(boardPath(this.board.key));

		/*
		 * Канал адміністратора — після дошки й лише для господаря. Друга машина
		 * з тією самою парою не має права відкривати канал: налаштування пише
		 * той, у кого папка, і приймати правки має теж він.
		 */
		if (this.owned && this.board.adminPassword) {
			await this.enableAdmin(this.board.adminPassword).catch(() => undefined);
		}

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
		/*
		 * Канал лише ВІДПИСУЄТЬСЯ, а не закривається: закрити його означало б
		 * вимкнути адміністратора щоразу, коли на комп'ютері перейшли на іншу
		 * сторінку. Це рішення людини, а не побічний ефект навігації.
		 */
		this.adminStop?.();
		this.adminStop = null;
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
					path: track.path,
					fileName: track.title,
					title: setting?.title ?? track.title,
					color: setting?.color ?? null,
					icon: setting?.icon ?? null,
					hotkey: setting?.hotkey ?? null,
					visibility: setting?.visibility ?? 'all',
					plays: setting?.plays ?? 1,
					gapSec: setting?.gapSec ?? 0,
					trigger: setting?.trigger ?? null
				};
			});

			this.engine.setOrder(this.visible);
			triggerWatcher.sync(this.entries);
			await this.publish();
		} finally {
			this.scanning = false;
		}
	}

	// ─── Рішення людини про треки ────────────────────────────────────────────

	setColor(trackId: string, slug: string | null): void {
		this.update(trackId, (entry) => ({ ...entry, color: slug }));
	}

	setIcon(trackId: string, icon: string | null): void {
		const trimmed = icon?.trim().slice(0, MAX_ICON) ?? '';
		this.update(trackId, (entry) => ({ ...entry, icon: trimmed.length > 0 ? trimmed : null }));
	}

	/**
	 * Скільки разів програти й з якою паузою.
	 *
	 * Обидва значення разом, бо пауза без повторів не означає нічого, а повтори
	 * без паузи — звичайний випадок. Межі беруться з `boardConfig`: файл правлять
	 * блокнотом, і сто разів поспіль там з'явиться раніше, ніж тут.
	 */
	/**
	 * План повторів для рушія.
	 *
	 * Рушій знає лише `SourceTrack` — шлях і назву, — а рішення людини живуть
	 * тут. Тому план передається на кожен запуск: інакше рушієві довелося б
	 * тримати копію списку, яка розходилася б після кожного перечитування папки.
	 */
	private repeatOf(trackId: string): { plays: number; gapSec: number } {
		const entry = this.entries.find((track) => track.id === trackId);
		return { plays: entry?.plays ?? 1, gapSec: entry?.gapSec ?? 0 };
	}

	setRepeat(trackId: string, plays: number, gapSec: number): void {
		this.update(trackId, (entry) => ({
			...entry,
			plays: Math.max(1, Math.min(MAX_PLAYS, Math.round(plays) || 1)),
			gapSec: Math.max(0, Math.min(MAX_GAP_SEC, Math.round(gapSec) || 0))
		}));
	}

	setVisibility(trackId: string, visibility: TrackVisibility): void {
		this.update(trackId, (entry) => ({ ...entry, visibility }));
	}

	/**
	 * Призначити гарячу клавішу. `null` — зняти.
	 *
	 * Клавіша УНІКАЛЬНА: якщо вона вже стоїть на іншому треку, той її втрачає.
	 * Альтернатива — «зайнято, оберіть іншу» — змушувала б людину спершу
	 * звільняти клавішу, тобто робити два кроки замість одного.
	 */
	setTitle(trackId: string, title: string): void {
		const trimmed = title.trim().slice(0, 200);
		this.update(trackId, (entry) => ({
			...entry,
			title: trimmed.length > 0 ? trimmed : entry.fileName
		}));
	}

	/**
	 * Клавіші, зайняті керуванням, не приймаються: пробіл, відданий треку, —
	 * це плеєр без паузи.
	 */
	setHotkey(trackId: string, hotkey: string | null): void {
		if (hotkey !== null && !isAssignable(hotkey)) return;

		this.entries = this.entries.map((entry) => {
			if (entry.id === trackId) return { ...entry, hotkey };
			// Забрати ту саму клавішу в того, хто її мав.
			if (hotkey !== null && entry.hotkey === hotkey) return { ...entry, hotkey: null };
			return entry;
		});
		void this.persist();
	}

	/**
	 * Пересунути трек на одну позицію. `-1` — вище, `+1` — нижче.
	 *
	 * Сусід шукається серед ПОКАЗАНИХ, а не в повному переліку. Прихований
	 * зовсім трек лишається в переліку (він зберігає свій порядок на випадок
	 * повернення), і обмін місцями з ним виглядав би як кнопка, що не працює:
	 * натиснули — на екрані нічого не змінилося.
	 */
	move(trackId: string, delta: number): void {
		const shown = this.visible;
		const at = shown.findIndex((entry) => entry.id === trackId);
		const neighbour = shown[at + delta];
		if (at < 0 || !neighbour) return;

		const from = this.entries.findIndex((entry) => entry.id === trackId);
		const to = this.entries.findIndex((entry) => entry.id === neighbour.id);
		if (from < 0 || to < 0) return;

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
		/*
		 * Порядок для рушія — ОКРЕМО від оголошення пульту.
		 *
		 * Спершу він виставлявся всередині `publish()`, а та мовчки виходить, коли
		 * дошка не наша. Тобто локальне відтворення залежало від мережі: рушій не
		 * знав жодного треку, і на кожне натискання приходило «немає такого файлу».
		 */
		this.engine.setOrder(this.visible);
		await this.publish();
		// Адміністратор бачить те саме, що й людина за комп'ютером, — інакше його
		// наступна правка поїхала б із застарілим номером і була б відхилена.
		await this.publishAdmin();
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
	}

	private async save(): Promise<void> {
		if (this.stopped) return;
		const config: BoardConfig = {
			...emptyConfig(),
			tracks: this.entries.map((entry) => ({
				path: entry.path,
				// Підпис пишеться, лише коли він СВІЙ: інакше файл заповнювався б
				// іменами файлів, і перейменування файлу нічого б не змінило.
				...(entry.title !== entry.fileName ? { title: entry.title } : {}),
				...(entry.color ? { color: entry.color } : {}),
				...(entry.icon ? { icon: entry.icon } : {}),
				...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
				...(entry.visibility === 'all' ? {} : { visibility: entry.visibility }),
				...(entry.plays > 1 ? { plays: entry.plays } : {}),
				...(entry.gapSec > 0 ? { gapSec: entry.gapSec } : {}),
				...(entry.trigger ? { trigger: entry.trigger } : {})
			}))
		};
		this.configWritable = await this.source.writeConfig(config);
	}

	/**
	 * Оголосити бібліотеку пульту.
	 *
	 * Приховані сюди НЕ потрапляють узагалі — не «позначені прихованими», а
	 * відсутні. Рішення «не показувати» має діяти й тоді, коли пульт відкрив
	 * хтось інший, а не лише в нашому інтерфейсі. Те саме стосується треків
	 * «лише приймач»: їх немає в оголошенні, тож пульту нема чого показувати й
	 * нема чого запускати.
	 *
	 * РАЗОМ ІЗ ТРЕКОМ ЇДЕ ЙОГО КЛАВІША — та, що діє, а не призначена.
	 *
	 * Доти пульт рахував цифри сам, за своїм списком, і це збігалося, бо
	 * списки були однакові. Тепер не однакові: трек «лише приймач» займає
	 * місце в списку приймача й не їде на пульт. Пульт, рахуючи сам, зсунув би
	 * усі цифри після нього — і «трійка» на двох екранах знову вказувала б на
	 * різні треки (та сама причина, з якої колись з'явився `order`).
	 */
	private async publish(): Promise<void> {
		if (!this.ownershipKnown || !this.owned || this.stopped) return;

		const forCloud: Record<string, Track> = {};
		this.forRemote.forEach((entry, index) => {
			const key = this.keyLabels[entry.id];
			forCloud[entry.id] = {
				title: entry.title,
				path: entry.path,
				durationMs: 0,
				order: index,
				...(key ? { key } : {}),
				...(entry.hotkey ? { hotkey: entry.hotkey } : {}),
				...(entry.color ? { color: entry.color } : {}),
				...(entry.icon ? { icon: entry.icon } : {}),
				/*
				 * Пульту їде САМ ФАКТ, а не тригер: у тригері адреса чужого сервера
				 * й заголовки з ключем доступу, а бібліотеку читає кожен, хто на
				 * дошці. Без цього рядка блискавку біля треку бачив би лише той, хто
				 * стоїть за комп'ютером, — а питання «чому воно заграло саме́»
				 * виникає саме в того, хто з телефоном.
				 */
				...(entry.trigger?.on ? { auto: true } : {})
			};
		});

		try {
			await publishLibrary(this.board.key, forCloud);
			this.libraryTrouble = null;
		} catch (error) {
			/*
			 * Відмова НЕ кидається далі: оголошення — не та дія, заради якої варто
			 * валити сторінку, і плеєр мусить грати далі навіть тоді, коли пульт
			 * його не бачить. Але й мовчати про неї не можна.
			 */
			/*
			 * «Відмовлено» тут означає рівно одне, і сказати це варто прямо: код
			 * пише поле, про яке правила ще не знають. Загальне «база відмовила в
			 * доступі» відправило б шукати причину в паролі чи в мережі.
			 */
			const reason = describeError(error);
			this.libraryTrouble = reason === 'error.denied' ? 'player.libraryDenied' : reason;
			mark(`publish:denied ${String(error).slice(0, 60)}`);
		}
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
		// Прихований зовсім не запускається нічим — навіть тригером.
		if (this.entries.find((entry) => entry.id === trackId)?.visibility === 'none') return;

		try {
			if (!this.engine.armed && !(await this.engine.arm())) {
				this.trouble = { key: 'error.playback', name: '' };
				return;
			}
			await this.engine.play(trackId, this.repeatOf(trackId));
			this.trouble = null;
		} catch (error) {
			this.noteTrouble(error);
		} finally {
			await this.announce();
		}
	}

	/**
	 * Змінити запуск за API. `null` прибирає його зовсім.
	 *
	 * Опитувач перебудовується ОДРАЗУ, не чекаючи запису у файл: людина щойно
	 * ввела адресу й дивиться, чи відповість вона. Півсекунди відкладеного
	 * запису тут перетворилися б на півсекунди, за які «нічого не сталося».
	 */
	setTrigger(trackId: string, trigger: TrackTrigger | null): void {
		this.update(trackId, (entry) => ({ ...entry, trigger }));
		triggerWatcher.sync(this.entries);
	}

	/** Готовий тригер для вікна: наявний або порожній зразок. */
	triggerFor(trackId: string): TrackTrigger {
		return this.entries.find((entry) => entry.id === trackId)?.trigger ?? emptyTrigger();
	}

	// ─── Третя роль: адміністратор на пульті ─────────────────────────────────

	/**
	 * Увімкнути адміністратора: відкрити канал за другим паролем.
	 *
	 * Сам пароль лишається тут, у браузері плеєра. У базу їде лише канал за
	 * адресою, виведеною з нього, — тобто база ніколи не бачить ні пароля, ні
	 * чогось, з чого його можна відновити.
	 */
	async enableAdmin(password: string): Promise<void> {
		const key = await deriveAdminKey(this.board.key, password);
		// Старий канал зникає: інакше пульт зі вчорашнім паролем лишався б
		// адміністратором, хоч пароль уже змінили.
		await this.closeAdmin();

		this.adminKey = key;
		await openChannel(key);
		this.adminOn = true;
		await this.publishAdmin();
		this.adminStop = await watchCommands<AdminCommandType>(adminPath(key), (command) =>
			this.executeAdmin(command)
		);
	}

	/** Вимкнути адміністратора: канал зникає, пароль більше нікуди не веде. */
	async disableAdmin(): Promise<void> {
		await this.closeAdmin();
		this.adminOn = false;
	}

	private async closeAdmin(): Promise<void> {
		this.adminStop?.();
		this.adminStop = null;
		if (this.adminKey) await closeChannel(this.adminKey).catch(() => undefined);
		this.adminKey = null;
	}

	/**
	 * Викласти повні налаштування адміністратору.
	 *
	 * Номер піднімається на кожну викладку, і саме за ним плеєр упізнає застарілу
	 * правку: адміністратор надсилає той номер, який бачив, і якщо дошку тим
	 * часом уже змінили — правка відхиляється, а не затирає чужу.
	 */
	private async publishAdmin(): Promise<void> {
		if (!this.adminKey) return;
		this.adminRev += 1;
		await publishTracks(this.adminKey, {
			rev: this.adminRev,
			json: JSON.stringify(this.entries)
		}).catch(() => undefined);
	}

	/**
	 * Виконати те, що попросив адміністратор.
	 *
	 * ПРИЙМАЄТЬСЯ НЕ ВСЕ, ЩО ПРИЙШЛО. Зі списку беруться лише поля-рішення, і
	 * лише для треків, які тут справді є: шлях до файлу, імʼя й сам факт
	 * існування треку — це знання про папку, а папку бачить тільки цей
	 * комп'ютер. Інакше підроблений запис міг би підсунути чужий шлях у файл
	 * налаштувань.
	 */
	private async executeAdmin(command: Command<AdminCommandType>): Promise<string | null> {
		try {
			if (command.type === 'rescan') {
				await this.rescan();
				return null;
			}

			const sent = JSON.parse(String(command.value ?? '')) as {
				rev?: number;
				tracks?: Partial<BoardTrack>[];
			};
			if (sent.rev !== this.adminRev) return 'admin.stale';

			const wanted = Array.isArray(sent.tracks) ? sent.tracks : [];
			const rest = [...this.entries];
			const patched: BoardTrack[] = [];

			for (const change of wanted) {
				// Виймаємо зі `rest`, тож той самий трек, названий двічі, поїде в
				// список один раз — а не задвоїться.
				const at = rest.findIndex((entry) => entry.id === String(change.id));
				if (at < 0) continue;
				patched.push(applyPatch(rest.splice(at, 1)[0], change));
			}

			// Ті, про кого адміністратор не сказав нічого, лишаються — у кінці й у
			// своєму порядку. Зникнути трек може лише разом із файлом.
			this.entries = [...patched, ...rest];
			triggerWatcher.sync(this.entries);
			await this.persist();
			return null;
		} catch {
			return 'admin.badPatch';
		}
	}

	/**
	 * Перемотати тут — і одразу сказати пульту.
	 *
	 * Через контролер, а не прямо в рушій: позиція не входить у стежені поля,
	 * тож без цього виклику оголошення не буде взагалі, і смужка на телефоні
	 * рахувала б від позначки, якої вже немає.
	 */
	async seekLocal(positionMs: number): Promise<void> {
		this.engine.seek(positionMs);
		await this.announce();
	}

	/**
	 * Натискання на трек у списку.
	 *
	 * Той самий трек — пауза або продовження, інший — запуск. Доти повторне
	 * натискання починало трек СПОЧАТКУ: людина тикала в той, що вже грає,
	 * щоб його спинити, а він стрибав на нуль — і в залі це чути.
	 *
	 * `playLocal` лишається окремо: «наступний» і «попередній» мусять саме
	 * запускати, навіть якщо впіймали той самий трек на списку з одного.
	 */
	async toggleLocal(trackId: string): Promise<void> {
		if (this.engine.trackId !== trackId) {
			await this.playLocal(trackId);
			return;
		}

		if (this.engine.playing) this.engine.pause();
		else await this.engine.resume();
		await this.announce();
	}

	/**
	 * Що робити на це натискання. `null` — нічого, подію чіпати не треба.
	 *
	 * Синхронна навмисно: `preventDefault()` мусить статися ДО будь-якого
	 * `await`, інакше пробіл устигне прокрутити сторінку, а стрілка — перевести
	 * фокус.
	 *
	 * Порядок питань має значення: спершу призначена треку клавіша, потім
	 * вбудована дія. Призначити зайняту керуванням однаково не можна, тож
	 * змагатися їм нема за що.
	 */
	resolveKey(event: KeyboardEvent): HotkeyAction | { kind: 'track'; id: string } | null {
		if (!isHotkeyEvent(event)) return null;

		const assigned = this.visible.find((entry) => entry.hotkey === event.code);
		if (assigned) return { kind: 'track', id: assigned.id };

		return builtinFor(event);
	}

	/** Виконати те, що повернув `resolveKey`. */
	async run(action: HotkeyAction | { kind: 'track'; id: string }): Promise<void> {
		if (action.kind === 'track') {
			await this.playLocal(action.id);
			return;
		}
		await this.handleHotkey(action);
	}

	/** Гаряча клавіша на боці приймача — усе напряму, без бази. */
	async handleHotkey(action: HotkeyAction): Promise<void> {
		switch (action.kind) {
			case 'playPause':
				if (this.engine.playing) this.engine.pause();
				else await this.engine.resume();
				await this.announce();
				break;
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
	 * Який трек за цією цифрою — просто той, що стоїть на цьому місці.
	 *
	 * Цифри НЕ вимикаються призначеними клавішами. Спершу вимикалися, і одна
	 * дія забирала те, чого не чіпала: людина давала одному треку `Q` і
	 * лишалася без решти дев'яти.
	 *
	 * Зіткнення розводить `resolveKey`: призначену клавішу питають ПЕРШОЮ, тож
	 * явний `Digit3` перемагає третю позицію. Друга половина цієї домовленості —
	 * підписи в `keyLabelsFor`, і міняти тут, не глянувши туди, означає показати
	 * людині не ту клавішу, яка спрацює.
	 */
	private byHotkey(index: number): BoardTrack | undefined {
		return this.visible[index];
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
					/*
					 * Пульт не мусить могти запустити те, чого йому не оголошували. Він
					 * цього й не показує — але команда приходить мережею, і перевіряти
					 * її треба тут, а не покладатися на чужий інтерфейс.
					 */
					if (this.entries.find((entry) => entry.id === id)?.visibility !== 'all') {
						return 'error.fileGone';
					}
					await this.engine.play(id, this.repeatOf(id));
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
				case 'prev': {
					const prev = this.engine.prevTrackId();
					if (prev) await this.engine.play(prev, this.repeatOf(prev));
					break;
				}
				case 'next': {
					const next = this.engine.nextTrackId();
					if (next) await this.engine.play(next, this.repeatOf(next));
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
	 * Записи не накладаються, але й НЕ ГУБЛЯТЬСЯ: поки один іде, наступний
	 * чекає в черзі з одного місця. Спершу він просто пропускався — і на цьому
	 * ламалася перемотка з пульта: команда приходила посеред іншого запису,
	 * оголошення нової позиції зникало, а пульт далі рахував від СТАРОЇ
	 * позначки. Позиція не входить у стежені поля (див. вище), тож виправити
	 * себе пізніше йому було нічим.
	 */
	private async announce(): Promise<void> {
		if (this.stopped || !this.owned) return;
		if (this.publishing) {
			this.pendingAnnounce = true;
			return;
		}
		this.publishing = true;
		try {
			const snapshot = untrack(() => ({
				trackId: this.engine.trackId,
				playing: this.engine.playing,
				positionMs: this.engine.positionMs,
				durationMs: this.engine.durationMs,
				volume: this.engine.volume,
				armed: this.engine.armed
			}));
			await publishState(this.board.key, snapshot);
		} catch {
			// Мережа впала — стан оголосимо наступною зміною. Ламати відтворення
			// через невдалий запис довідки було б гірше за застарілу довідку.
		} finally {
			this.publishing = false;
			if (this.pendingAnnounce) {
				this.pendingAnnounce = false;
				await this.announce();
			}
		}
	}
}
