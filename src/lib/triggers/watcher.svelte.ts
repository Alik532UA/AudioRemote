import { mark } from '$lib/services/breadcrumbs';
import { matches, MIN_INTERVAL_SEC, readPath, triggerReady, type TrackTrigger } from './trigger';

/**
 * ОПИТУВАЧ: тримає по одному таймеру на кожен увімкнений тригер.
 *
 * ## Спрацьовує на ПЕРЕХОДІ, а не на стані
 *
 * Умова «тривога триває» лишається правдивою всі сорок хвилин. Якби трек грав
 * на кожне «так», він перезапускався б щопівхвилини й перекривав сам себе.
 * Тому пам'ятається попередня відповідь, і трек іде рівно тоді, коли «ні»
 * стало «так».
 *
 * Перше опитування після запуску НЕ рахується переходом: якщо застосунок
 * відкрили посеред тривоги, вона почалася без нас, і зустрічати її сиреною
 * означало б лякати зал на порожньому місці.
 *
 * ## Чому помилки видно — і чому не словом браузера
 *
 * Найчастіша причина, чому це не працює, — не наш код. Але браузер на всі
 * такі випадки каже одне: `TypeError: Failed to fetch`. За цим рядком
 * ховаються дві РІЗНІ речі з різними діями:
 *
 * 1. Чужий сервер не дав `Access-Control-Allow-Origin` — тоді не допоможе
 *    нічого, крім іншого джерела або власного посередника.
 * 2. Наша ж політика безпеки не пускає адресу — а це буває на вкладці,
 *    відкритій до оновлення застосунку, і лікується перезавантаженням.
 *
 * Розрізнити їх можна: на другий випадок документ шле подію
 * `securitypolicyviolation`. Тому вона слухається, і в помилці стоїть код,
 * а текст добирає вікно налаштувань.
 */

/** Чому запит не вдався. Текст добирає той, хто показує. */
export type TriggerFault =
	/** Політика безпеки САМОГО застосунку не пустила адресу. */
	| { code: 'policy' }
	/** Сервер відповів, але не тим. */
	| { code: 'http'; detail: string }
	/** Не дійшло: немає дозволу для браузера, немає мережі, немає сервера. */
	| { code: 'network' };

export interface TriggerHealth {
	/** Коли востаннє питали. `0` — ще не питали. */
	at: number;
	/** Що прочитали за шляхом, коротким текстом. */
	value: string;
	error: TriggerFault | null;
}

interface Watched {
	trackId: string;
	trigger: TrackTrigger;
	timer: ReturnType<typeof setInterval>;
	/** Попередній результат умови. `null` — ще не питали жодного разу. */
	was: boolean | null;
}

class TriggerWatcher {
	/** Стан кожного тригера за ідентифікатором треку — для вікна налаштувань. */
	health = $state<Record<string, TriggerHealth>>({});

	/*
	 * Звичайний обʼєкт, а не `Map` і не `SvelteMap`: це облік таймерів, а не
	 * стан екрана. Реактивна колекція тут обіцяла б спостереження, якого ніхто
	 * не веде, — у розмітку з цього не йде нічого, туди йде лише `health`.
	 */
	private watched: Record<string, Watched> = {};
	private fire: ((trackId: string) => void) | null = null;
	/** Остання адреса, яку заблокувала наша ж політика, і коли це було. */
	private blocked: { uri: string; at: number } | null = null;
	private listening = false;

	/** Кому казати «спрацювало». Без цього опитувач нічого не робить. */
	onFire(fire: (trackId: string) => void): void {
		this.fire = fire;
	}

	/**
	 * Привести опитування у відповідність до списку треків.
	 *
	 * Викликається на кожну зміну налаштувань: простіше й надійніше перебудувати
	 * те, що змінилося, ніж вести окремий облік, хто коли додався.
	 */
	sync(entries: readonly { id: string; trigger?: TrackTrigger | null }[]): void {
		const shouldWatch: Record<string, TrackTrigger> = {};
		for (const entry of entries) {
			if (entry.trigger && triggerReady(entry.trigger)) shouldWatch[entry.id] = entry.trigger;
		}

		// Зайві — прибрати разом із таймером.
		for (const [id, watched] of Object.entries(this.watched)) {
			const next = shouldWatch[id];
			if (next && sameTrigger(next, watched.trigger)) continue;
			clearInterval(watched.timer);
			delete this.watched[id];
		}

		for (const [id, trigger] of Object.entries(shouldWatch)) {
			if (this.watched[id]) continue;
			this.start(id, trigger);
		}
	}

	/** Зупинити все. Кличеться, коли сторінка приймача закривається. */
	stop(): void {
		for (const watched of Object.values(this.watched)) clearInterval(watched.timer);
		this.watched = {};
		this.health = {};
	}

	/**
	 * Слухач порушень політики. Ставиться один раз і назавжди.
	 *
	 * Це єдиний спосіб відрізнити «нас не пустила власна політика» від «чужий
	 * сервер не дав дозволу»: `fetch` в обох випадках кидає той самий
	 * `TypeError`, і жодної іншої підказки в ньому немає.
	 */
	private listen(): void {
		if (this.listening || typeof document === 'undefined') return;
		this.listening = true;
		document.addEventListener('securitypolicyviolation', (event) => {
			this.blocked = { uri: event.blockedURI, at: Date.now() };
		});
	}

	private start(trackId: string, trigger: TrackTrigger): void {
		this.listen();
		const everyMs = Math.max(MIN_INTERVAL_SEC, trigger.everySec) * 1000;
		const timer = setInterval(() => void this.poll(trackId), everyMs);
		this.watched[trackId] = { trackId, trigger, timer, was: null };
		// Перше опитування одразу: чекати півхвилини, щоб дізнатися, чи взагалі
		// працює адреса, — це півхвилини незнання в того, хто щойно її ввів.
		void this.poll(trackId);
	}

	/**
	 * Що саме сталося. Порушення політики зараховується, лише якщо воно щойно
	 * й саме про цю адресу: інакше давня чужа помилка приписалася б новій.
	 */
	private async fault(error: unknown, url: string): Promise<TriggerFault> {
		if (error instanceof HttpError) return { code: 'http', detail: error.message };

		/*
		 * Пауза тут не для краси: `fetch` відмовляє РАНІШЕ, ніж документ устигає
		 * розіслати `securitypolicyviolation`. Класифікувати одразу означало б
		 * щоразу називати заборону політики мережевою помилкою — тобто радити
		 * шукати інше джерело там, де досить перезавантажити сторінку.
		 */
		await new Promise((done) => setTimeout(done, 100));

		const recent = this.blocked && Date.now() - this.blocked.at < 5000;
		if (recent && url.startsWith(this.blocked!.uri.replace(/\/$/, ''))) return { code: 'policy' };

		return { code: 'network' };
	}

	private async poll(trackId: string): Promise<void> {
		const watched = this.watched[trackId];
		if (!watched) return;

		const { trigger } = watched;
		try {
			const response = await fetch(trigger.url.trim(), {
				headers: trigger.headers,
				// Кеш тут шкідливий: питаємо саме тому, що відповідь міняється.
				cache: 'no-store'
			});
			if (!response.ok) throw new HttpError(String(response.status));

			const data: unknown = await response.json();
			const value = readPath(data, trigger.path.trim());
			const now = matches(value, trigger.test, trigger.value);

			this.health = {
				...this.health,
				[trackId]: { at: Date.now(), value: brief(value), error: null }
			};

			const first = watched.was === null;
			watched.was = now;
			if (!first && now && this.fire) {
				mark(`trigger:fire ${trackId}`);
				this.fire(trackId);
			}
		} catch (error) {
			/*
			 * Помилка не зупиняє опитування: мережа падає й піднімається, а тригер
			 * на те й тригер, щоб чекати. Але вона ЗБЕРІГАЄТЬСЯ — інакше «не
			 * працює» не має жодного пояснення.
			 */
			this.health = {
				...this.health,
				[trackId]: { at: Date.now(), value: '', error: await this.fault(error, trigger.url.trim()) }
			};
		}
	}
}

/** Відповідь була, але не та: код відповіді варто показати як є. */
class HttpError extends Error {}

/** Однакові тригери не перезапускають таймер: інакше кожне збереження скидало б лічильник. */
const sameTrigger = (left: TrackTrigger, right: TrackTrigger): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

/** Коротко про прочитане: у вікні для цього один рядок. */
const brief = (value: unknown): string => {
	const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
	return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

export const triggerWatcher = new TriggerWatcher();
