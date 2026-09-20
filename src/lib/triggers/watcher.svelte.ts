import { mark } from '$lib/services/breadcrumbs';
import {
	groupTriggers,
	matches,
	readPath,
	shouldFire,
	withinSchedule,
	type TrackTrigger,
	type TriggerGroup
} from './trigger';

/**
 * ОПИТУВАЧ: один таймер і один запит на АДРЕСУ, скільки б треків її не слухало.
 *
 * ## Рішення «запускати чи ні» живе НЕ тут
 *
 * Воно в `shouldFire` — чистій функції з тестом на кожен випадок. Раніше
 * воно стояло тут, посеред таймерів і мережі, і містило помилку, якої на
 * цьому місці не було видно: попередній результат зберігався, але з
 * поточним не порівнювався. Умову «виконується» видавали за подію «щойно
 * почала виконуватися», і сирена починалася спочатку щопівхвилини.
 *
 * Розкладка «хто з ким в одному запиті» теж не тут — вона в `groupTriggers`,
 * і з тієї ж причини: її можна перевірити списком, не піднімаючи ні браузера,
 * ні мережі.
 *
 * Опитувач тепер робить рівно три речі: питає, роздає відповідь, запам'ятовує.
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
	/**
	 * Скільки разів запускав трек від відкриття сторінки.
	 *
	 * Не прикраса: саме лічильник робить помилку «спрацьовує щоразу» видимою
	 * очима. Доти її можна було тільки почути — і то лише тому, що сирена
	 * починалася спочатку.
	 */
	fires: number;
	/**
	 * Скільки треків користуються ЦИМ ЖЕ запитом, разом із цим.
	 *
	 * Показується, коли більше одного: інакше «опитано щойно» на треку, який
	 * сам нічого не питав, виглядало б як збіг.
	 */
	shared: number;
}

interface Group extends TriggerGroup {
	timer: ReturnType<typeof setInterval>;
}

class TriggerWatcher {
	/** Стан кожного тригера за ідентифікатором треку — для вікна налаштувань. */
	health = $state<Record<string, TriggerHealth>>({});

	/*
	 * Звичайні обʼєкти, а не `Map` і не `SvelteMap`: це облік таймерів, а не
	 * стан екрана. Реактивна колекція тут обіцяла б спостереження, якого ніхто
	 * не веде, — у розмітку з цього не йде нічого, туди йде лише `health`.
	 */
	private groups: Record<string, Group> = {};
	/**
	 * Попередній результат умови, окремо від груп.
	 *
	 * Ключ — трек РАЗОМ із його тригером: змінили умову — ключ інший — тригер
	 * зведений наново, і це правильно. А от правка сусіднього треку не мусить
	 * скидати пам'ять цьому, хоч вони й в одній групі: інакше збереження чужих
	 * налаштувань посеред тривоги проковтнуло б її перехід.
	 */
	private was: Record<string, boolean | null> = {};
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
	 * те, що змінилося, ніж вести окремий облік, хто коли додався. Група, у якій
	 * не змінилося нічого, лишається зі своїм таймером — інакше кожне збереження
	 * зсувало б такт опитування на нуль.
	 */
	sync(entries: readonly { id: string; trigger?: TrackTrigger | null }[]): void {
		const planned = groupTriggers(entries);
		const wanted: Record<string, TriggerGroup> = {};
		for (const group of planned) wanted[group.key] = group;

		for (const [key, group] of Object.entries(this.groups)) {
			const next = wanted[key];
			if (next && sameGroup(next, group)) {
				delete wanted[key];
				continue;
			}
			clearInterval(group.timer);
			delete this.groups[key];
		}

		for (const group of Object.values(wanted)) this.start(group);
	}

	/** Зупинити все. Кличеться, коли сторінка приймача закривається. */
	stop(): void {
		for (const group of Object.values(this.groups)) clearInterval(group.timer);
		this.groups = {};
		this.was = {};
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

	private start(plan: TriggerGroup): void {
		this.listen();
		const timer = setInterval(() => void this.poll(plan.key), plan.everySec * 1000);
		this.groups[plan.key] = { ...plan, timer };
		// Перше опитування одразу: чекати півхвилини, щоб дізнатися, чи взагалі
		// працює адреса, — це півхвилини незнання в того, хто щойно її ввів.
		void this.poll(plan.key);
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

	private async poll(key: string): Promise<void> {
		const group = this.groups[key];
		if (!group) return;

		/*
		 * ПОЗА РОЗКЛАДОМ НЕ ПИТАЄМО ВЗАГАЛІ.
		 *
		 * Якщо жодному учаснику групи зараз не дозволено звучати, запит нічого не
		 * вирішує — а чужий сервер отримує його однаково, цілу ніч, щохвилини.
		 * Досить одного учасника в його вікні, щоб відповідь знадобилася: решта
		 * просто не спрацює.
		 */
		const awake = group.members.filter((member) => withinSchedule(member.trigger.schedule));
		if (awake.length === 0) {
			/*
			 * І ПАМ'ЯТЬ СКИДАЄТЬСЯ. Інакше перше опитування після відкриття вікна
			 * порівнялося б із вчорашнім станом: тривога, яка триває з ночі,
			 * виглядала б як щойно почата, і сирена вмикалася б рівно о восьмій.
			 * Відкриття вікна — не подія.
			 */
			for (const member of group.members) delete this.was[this.memoryKey(member)];
			return;
		}

		try {
			const response = await fetch(group.url, {
				headers: group.headers,
				// Кеш тут шкідливий: питаємо саме тому, що відповідь міняється.
				cache: 'no-store'
			});
			if (!response.ok) throw new HttpError(String(response.status));

			const data: unknown = await response.json();
			// Відповідь одна, умови різні: кожен учасник читає свій шлях сам. Ті,
			// хто поза своїм розкладом, її просто не бачать.
			for (const member of awake) this.settle(group, member, data);
		} catch (error) {
			/*
			 * Помилка не зупиняє опитування: мережа падає й піднімається, а тригер
			 * на те й тригер, щоб чекати. Але вона ЗБЕРІГАЄТЬСЯ — інакше «не
			 * працює» не має жодного пояснення. І бачать її всі учасники групи:
			 * запит був спільний, тож і невдача спільна.
			 */
			const fault = await this.fault(error, group.url);
			const at = Date.now();
			const next = { ...this.health };
			for (const member of group.members) {
				next[member.trackId] = {
					at,
					value: '',
					error: fault,
					fires: this.health[member.trackId]?.fires ?? 0,
					shared: group.members.length
				};
			}
			this.health = next;
		}
	}

	/** Ключ пам'яті: трек РАЗОМ із його тригером. Змінили умову — пам'ять чиста. */
	private memoryKey(member: TriggerGroup['members'][number]): string {
		return `${member.trackId}|${JSON.stringify(member.trigger)}`;
	}

	/** Що ця відповідь означає для одного учасника групи. */
	private settle(group: Group, member: TriggerGroup['members'][number], data: unknown): void {
		const { trackId, trigger } = member;
		const value = readPath(data, trigger.path.trim());
		const now = matches(value, trigger.test, trigger.value);

		const memory = this.memoryKey(member);
		const fire = shouldFire(this.was[memory] ?? null, now, trigger.onChange);
		this.was[memory] = now;

		this.health = {
			...this.health,
			[trackId]: {
				at: Date.now(),
				value: brief(value),
				error: null,
				fires: (this.health[trackId]?.fires ?? 0) + (fire ? 1 : 0),
				shared: group.members.length
			}
		};

		if (fire && this.fire) {
			mark(`trigger:fire ${trackId}`);
			this.fire(trackId);
		}
	}
}

/** Відповідь була, але не та: код відповіді варто показати як є. */
class HttpError extends Error {}

/**
 * Чи це та сама група.
 *
 * Порівнюється склад і такт, а не лише адреса: доданий до групи трек мусить
 * почати опитуватися, а незмінна група — не втратити свій таймер, бо інакше
 * будь-яке збереження налаштувань било б у чужий сервер позачерговим запитом.
 */
const sameGroup = (left: TriggerGroup, right: TriggerGroup): boolean =>
	left.everySec === right.everySec &&
	JSON.stringify(left.members) === JSON.stringify(right.members);

/** Коротко про прочитане: у вікні для цього один рядок. */
const brief = (value: unknown): string => {
	const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
	return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

export const triggerWatcher = new TriggerWatcher();
