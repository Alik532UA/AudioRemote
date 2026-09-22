import { readJson, writeJson } from '$lib/services/storage';
import { ALL_CHECKS, BETA_TABS, type BetaTab } from './checks';
import { trusted, VERSION, type Marks, type Vote } from './report';

export { VERSION, byLevel, reportText, trusted } from './report';
export type { Mark, Marks, Vote } from './report';

/**
 * ПОЗНАЧКИ ЧЕКЛИСТА — реактивний стан (BETA-CHECKLIST-v9 § 3, § 8.6).
 *
 * ## Чому позначка несе версію
 *
 * Галочка «працює» з-перед сорока комітів виглядає точно так само, як
 * сьогоднішня. Без версії список тихо перетворюється на звіт про минуле, який
 * читають як звіт про теперішнє. Тому позначка з іншої збірки не зникає — вона
 * все ще щось означає, — але підписується «з іншої версії» й не рахується в
 * поступі цієї.
 *
 * Чиста частина — фільтр прочитаного, звіт і версія — живе в `report.ts`.
 */

const STORAGE_KEY = 'beta.marks';

class BetaMarks {
	/**
	 * Порожньо до монтування — і це умова про СЕРЕДОВИЩЕ, а не про наявність API.
	 *
	 * У node 22+ `localStorage` є в глобальній області, тож під передрендером
	 * читання дало б не виняток, а гірше: тихий успіх зі сховища машини збірки,
	 * запечений у HTML, який поїде всім. Читання йде з `load()` після монтування.
	 */
	marks = $state<Marks>({});

	/** Підняти збережене. Кличе сторінка з `$effect`, тобто вже в браузері. */
	load(): void {
		this.marks = trusted(readJson<unknown>(STORAGE_KEY, {}));
	}

	/**
	 * Поставити стан — або зняти його повторним натисканням.
	 *
	 * Кнопок три, а станів чотири: «не перевірено» власної кнопки не має й не
	 * мусить — рядок на чотири кнопки не влазить у телефон. Умова про версію не
	 * декоративна: повторне натискання на СТАРІЙ позначці мусить не стерти її, а
	 * перепоставити на цій збірці, інакше людина, яка підтверджує торішнє
	 * «працює», натомість його втрачає.
	 */
	vote(id: string, next: Vote): void {
		const current = this.marks[id];
		const marks = { ...this.marks };
		if (current?.vote === next && current.version === VERSION) delete marks[id];
		else marks[id] = { vote: next, version: VERSION };
		this.marks = marks;
		writeJson(STORAGE_KEY, marks);
	}

	clear(): void {
		this.marks = {};
		writeJson(STORAGE_KEY, {});
	}

	/** Позначка саме цієї збірки, або `null`. Стара сюди не потрапляє навмисно. */
	fresh(id: string) {
		const mark = this.marks[id];
		return mark && mark.version === VERSION ? mark : null;
	}

	/** Чи стоїть на пункті позначка з ІНШОЇ збірки — її показують окремим підписом. */
	stale(id: string): boolean {
		const mark = this.marks[id];
		return mark !== undefined && mark.version !== VERSION;
	}

	/** Скільки пунктів вкладки позначено на цій збірці. */
	doneIn(tab: BetaTab): number {
		return tab.checks.filter((check) => this.fresh(check.id) !== null).length;
	}

	get done(): number {
		return BETA_TABS.reduce((sum, tab) => sum + this.doneIn(tab), 0);
	}

	get total(): number {
		return ALL_CHECKS.length;
	}
}

export const betaMarks = new BetaMarks();
