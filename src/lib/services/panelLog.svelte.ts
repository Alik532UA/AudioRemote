import type { PanelNotice } from '$lib/panel/apply';
import { t } from '$lib/i18n/i18n.svelte';
import { countRemotes, type PresenceMap } from '$lib/net/presence';
import { PresenceEvents, type PresenceEventKind } from './presenceLog';

/**
 * ЖУРНАЛ ТАБЛА — і чому він тепер сервіс, а не поле сторінки.
 *
 * В аудіодошки журнал живе окремим органом (`deckLog.svelte.ts`) з першого
 * дня, а в інфодошки — найстарішої з двох — лежав у самій сторінці разом із
 * панеллю, присутністю, складальником і мережею. Наслідок був не в розмірі
 * файлу: два журнали, що відповідають на те саме питання, розходилися в
 * дрібницях, і кожна правка одного вимагала згадати про другий. Симетрія тут —
 * не охайність, а спосіб не мати двох різних відповідей на «що щойно
 * сталося».
 *
 * ## Тільки в памʼяті вкладки
 *
 * Не в базі й не в сховищі, з тих самих причин, що й на аудіодошці: журнал
 * відповідає на «щойно», а «щойно» не зберігають.
 *
 * ## Рядок — або прохання, або присутність
 *
 * Два поля взаємовиключні, і саме тому вони окремі, а не одне поле з
 * домішаними прапорцями: рядок про підключення не має ні комірки, ні підпису
 * кнопки, і вдавати, що має, означало б возити порожні значення крізь увесь
 * файл.
 */

export interface LogEntry {
	id: string;
	at: number;
	/** Дія з цього ж пристрою. Фарбує мітку: своє око знаходить одразу. */
	own: boolean;
	/**
	 * Натиснули за звуковим пультом, а не в залі.
	 *
	 * Окремо від `own`, бо це різні питання, і збігаються вони лише на таблі.
	 * У залі своє натискання — теж «зала»: сторона каже, ЗВІДКИ рука, а `own` —
	 * чи вона моя.
	 */
	desk: boolean;
	/** Як підписався той, хто натиснув. Порожньо — не називався. */
	who: string;
	/** Підключення або відключення помічника. Порожньо — це прохання. */
	join?: PresenceEventKind;
	/** Прохання з панелі. Порожньо — це подія присутності. */
	notice?: PanelNotice;
}

/**
 * Скласти короткий підпис останньої дії для шапки.
 */
export function formatNotice(notice: PanelNotice, who?: string): string {
	const moveWord = (move: PanelNotice['move']) => {
		if (move === 'up') return t('panel.wentUp');
		if (move === 'down') return t('panel.wentDown');
		if (move === 'on') return t('panel.turnedOn');
		if (move === 'off') return t('panel.turnedOff');
		return '';
	};

	const what = notice.label ?? moveWord(notice.move);
	const parts: string[] = [];
	if (who) parts.push(who);
	if (notice.caption && what) parts.push(`${notice.caption} — ${what}`);
	else if (notice.caption) parts.push(notice.caption);
	else if (what) parts.push(what);
	if (notice.from !== null && notice.to !== null) {
		parts.push(t('panel.change', { from: `${notice.from}`, to: `${notice.to}` }));
	}
	return parts.join(' · ');
}

/** Скільки рядків тримати. Далі найстаріші випадають — як і в аудіодошці. */
const KEPT = 40;

class PanelLogState {
	entries = $state<LogEntry[]>([]);
	/** Остання дія для шапки (тримається 3 секунди). `null` — спокій. */
	recentAction = $state<string | null>(null);

	private beat = 0;
	private recentTimer: ReturnType<typeof setTimeout> | null = null;

	private readonly comings = new PresenceEvents('remote', ({ kind, who }) =>
		this.add({ own: false, desk: false, who, join: kind })
	);

	/**
	 * Прохання із зали або власне натискання.
	 *
	 * `id` приходить ззовні: у прохання він уже є — це ключ команди в базі, і
	 * саме за ним сторінка впізнає своє натискання, коли воно повертається
	 * підпискою.
	 */
	asked(notice: PanelNotice, id: string, own: boolean, who: string, desk = own): void {
		this.entries = [{ notice, id, at: Date.now(), own, who, desk }, ...this.entries].slice(0, KEPT);
		this.recentAction = formatNotice(notice, who) || null;
		if (this.recentTimer) clearTimeout(this.recentTimer);
		this.recentTimer = setTimeout(() => {
			this.recentAction = null;
		}, 3000);
	}

	/**
	 * ЗНІМОК ПРИСУТНОСТІ — журнал сам вирішує, що з нього стало рядком.
	 *
	 * Картка дошки каже, скільки помічників ЗАРАЗ; на питання «а коли він
	 * відпав» вона не відповідає ніяк — число просто стає іншим, і помітити це
	 * можна лише дивлячись на нього в ту саму секунду.
	 *
	 * Повертає, скільки помічників на звʼязку: той самий знімок однаково вже
	 * розібрано, і другий прохід по ньому в місці виклику був би другим
	 * джерелом того самого числа.
	 */
	saw(present: PresenceMap): number {
		this.comings.see(present);
		return countRemotes(present);
	}

	/** Зняти витримки й спорожнити. Без цього вони вистрелять у закриту дошку. */
	forget(): void {
		this.comings.stop();
		this.entries = [];
		if (this.recentTimer) clearTimeout(this.recentTimer);
		this.recentAction = null;
	}

	private add(note: Omit<LogEntry, 'id' | 'at'>): void {
		// Номер у ключі, а не сам час: дві події в одну мілісекунду дали б
		// однаковий ключ, і `{#each}` намалював би одну замість двох.
		this.beat += 1;
		this.entries = [{ ...note, id: `beat-${this.beat}`, at: Date.now() }, ...this.entries].slice(
			0,
			KEPT
		);
	}
}

export const panelLog = new PanelLogState();
