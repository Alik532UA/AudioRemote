/**
 * ЩО ЩОЙНО НАТИСНУЛИ — і на ЧИЇЙ панелі це видно.
 *
 * На таблі панелей стільки, скільки помічників, а сітка в них та сама: пульт
 * один, копій кілька (`PanelWall`). Копія варта місця рівно доти, доки в ній
 * світиться ЇЇ натискання — спільна підсвітка блимала б у всіх одразу, тобто
 * відповідала б «хтось», коли питання «хто».
 *
 * Тому підсвітка тут — не одне значення, а мапа «місце → комірка».
 *
 * ## Дві різні підсвітки, і обидві потрібні
 *
 * `recent` — комірка, яку щойно попросили: тримається три секунди й каже «ось
 * сюди дивитися». `hot` — спалах самого органа (кнопки, ручки), він гасне
 * власним тактом CSS і каже «ось що натиснули». Перше про місце, друге про дію.
 *
 * ## Лічильник, а не порівняння з коміркою
 *
 * Два прохання на ту саму комірку за дві секунди дали б два такти, і перший
 * погасив би підсвітку другого через секунду після її появи. Тому кожне
 * натискання дістає номер, і гасить підсвітку лише той такт, чий номер іще
 * останній.
 *
 * ## Чому тут немає рун
 *
 * Значення реактивне, і тримає його сторінка — так само, як рівні й прапорці.
 * Сюди руни не пускаються: усе, що тут є, — таймери й арифметика, а таймер у
 * рунному файлі читається як спроба зробити його реактивним.
 */

export interface SpotlightView {
	/** Місце → комірка, яку щойно попросили. */
	recent: Record<string, string>;
	/** Місце → орган, який щойно блимнув, із номером такту. */
	hot: Record<string, string>;
}

const EMPTY: SpotlightView = { recent: {}, hot: {} };

export class Spotlight {
	private view: SpotlightView = EMPTY;
	private beat = 0;
	private watch = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly report: (view: SpotlightView) => void,
		private readonly holdMs: number
	) {}

	/**
	 * Натиснули комірку. `seats` — місця, на яких це має світитися: одне для
	 * власної руки, усі вкладки автора для прохання із зали.
	 */
	press(cell: string, control: string, seats: readonly string[]): void {
		this.beat += 1;
		const recent = { ...this.view.recent };
		const hot = { ...this.view.hot };
		for (const seat of seats) {
			recent[seat] = cell;
			hot[seat] = `${control}#${this.beat}`;
		}
		this.publish({ recent, hot });

		const mine = (this.watch += 1);
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			if (this.watch !== mine) return;
			const next = { ...this.view.recent };
			for (const seat of seats) delete next[seat];
			this.publish({ recent: next, hot: this.view.hot });
		}, this.holdMs);
	}

	/** Зняти такт. Інакше він вистрелить у сторінку, якої вже немає. */
	stop(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.publish(EMPTY);
	}

	private publish(view: SpotlightView): void {
		this.view = view;
		this.report(view);
	}
}
