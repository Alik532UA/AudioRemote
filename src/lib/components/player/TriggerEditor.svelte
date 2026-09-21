<script lang="ts">
	import { untrack } from 'svelte';
	import { IconCheck, IconTrash, IconWarning } from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import {
		defaultSchedule,
		emptyTrigger,
		MAX_INTERVAL_SEC,
		MIN_INTERVAL_SEC,
		TRIGGER_TESTS,
		withinSchedule,
		type TrackTrigger
	} from '$lib/triggers/trigger';
	import { FAULT_TEXT, triggerWatcher } from '$lib/triggers/watcher.svelte';
	import type { BoardEditor } from '$lib/board/editor';
	import Switch from '$lib/components/ui/Switch.svelte';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';

	interface Props {
		trackId: string;
		controller: BoardEditor;
	}

	let { trackId, controller }: Props = $props();

	/**
	 * ЗАПУСК ТРЕКУ ЗА ЧУЖИМ API — ПОЛЯ, А НЕ ВСТАВЛЕНИЙ СКРИПТ.
	 *
	 * Причина в `trigger.ts` і коротко тут: політика безпеки цього застосунку не
	 * має `unsafe-eval`, і саме вона тримає весь клас «чужий код виконався на
	 * сторінці». Знімати її заради зручності одного налаштування означало б
	 * зняти захист і з дошки, і з пароля.
	 *
	 * Тому людина описує, ЗВІДКИ брати і ЯК порівняти. Цього досить для
	 * будь-якого JSON API — і саме тому джерело може бути яким завгодно, а не
	 * лише тим, під яке ми написали б окрему кнопку.
	 */
	/*
	 * Чернетка знімається ОДИН раз, на відкритті: далі її править людина, і
	 * перечитувати збережене під її руками означало б затирати набране.
	 * `untrack` каже це прямо, а не лишає здогадуватися.
	 */
	let draft = $state<TrackTrigger>(
		untrack(() => ({ ...emptyTrigger(), ...controller.triggerFor(trackId) }))
	);
	let saved = $state(false);

	/**
	 * Заголовки редагуються текстом, а не таблицею полів.
	 *
	 * Ключ доступу зазвичай приходить одним рядком із документації чужого API —
	 * його вставляють, а не набирають по частинах.
	 */
	let headersText = $state(
		untrack(() =>
			Object.entries(controller.triggerFor(trackId).headers)
				.map(([name, value]) => `${name}: ${value}`)
				.join(String.fromCharCode(10))
		)
	);

	const parseHeaders = (text: string): Record<string, string> => {
		const headers: Record<string, string> = {};
		for (const line of text.split(String.fromCharCode(10))) {
			const at = line.indexOf(':');
			if (at < 1) continue;
			const name = line.slice(0, at).trim();
			const value = line.slice(at + 1).trim();
			if (name && value) headers[name] = value;
		}
		return headers;
	};

	const health = $derived(triggerWatcher.health[trackId] ?? null);

	/**
	 * РОЗКЛАД — окремий перемикач, а не сім рядків, які завжди на екрані.
	 *
	 * Більшості треків він не потрібен: тривога має звучати тоді, коли вона є.
	 * Сім рядків із годинами на кожному тригері перетворили б вікно на таблицю,
	 * у якій головне — адреса й умова — губиться.
	 */
	const DAYS = [
		'week.mon',
		'week.tue',
		'week.wed',
		'week.thu',
		'week.fri',
		'week.sat',
		'week.sun'
	] as const;

	let scheduleOn = $state(untrack(() => Boolean(draft.schedule)));

	/** Зараз поза розкладом — це стан, а не помилка, і сказати про нього варто. */
	const asleep = $derived(scheduleOn && !withinSchedule(draft.schedule));

	/** Час першого дня — на всі інші. Вимкнені дні лишаються вимкненими. */
	function sameEveryDay() {
		const week = draft.schedule;
		const first = week?.[0];
		if (!week || !first) return;
		draft.schedule = week.map((day) => ({ ...day, from: first.from, to: first.to }));
	}

	function toggleSchedule(next: boolean) {
		scheduleOn = next;
		draft.schedule = next ? (draft.schedule ?? defaultSchedule()) : null;
	}

	function save() {
		controller.setTrigger(trackId, {
			...draft,
			url: draft.url.trim(),
			everySec: Math.max(MIN_INTERVAL_SEC, Math.round(draft.everySec) || MIN_INTERVAL_SEC),
			headers: parseHeaders(headersText)
		});
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}
</script>

<!--
	ДВІ ПАНЕЛІ Й СПІЛЬНИЙ НИЗ, а не один довгий список.

	`display: contents` на обгортці: панелі стають комірками сітки ВІКНА, поруч
	з панеллю самого треку. Власна сітка тут дала б колонки всередині колонки —
	поля розʼїхалися б із сусідніми, і вікно читалося б як два різні вікна.
-->
<div class="trigger">
	<section class="pane">
		<h3 class="pane__title">{t('trigger.paneSource')}</h3>

		<!--
			Пояснення стоїть у коротшій колонці, і це не випадковість: у спільному
			низі воно розтягувало вікно вниз рівно тоді, коли сусідня колонка вже
			була найвищою. Тут воно займає порожнє місце, якого й так вистачало.
		-->
		<p class="muted">{t('trigger.lead')}</p>

		<div class="field">
			<label class="field__label" for="trigger-url">{t('trigger.url')}</label>
			<input
				id="trigger-url"
				class="input mono"
				type="url"
				inputmode="url"
				placeholder="https://"
				bind:value={draft.url}
				data-testid="trigger-url"
			/>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-every">{t('trigger.every')}</label>
			<NumberStepper
				id="trigger-every"
				label={t('trigger.every')}
				value={draft.everySec}
				min={MIN_INTERVAL_SEC}
				max={MAX_INTERVAL_SEC}
				onchange={(next) => (draft.everySec = next)}
			/>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-headers">{t('trigger.headers')}</label>
			<textarea
				id="trigger-headers"
				class="input mono area"
				rows="2"
				spellcheck="false"
				placeholder="Authorization: Bearer …"
				bind:value={headersText}
				data-testid="trigger-headers"
			></textarea>
			<p class="muted">{t('trigger.headersHint')}</p>
		</div>
	</section>

	<section class="pane">
		<h3 class="pane__title">{t('trigger.paneWhen')}</h3>

		<Switch
			checked={draft.on}
			label={t('trigger.on')}
			testid="trigger-on"
			onchange={(next) => (draft.on = next)}
		/>

		<div class="field">
			<Switch
				checked={draft.onChange}
				label={t('trigger.onChange')}
				testid="trigger-onchange"
				onchange={(next) => (draft.onChange = next)}
			/>
			<p class="muted">{t('trigger.onChangeHint')}</p>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-path">{t('trigger.path')}</label>
			<input
				id="trigger-path"
				class="input mono"
				type="text"
				spellcheck="false"
				bind:value={draft.path}
				data-testid="trigger-path"
			/>
			<p class="muted">{t('trigger.pathHint')}</p>
		</div>

		<div class="field">
			<span class="field__label" id="trigger-test-label">{t('trigger.test')}</span>
			<div class="picker" role="radiogroup" aria-labelledby="trigger-test-label">
				{#each TRIGGER_TESTS as test (test)}
					<button
						class="picker__item"
						type="button"
						role="radio"
						aria-checked={draft.test === test}
						onclick={() => (draft.test = test)}
						data-testid="trigger-test-{test}"
					>
						{t(`trigger.${test}`)}
					</button>
				{/each}
			</div>
		</div>

		<div class="field">
			<Switch
				checked={scheduleOn}
				label={t('trigger.schedule')}
				testid="trigger-schedule"
				onchange={toggleSchedule}
			/>

			{#if scheduleOn && draft.schedule}
				<ul class="week">
					{#each draft.schedule as day, index (index)}
						<li class="week__row" class:week__row--off={!day.on}>
							<!--
								День — сама кнопка, а не прапорець поруч із написом. Прапорець
								браузера тут виглядав чужим і забирав ширину, якої в колонці
								немає; до того ж «Пн» і галочка біля нього — це одна річ, а не
								дві.
							-->
							<button
								class="week__day"
								type="button"
								role="switch"
								aria-checked={day.on}
								onclick={() => (day.on = !day.on)}
								data-testid="week-on-{index}"
							>
								{t(DAYS[index])}
							</button>
							<input
								class="input week__time"
								type="time"
								aria-label={t('week.from', { day: t(DAYS[index]) })}
								value={day.from}
								disabled={!day.on}
								oninput={(event) => (day.from = event.currentTarget.value)}
								data-testid="week-from-{index}"
							/>
							<span class="week__dash">–</span>
							<input
								class="input week__time"
								type="time"
								aria-label={t('week.to', { day: t(DAYS[index]) })}
								value={day.to}
								disabled={!day.on}
								oninput={(event) => (day.to = event.currentTarget.value)}
								data-testid="week-to-{index}"
							/>
						</li>
					{/each}
				</ul>

				<!--
					Сім однакових рядків набирають руками рівно один раз, і після цього
					цю кнопку шукають. Копіює перший рядок у решту — вимкнені дні
					лишаються вимкненими, бо це окреме рішення.
				-->
				<button class="week__same" type="button" onclick={sameEveryDay} data-testid="week-same">
					{t('trigger.scheduleSame')}
				</button>

				<p class="muted">{t('trigger.scheduleHint')}</p>
				{#if asleep}
					<p class="note note--warn" data-testid="schedule-asleep">
						<span>{t('trigger.scheduleNow')}</span>
					</p>
				{/if}
			{/if}
		</div>

		{#if draft.test !== 'truthy'}
			<div class="field">
				<label class="field__label" for="trigger-value">{t('trigger.value')}</label>
				<input
					id="trigger-value"
					class="input"
					type="text"
					bind:value={draft.value}
					data-testid="trigger-value"
				/>
			</div>
		{/if}
	</section>

	<!--
		Пояснення, стан і кнопки — на всю ширину під колонками.

		Вони стосуються ОБОХ панелей: пояснення однакове для адреси й умови, стан
		останнього опитування залежить від них разом, а «Зберегти» зберігає все.
		У колонці вони виглядали б як власність тієї колонки.
	-->
	<footer class="foot">
		<div class="foot__text">
			<!--
				Стан останнього опитування видно тут, бо найчастіша причина «не працює» —
				не наш код, а заборона чужого сервера пускати браузер. Мовчання в цьому
				місці виглядало б як зламаний застосунок.
			-->
			<p class="note" class:note--warn={health?.error} data-testid="trigger-health">
				{#if health?.error}
					<IconWarning size={18} aria-hidden="true" />
					<!--
						Текст добирається ТУТ, а не в опитувачі: там він застиг би мовою, яка
						була на момент помилки, і не змінився б від перемикання мови.
					-->
					<span>
						{t(FAULT_TEXT[health.error.code], {
							detail: 'detail' in health.error ? health.error.detail : ''
						})}
					</span>
				{:else if health}
					<span>
						{t('trigger.lastOk', { value: health.value })}
						· {t('trigger.fires', { count: health.fires })}
						<!--
							Коли адресу слухає не один трек, це варто сказати: «опитано щойно»
							на треку, який сам нічого не питав, інакше виглядало б помилкою.
						-->
						{#if health.shared > 1}
							·
							{plural(
								{ one: 'trigger.sharedOne', few: 'trigger.sharedFew', other: 'trigger.sharedMany' },
								health.shared
							)}
						{/if}
					</span>
				{:else}
					<span>{t('trigger.never')}</span>
				{/if}
			</p>
		</div>

		<div class="row">
			<button class="btn btn--primary" type="button" onclick={save} data-testid="trigger-save">
				{#if saved}
					<IconCheck size={18} aria-hidden="true" />
					{t('settings.saved')}
				{:else}
					{t('trigger.save')}
				{/if}
			</button>

			{#if controller.triggerFor(trackId).url}
				<button
					class="btn btn--danger"
					type="button"
					onclick={() => {
						controller.setTrigger(trackId, null);
						draft = emptyTrigger();
						headersText = '';
					}}
					data-testid="trigger-clear"
				>
					<IconTrash size={18} aria-hidden="true" />
					{t('trigger.clear')}
				</button>
			{/if}
		</div>
	</footer>
</div>

<style>
	/*
	 * Обгортки для сітки не існує: її панелі — прямі комірки сітки вікна.
	 * Інакше редактор був би однією коміркою, і три колонки перетворилися б на
	 * дві з вкладеним стовпцем усередині другої.
	 */
	.trigger {
		display: contents;
	}

	/*
	 * Низ іде під колонками ТРИГЕРА, а не під усіма.
	 *
	 * Стан опитування й кнопка «Прибрати запуск за API» до колонки «Трек»
	 * стосунку не мають: там підпис, клавіша й колір. Розтягнутий на всю ширину
	 * рядок читався як підсумок усього вікна — тобто обіцяв, що «прочитано…»
	 * якось стосується й назви треку.
	 */
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--gap);
		grid-column: 1 / -1;
	}

	/* Та сама межа, що в сітки вікна: доки колонка одна, низ під нею ж. */
	@media (min-width: 980px) {
		.foot {
			grid-column: 2 / -1;
		}
	}

	.foot__text {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		/* Текст займає рядок, але не витісняє кнопки на власний. */
		flex: 1 1 22rem;
		min-width: 0;
	}

	/*
	 * Тиждень списком, а не таблицею: сім рядків по три поля — це вже таблиця,
	 * але їй бракує заголовків, і вирівнювання в ній коштувало б більше, ніж
	 * дає. Тут кожен рядок сам за себе, а вузька колонка вікна не ламає його.
	 */
	.week {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.week__row {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
	}

	/* Вимкнений день лишається на місці, але не тягне на себе увагу. */
	.week__row--off {
		opacity: 0.55;
	}

	.week__day {
		flex: none;
		width: 2.6rem;
		min-height: 32px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.week__day[aria-checked='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.week__dash {
		flex: none;
		color: var(--text-muted);
	}

	.week__time {
		flex: 1 1 0;
		min-width: 0;
		min-height: 32px;
		padding-inline: var(--gap-xs);
		font-size: 0.85rem;
	}

	/*
	 * Годинник із поля часу прибраний: у колонці завширшки з долоню він з'їдав
	 * місце, потрібне самим цифрам, а набирають їх однаково з клавіатури.
	 */
	.week__time::-webkit-calendar-picker-indicator {
		display: none;
	}

	.week__same {
		align-self: start;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		cursor: pointer;
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.area {
		min-height: calc(var(--tap) * 1.4);
		resize: vertical;
		font-size: 0.8rem;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.8rem;
		word-break: break-word;
	}

	.note--warn {
		color: var(--warn);
	}

	/*
	 * Умови ПО ДВІ В РЯД, а не стовпчиком.
	 *
	 * Шість пунктів стовпчиком — це 264px, і рівно на них колонка переростала
	 * вікно: зʼявлялася прокрутка там, де поруч стояли дві порожні третини
	 * панелі. Пари ще й чесніші за зміст: кожна умова стоїть поруч зі своїм
	 * запереченням.
	 *
	 * Проміжок в один піксель на тлі рамки — це і є лінії між пунктами: власні
	 * рамки комірок подвоювалися б на стиках.
	 */
	.picker {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--border);
	}

	.picker__item {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		border: 0;
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker__item:hover,
	.picker__item:focus-visible {
		background: var(--bg-sunken);
	}

	.picker__item[aria-checked='true'] {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}
</style>
