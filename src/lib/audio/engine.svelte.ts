import { queueSpot, queueTotal } from './queue';
import { TrackMissingError, type AudioSource, type SourceTrack } from './source';

/**
 * ВІДТВОРЕННЯ НА ЦЬОМУ ПРИСТРОЇ.
 *
 * ## Чому потрібне «озброєння» окремою кнопкою
 *
 * Браузер не дає сторінці програти звук, доки людина сама чогось не натиснула.
 * Це не налаштування й не помилка — це політика автоплею, і обійти її не можна.
 * Для звичайного сайту вона непомітна: звук і так починається з натискання. Тут
 * усе навпаки — натискає людина за сто метрів звідси, на іншому пристрої.
 *
 * Тому перше натискання мусить статися саме тут, і воно робить рівно одне:
 * «благословляє» елемент `<audio>`. Після успішного `play()` під жестом той
 * САМИЙ елемент можна запускати програмно скільки завгодно, у тому числі зі
 * зміненим джерелом. Нового жесту більше не треба.
 *
 * ## Чому тиша з Blob, а не з `data:`
 *
 * Благословити елемент можна лише справжнім `play()`, тобто потрібне якесь
 * джерело. Найкоротше — короткий тихий WAV. Він ЗБИРАЄТЬСЯ В BLOB, а не
 * вписується як `data:`-адреса: політика безпеки дозволяє `media-src 'self'
 * blob:`, і схеми `data:` в ній немає навмисно. З `data:` тут була б тиша й
 * рядок у консолі — той самий клас помилки, від якого директива й захищає.
 *
 * ## Адреси Blob звільняються
 *
 * Кожен трек — це `URL.createObjectURL(file)`. Поки адресу не звільнено,
 * браузер тримає весь файл. За зміну сотні треків це сотня утримуваних файлів,
 * і на концертній добірці по 40 МБ вкладка з'їдає пам'ять, не роблячи нічого.
 */

/**
 * Скільки триває згасання й наростання.
 *
 * Секунда: достатньо, щоб перехід читався як рішення, і мало, щоб «стоп»
 * лишався стопом. Число тут одне на всі переходи навмисно — різна тривалість
 * для паузи й стопа звучала б як несправність.
 */
const FADE_MS = 1000;

/**
 * Як часто рухати позицію під час паузи між повторами.
 *
 * Це та сама частота, з якою браузер сам шле `timeupdate` під час звучання, —
 * приблизно чотири рази на секунду. Частіше немає сенсу: смуга однаково
 * перемальовується не швидше за кадр, а рідше — і рух стає ступінчастим.
 */
const GAP_TICK_MS = 250;

/**
 * Стеля тривалості, яку приймає база (`state.durationMs`).
 *
 * Дев'яносто дев'ять повторів години дають сто годин, а правило відкидає стан із
 * більшою тривалістю — і відкидає ВЕСЬ стан, не саме поле. Тобто без цієї межі
 * дошка з довгим треком і великою кількістю повторів осліпила б пульт цілком.
 */
const DAY_MS = 86_400_000;

export type EngineErrorKind = 'missing' | 'playback' | 'not-armed';

export class EngineError extends Error {
	constructor(
		readonly kind: EngineErrorKind,
		readonly trackTitle: string
	) {
		super(`${kind}: ${trackTitle}`);
		this.name = 'EngineError';
	}
}

/** Короткий тихий WAV — рівно для того, щоб `play()` мав що програти. */
function silentWav(): Blob {
	const samples = 128;
	const buffer = new ArrayBuffer(44 + samples * 2);
	const view = new DataView(buffer);
	const ascii = (at: number, text: string) => {
		for (let index = 0; index < text.length; index++)
			view.setUint8(at + index, text.charCodeAt(index));
	};

	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples * 2, true);
	ascii(8, 'WAVEfmt ');
	view.setUint32(16, 16, true); // довжина блоку fmt
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // моно
	view.setUint32(24, 8000, true); // частота
	view.setUint32(28, 16000, true); // байтів за секунду
	view.setUint16(32, 2, true); // вирівнювання
	view.setUint16(34, 16, true); // біт на зразок
	ascii(36, 'data');
	view.setUint32(40, samples * 2, true);
	// Самі зразки лишаються нулями — це і є тиша.

	return new Blob([buffer], { type: 'audio/wav' });
}

export class AudioEngine {
	/** Чи натиснули «Увімкнути звук». Доти жодна команда не грає. */
	armed = $state(false);
	/**
	 * Чи ВІДОМО вже, дозволено звук чи ні.
	 *
	 * Доки відповіді немає, `armed` дорівнює `false` — і сторінка показувала
	 * вікно «Увімкнути звук» на ті частки секунди, поки триває беззвучна проба.
	 * У застосунку, де дозвіл є завжди, воно встигало блимнути й зникнути:
	 * людина бачила прохання, на яке не встигала відповісти.
	 *
	 * Тобто питання не «веб чи застосунок», а «ми вже питали браузер чи ще ні».
	 * Так воно й записане, і працює однаково скрізь.
	 */
	armKnown = $state(false);
	playing = $state(false);
	trackId = $state<string | null>(null);
	/*
	 * 0.7, а не 0.8: у залі з колонками гучніше майже ніколи не треба, а
	 * перший запуск на 80% лякає.
	 */
	volume = $state(0.7);
	/** Позиція в поточному треку, мс. Оновлюється подією `timeupdate`. */
	positionMs = $state(0);
	durationMs = $state(0);

	/**
	 * ПОВТОРИ ЦЬОГО САМОГО ТРЕКУ.
	 *
	 * `left` — скільки відтворень ще лишилося після поточного, `gapMs` — пауза
	 * між ними. Живе в рушії, а не в контролері, бо рушій єдиний, хто знає, коли
	 * трек ЗАКІНЧИВСЯ: подія `ended` приходить сюди.
	 *
	 * Скидається будь-яким новим наміром людини — інший трек, «стоп». Інакше
	 * сирена, увімкнена на три рази, доганяла б того, хто її вимкнув.
	 */
	private plays = 1;
	private gapMs = 0;
	/** Скільки відтворень уже позаду. Під час першого — нуль. */
	private done = 0;
	/** Тривалість самого файлу. Публічна `durationMs` — це ВСЯ черга. */
	private clipMs = 0;
	private gapTimer: ReturnType<typeof setTimeout> | null = null;
	/** Рух позиції під час паузи між повторами. */
	private gapTick: ReturnType<typeof setInterval> | null = null;

	/** Чи лишилися ще відтворення після поточного. */
	private get more(): boolean {
		return this.done < this.plays - 1;
	}

	/**
	 * ОДИНИЦЯ ЧЕРГИ — відтворення разом із паузою після нього.
	 *
	 * Уся арифметика таймлайна тримається на ній: позиція в черзі — це
	 * `номер × одиниця + позиція всередині`, а вся тривалість — `разів × клип
	 * плюс на одну паузу менше`.
	 */
	private get unit(): number {
		return this.clipMs + this.gapMs;
	}

	/**
	 * Перерахувати ЗАГАЛЬНУ тривалість.
	 *
	 * Смуга показує всю чергу, а не один прохід, і це не косметика: доти пульт
	 * доводив смугу до кінця на першому ж відтворенні й далі стояв, хоч трек грав
	 * ще двічі. Тепер і на плеєрі, і на пульті видно, скільки це триватиме
	 * НАСПРАВДІ.
	 *
	 * Доба — стеля: правило бази відкидає стан із більшою тривалістю, а відкинуто
	 * буде ВЕСЬ стан, не саме поле. Дев'яносто дев'ять повторів години дають сто
	 * годин, і на такій дошці пульт осліп би цілком.
	 */
	private retotal(): void {
		this.durationMs = Math.min(DAY_MS, queueTotal(this.clipMs, this.gapMs, this.plays));
	}

	private element: HTMLAudioElement | null = null;
	private objectUrl: string | null = null;
	/**
	 * НОМЕР ОСТАННЬОГО НАМІРУ. Росте на кожен запуск і на кожен «стоп».
	 *
	 * `play()` має всередині `await`: спершу читання файлу з диска, потім сам
	 * `play()` елемента. За цей час може прийти інший намір — з іншого місця,
	 * не від тієї самої людини: трек тиснуть і з плеєра, і з пульта мережею, і
	 * запускає його тригер за зовнішнім API.
	 *
	 * Без номера перемагав не останній намір, а той, чий файл відкрився
	 * ШВИДШЕ. І це не «трек не той»: `releaseUrl()` пізнього запуску відкликає
	 * адресу Blob, за якою В ЦЮ МИТЬ грає інший трек, тобто обриває звук у залі
	 * посеред відтворення.
	 *
	 * Найгірший випадок — вихід із дошки: `destroy()` знімає елемент, а запуск,
	 * що був у дорозі, тримає своє посилання на нього й починає грати вже після
	 * виходу. Зупинити його нема чим — рушія більше немає.
	 */
	private intent = 0;
	/** Порядок треків — щоб «наступний» мав від чого рахуватися. */
	private order: SourceTrack[] = [];
	/** Гучність до тиші. `null` — тиші немає. */
	private mutedFrom = $state<number | null>(null);
	/** Кадр поточного згасання. `null` — нічого не згасає. */
	private fadeFrame: number | null = null;

	constructor(private readonly source: AudioSource) {}

	/** Список у тому порядку, у якому його бачить пульт. */
	setOrder(tracks: SourceTrack[]): void {
		this.order = tracks;
	}

	/**
	 * Озброїти. КЛИКАТИ ЛИШЕ З ОБРОБНИКА НАТИСКАННЯ.
	 *
	 * Повертає `false`, якщо браузер усе одно відмовив: тоді інтерфейс мусить
	 * лишити кнопку на місці, а не вдавати, що звук увімкнено.
	 */
	async arm(): Promise<boolean> {
		const element = this.ensureElement();
		const url = URL.createObjectURL(silentWav());

		try {
			element.src = url;
			/*
			 * Проба йде на СПРАВЖНІЙ гучності, а не на нулі.
			 *
			 * Тиша тут у самому файлі, тож не чути нічого так чи так. Але нульова
			 * гучність для браузера — «беззвучне відтворення», а його дозволяють
			 * завжди. Тобто проба на нулі відповідала «так» навіть там, де чутний
			 * звук заборонено, і кнопка зникала б, лишаючи плеєр німим.
			 */
			element.muted = false;
			element.volume = this.volume;
			await element.play();
			element.pause();
			element.currentTime = 0;
			this.armed = true;
			return true;
		} catch {
			return false;
		} finally {
			// Відповідь є — байдуже яка. Саме з цієї миті сторінка має право
			// показувати або ховати прохання ввімкнути звук.
			this.armKnown = true;
			URL.revokeObjectURL(url);
			// Джерело прибирається: лишений тихий WAV показувався б як «грає тишу».
			element.removeAttribute('src');
			element.load();

			/*
			 * Стан вирівнюється РУКАМИ — єдине місце, де не з подій.
			 *
			 * `load()` за специфікацією викидає з черги ще не доставлені події
			 * цього елемента, а там лежала `pause` від проби. Виходило, що `play`
			 * уже порахували, а `pause` не доїхала: плеєр вважав, що грає, і над
			 * написом «Нічого не грає» світилася зелена «Пауза».
			 */
			this.playing = false;
			this.positionMs = 0;
			this.clipMs = 0;
			this.retotal();
		}
	}

	/**
	 * ПЛАВНЕ ЗГАСАННЯ Й НАРОСТАННЯ — секунда.
	 *
	 * Різкий обрив звуку в залі чути як аварію: люди озираються на колонки. Те
	 * саме з різким початком. Секунда — це достатньо, щоб перехід читався як
	 * рішення, і мало, щоб «стоп» лишався стопом.
	 *
	 * Гучність міняється на САМОМУ елементі, а не в `this.volume`: остання —
	 * те, що людина виставила, і згасання не має права її переписати. Інакше
	 * після паузи повзунок опинявся б на нулі.
	 */
	private fadeTo(target: number, done?: () => void): void {
		this.cancelFade();
		const element = this.element;
		if (!element) {
			done?.();
			return;
		}

		const from = element.volume;
		const started = performance.now();

		const tick = (now: number) => {
			const share = Math.min(1, (now - started) / FADE_MS);
			element.volume = Math.max(0, Math.min(1, from + (target - from) * share));
			if (share < 1) {
				this.fadeFrame = requestAnimationFrame(tick);
			} else {
				this.fadeFrame = null;
				done?.();
			}
		};

		this.fadeFrame = requestAnimationFrame(tick);
	}

	/**
	 * Обірвати згасання, яке ще йде.
	 *
	 * Без цього два натискання поспіль («стоп», одразу «грати») лишали б два
	 * кадрові цикли, які тягнуть гучність у різні боки — і перемагав би той, що
	 * закінчився пізніше.
	 */
	private cancelFade(): void {
		if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
		this.fadeFrame = null;
	}

	/** Зняти паузу між повторами, якщо вона зараз іде. */
	private cancelGap(): void {
		if (this.gapTimer !== null) clearTimeout(this.gapTimer);
		if (this.gapTick !== null) clearInterval(this.gapTick);
		this.gapTimer = null;
		this.gapTick = null;
	}

	/** Забути чергу: один раз, без пауз. Позиція при цьому не чіпається. */
	private forgetQueue(): void {
		this.cancelGap();
		this.plays = 1;
		this.gapMs = 0;
		this.done = 0;
		this.retotal();
	}

	/**
	 * Перемотати — У КООРДИНАТАХ ЧЕРГИ, а не одного відтворення.
	 *
	 * Смуга показує всю чергу, тож і палець на ній говорить про неї: середина
	 * смуги на треку з трьома повторами — це середина ДРУГОГО відтворення, а не
	 * середина файлу. Тому позиція розкладається назад на «котре відтворення» й
	 * «скільки в ньому», а решта черги перераховується від цього місця.
	 *
	 * Влучання в ПАУЗУ між повторами притискається до кінця звуку: пауза — це
	 * тиша, і зупиняти палець посеред неї означало б «нічого не сталося».
	 */
	seek(positionMs: number): void {
		if (!this.element || !this.trackId) return;

		const total = this.durationMs > 0 ? this.durationMs : Number.POSITIVE_INFINITY;
		const clamped = Math.max(0, Math.min(total, positionMs));

		if (this.unit <= 0) {
			this.element.currentTime = clamped / 1000;
			this.positionMs = Math.round(clamped);
			return;
		}

		const { index, innerMs } = queueSpot(clamped, this.clipMs, this.gapMs, this.plays);

		/*
		 * Перемотка з паузи ПОВЕРТАЄ ЗВУК. Людина тягне смугу тоді, коли хоче
		 * почути інше місце, а не «почекати ще трохи тиші»: лишити її в паузі
		 * означало б кнопку, яка не працює.
		 */
		const inGap = this.gapTimer !== null;
		this.cancelGap();

		this.done = index;
		this.element.currentTime = innerMs / 1000;
		this.positionMs = Math.round(index * this.unit + innerMs);
		if (inGap && this.playing) void this.element.play().catch(() => undefined);
	}

	/** Перемотати на стільки мілісекунд уперед або назад. */
	seekBy(deltaMs: number): void {
		this.seek(this.positionMs + deltaMs);
	}

	async play(trackId: string, plan?: { plays: number; gapSec: number }): Promise<void> {
		const track = this.order.find((entry) => entry.id === trackId);
		if (!track) throw new EngineError('missing', trackId);
		if (!this.armed) throw new EngineError('not-armed', track.title);

		/** Цей запуск — останній відомий намір, доки не прийде наступний. */
		const intent = ++this.intent;

		/*
		 * План повторів ставиться ДО відтворення й затирає попередній: натиснули
		 * інший трек — від старого не лишається нічого, зокрема й черги повторів.
		 */
		this.cancelGap();
		this.plays = Math.max(1, Math.round(plan?.plays ?? 1));
		this.gapMs = Math.max(0, plan?.gapSec ?? 0) * 1000;
		this.done = 0;
		this.retotal();

		const element = this.ensureElement();
		// З тієї самої причини, що й у `resume`: далі є `await`, а в черзі може
		// лежати кадр згасання, який спинить уже НОВИЙ трек.
		this.cancelFade();

		let file: File;
		try {
			file = await this.source.open(track.path);
		} catch (error) {
			if (error instanceof TrackMissingError) throw new EngineError('missing', track.title);
			throw error;
		}

		// Нас випередили, поки читався файл. Елемента не чіпаємо взагалі: там
		// уже грає чуже, і `releaseUrl()` відкликав би адресу того звуку.
		if (intent !== this.intent) return;

		this.releaseUrl();
		this.objectUrl = URL.createObjectURL(file);
		element.src = this.objectUrl;
		// З нуля — і далі наростання: початок теж мусить бути плавним.
		element.volume = 0;

		try {
			await element.play();
		} catch {
			/*
			 * Випередження ПЕРЕВІРЯЄТЬСЯ ПЕРШИМ, і саме тут воно найважливіше:
			 * `play()` на елементі, чий `src` уже замінив новіший запуск,
			 * відмовляється з `AbortError`. Це не поломка відтворення, і сказати
			 * про неї людині означало б показати «не вдалося» на треку, який саме
			 * цієї миті звучить.
			 */
			if (intent !== this.intent) return;
			throw new EngineError('playback', track.title);
		}

		if (intent !== this.intent) return;

		this.fadeTo(this.targetVolume());

		this.trackId = trackId;
		this.describeToSystem(track.title);
	}

	/**
	 * Пауза: кнопка міняється ОДРАЗУ, звук іде секунду.
	 *
	 * Прапорець ставиться тут, не чекаючи події `pause` від елемента. Доти
	 * кнопка лишалася зеленою «Пауза» всю секунду згасання: людина тиснула,
	 * нічого не мінялося — і тиснула вдруге.
	 *
	 * Звук при цьому гасне плавно: пауза посеред звуку чується як клац.
	 */
	pause(): void {
		if (!this.element) return;
		/*
		 * Пауза посеред ПАУЗИ МІЖ ПОВТОРАМИ теж мусить спинити час. План при
		 * цьому зберігається: «грати» продовжить із наступного відтворення, бо
		 * людина натиснула паузу, а не стоп.
		 */
		this.cancelGap();
		this.playing = false;
		this.fadeTo(0, () => this.element?.pause());
	}

	async resume(): Promise<void> {
		if (!this.element || !this.trackId) return;
		/*
		 * Згасання від паузи гаситься ПЕРШИМ рядком, до будь-якого `await`.
		 *
		 * Пауза спиняє елемент не одразу, а в кінці секундного згасання. Хто
		 * натиснув «грати» посеред нього, той запускав звук — і за мить той самий
		 * догорілий кадр викликав `pause()` уже по новому відтворенню. Зовні це
		 * виглядало як «кнопка не працює з третього разу».
		 *
		 * `fadeTo` наприкінці теж кличе `cancelFade`, але туди ми доходимо ЗА
		 * `await`, а кадр устигає раніше.
		 */
		this.cancelFade();

		/*
		 * Прапорець ставиться РУКАМИ, як і в паузі, і це не дублювання події.
		 *
		 * Пауза виставляє «не грає» одразу, а сам елемент спиняє аж наприкінці
		 * згасання. Хто натиснув «грати» до кінця тієї секунди, той скасував
		 * згасання — і елемент так і не спинився. `play()` на тому, що й не
		 * спинялося, події `play` НЕ шле, і плеєр лишався б «на паузі», хоч звук
		 * іде.
		 */
		this.playing = true;
		this.element.volume = 0;
		await this.element.play().catch(() => undefined);
		this.fadeTo(this.targetVolume());
	}

	/**
	 * Стоп: на початок треку, але ТРЕК ЛИШАЄТЬСЯ ОБРАНИМ.
	 *
	 * Доти «стоп» скидав і сам трек: щоб заграти те саме ще раз, доводилося
	 * знову шукати його в списку. У залі це помітно — «стоп» тиснуть між
	 * номерами, а не наприкінці.
	 *
	 * Різниця з паузою лишається: пауза тримає місце, стоп повертає на
	 * початок. Джерело не знімається, тож «Грати» починає одразу, без
	 * повторного читання файлу.
	 */
	stop(): void {
		if (!this.element) return;
		/*
		 * «Стоп» скасовує й ЗАПУСК, ЩО В ДОРОЗІ. Інакше трек, чий файл ще
		 * читався з диска, починав грати вже після «стопу» — тобто кнопка
		 * спрацьовувала «через раз» рівно на великих файлах, на яких вона й
		 * потрібна.
		 */
		this.intent += 1;
		// «Стоп» означає стоп: черга повторів зникає разом зі звуком.
		this.forgetQueue();
		// Так само, як у паузі: кнопка не чекає кінця згасання.
		this.playing = false;
		this.fadeTo(0, () => {
			const element = this.element;
			if (!element) return;
			element.pause();
			element.currentTime = 0;
			this.positionMs = 0;
		});
	}

	/** Куди наростати: нуль, якщо ввімкнена тиша, інакше виставлена гучність. */
	private targetVolume(): number {
		return this.mutedFrom !== null ? 0 : this.volume;
	}

	/** Наступний за порядком списку. З останнього — на початок. */
	nextTrackId(): string | null {
		if (this.order.length === 0) return null;
		const at = this.order.findIndex((entry) => entry.id === this.trackId);
		return this.order[(at + 1) % this.order.length].id;
	}

	/**
	 * Попередній за порядком списку. З першого — на кінець.
	 *
	 * Коли не грає нічого, `findIndex` віддає `-1`, і «попередній» має вести на
	 * ОСТАННІЙ: саме там закінчується список, якщо йти назад від початку.
	 */
	prevTrackId(): string | null {
		if (this.order.length === 0) return null;
		const at = this.order.findIndex((entry) => entry.id === this.trackId);
		const from = at === -1 ? 0 : at;
		return this.order[(from - 1 + this.order.length) % this.order.length].id;
	}

	setVolume(value: number): void {
		this.volume = Math.max(0, Math.min(1, value));
		// Рух повзунка знімає тишу: інакше кнопка «повернути звук» лишилася б
		// натиснутою при гучності, яку щойно виставили руками.
		if (this.volume > 0) this.mutedFrom = null;
		// Повзунок — це негайно, без секундного згасання: людина тягне й слухає.
		this.cancelFade();
		if (this.element) this.element.volume = this.targetVolume();
	}

	/**
	 * ТИША — це запамʼятана гучність, а не окремий прапорець у плеєра.
	 *
	 * `HTMLAudioElement.muted` існує, але він НЕ видно ззовні: пульт бачить лише
	 * те, що приймач оголосив, а оголошує він `volume`. Два джерела правди про
	 * одне («гучність 80, але тиша») розійшлися б при першому ж дотику до
	 * повзунка на другому пристрої.
	 *
	 * Тому тиша — це `volume = 0` плюс памʼять про те, звідки ми прийшли. Пульт
	 * при цьому не мусить знати про тишу нічого: нуль і є нуль.
	 */
	toggleMute(): void {
		if (this.mutedFrom !== null) {
			const restore = this.mutedFrom;
			this.mutedFrom = null;
			this.volume = restore;
			this.fadeTo(restore);
			return;
		}

		// Тиша з уже нульової гучності нічого не означає й нічого не памʼятає.
		if (this.volume === 0) return;
		this.mutedFrom = this.volume;
		this.fadeTo(0);
	}

	/** Чи зараз тиша, увімкнена саме кнопкою. */
	get muted(): boolean {
		return this.mutedFrom !== null;
	}

	/** Змінити гучність на стільки відсотків. Межі — у `setVolume`. */
	adjustVolume(deltaPercent: number): void {
		this.setVolume(this.volume + deltaPercent / 100);
	}

	/** Прибрати за собою: адреса Blob, елемент, слухачі. */
	destroy(): void {
		// Запуск, що був у дорозі, тримає СВОЄ посилання на елемент і без цього
		// рядка заграв би вже після виходу з дошки — а зупинити його нічим.
		this.intent += 1;
		this.cancelFade();
		// Без цього пауза між повторами переживала б саму сторінку: таймер
		// прокинувся б і звернувся до елемента, якого вже немає.
		this.forgetQueue();
		this.element?.pause();
		this.releaseUrl();
		this.element?.remove();
		this.element = null;
		this.forgetSystem();
		this.armed = false;
		this.playing = false;
		this.trackId = null;
	}

	private releaseUrl(): void {
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = null;
	}

	private ensureElement(): HTMLAudioElement {
		if (this.element) return this.element;

		const element = new Audio();
		element.preload = 'auto';

		/*
		 * Стан читається З ЕЛЕМЕНТА подіями, а не виводиться з власних викликів.
		 * Трек може закінчитися сам, браузер може зупинити відтворення — і тоді
		 * прапорець, виставлений у `play()`, казав би «грає» про тишу. Пульт
		 * показував би те саме.
		 */
		element.addEventListener('play', () => (this.playing = true));
		element.addEventListener('pause', () => {
			/*
			 * КІНЕЦЬ ТРЕКУ ТЕЖ КИДАЄ `pause` — І КИДАЄ ЙОГО ПЕРЕД `ended`.
			 *
			 * Через це «лишити `playing` увімкненим на паузу між повторами» не
			 * працювало саме собою: до `ended` прапорець уже був збитий отут, і
			 * плеєр у проміжку показував «нічого не грає». Проба це й упіймала.
			 *
			 * `element.ended` на цей момент уже `true` — саме ним пауза між
			 * повторами й відрізняється від паузи, яку натиснула людина.
			 */
			if (element.ended && this.more) return;
			this.playing = false;
		});
		element.addEventListener('ended', () => {
			if (this.more) {
				this.done += 1;
				/*
				 * `playing` лишається `true` на всю паузу. Інакше пульт на кожній
				 * паузі показував би «нічого не грає» і кнопку «грати» — тобто
				 * пропонував би запустити те, що вже запущене й саме продовжиться.
				 *
				 * Позиція при цьому РУХАЄТЬСЯ, і це головне в загальному таймлайні:
				 * пауза — така сама частина черги, як і звук. Без цього смуга
				 * завмирала б на кожному проміжку, а пульт, який рахує позицію від
				 * останнього оголошення, після паузи показував би час, зміщений на її
				 * довжину.
				 */
				const started = performance.now();
				const from = (this.done - 1) * this.unit + this.clipMs;
				this.positionMs = Math.round(from);
				this.gapTick = setInterval(() => {
					const gone = Math.min(this.gapMs, performance.now() - started);
					this.positionMs = Math.round(from + gone);
				}, GAP_TICK_MS);

				this.gapTimer = setTimeout(() => {
					this.cancelGap();
					const media = this.element;
					if (!media) return;
					media.currentTime = 0;
					media.volume = 0;
					void media.play().then(() => this.fadeTo(this.targetVolume()));
				}, this.gapMs);
				return;
			}

			/*
			 * ТРЕК ДОГРАВ — І ПЕРЕСТАЄ БУТИ ОБРАНИМ.
			 *
			 * Доти `trackId` лишався, і обидва екрани далі підсвічували рядок, який
			 * уже відзвучав: на пульті біла рамка стояла на треку, що скінчився
			 * хвилину тому, і читалася як «оце зараз грає».
			 *
			 * Зі «стопом» це НЕ плутати: там трек лишається обраним навмисно —
			 * «стоп» тиснуть між номерами, щоб запустити те саме ще раз. Тут же
			 * нічого не тиснули: звук закінчився сам.
			 */
			this.forgetQueue();
			this.playing = false;
			this.positionMs = 0;
			this.trackId = null;
		});
		element.addEventListener('timeupdate', () => {
			// Позиція В ЧЕРЗІ: скільки відтворень уже позаду плюс час у поточному.
			this.positionMs = Math.round(this.done * this.unit + element.currentTime * 1000);
		});
		element.addEventListener('durationchange', () => {
			this.clipMs = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0;
			this.retotal();
		});

		this.element = element;
		return element;
	}

	/**
	 * Розповісти системі, що грає.
	 *
	 * Media Session дає дві речі безкоштовно: назву треку на екрані блокування
	 * й роботу апаратних кнопок — на клавіатурі, на навушниках, на пульті
	 * колонки. Для залу це не прикраса: зупинити звук інколи треба тому, хто
	 * стоїть біля комп'ютера, а не тому, у кого телефон.
	 */
	private describeToSystem(title: string): void {
		if (!('mediaSession' in navigator)) return;

		navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'AudioRemote' });
		navigator.mediaSession.setActionHandler('play', () => void this.resume());
		navigator.mediaSession.setActionHandler('pause', () => this.pause());
		navigator.mediaSession.setActionHandler('stop', () => this.stop());
	}

	/**
	 * Забрати назву з екрана блокування разом із дошкою.
	 *
	 * Media Session живе в ДОКУМЕНТІ, а не в елементі: знятий елемент її не
	 * чіпає. Без цього після виходу з дошки система й далі показувала останній
	 * трек і пропонувала кнопки, які вже нічого не роблять — рушія, на який
	 * вони посилаються, більше немає.
	 */
	private forgetSystem(): void {
		if (!('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = null;
		for (const action of ['play', 'pause', 'stop'] as const) {
			navigator.mediaSession.setActionHandler(action, null);
		}
	}
}
