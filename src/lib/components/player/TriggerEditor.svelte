<script lang="ts">
	import { untrack } from 'svelte';
	import { IconCheck, IconLater, IconTrash, IconWarning } from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import { confirmed } from '$lib/services/confirmed.svelte';
	import {
		emptyTrigger,
		MAX_INTERVAL_SEC,
		MIN_INTERVAL_SEC,
		parseHeaders,
		TRIGGER_TESTS,
		type TrackTrigger,
		type TriggerTest
	} from '$lib/triggers/trigger';
	import { describeNextDue } from '$lib/triggers/schedule';
	import { FAULT_TEXT, triggerWatcher } from '$lib/triggers/watcher.svelte';
	import type { BoardEditor } from '$lib/board/editor';
	import Switch from '$lib/components/ui/Switch.svelte';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';
	import ScheduleEditor from './ScheduleEditor.svelte';
	import ApiScheduleSection from './ApiScheduleSection.svelte';

	interface Props {
		trackId: string;
		controller: BoardEditor;
		initialMode?: 'api' | 'schedule';
	}

	let { trackId, controller, initialMode }: Props = $props();

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
		untrack(() => {
			const existing = controller.triggerFor(trackId);
			return {
				...emptyTrigger(),
				...existing,
				mode: initialMode ?? existing?.mode ?? 'api',
				headers: existing?.headers ?? {},
				blocks: existing?.blocks ?? []
			};
		})
	);
	const saved = confirmed();

	/**
	 * Заголовки редагуються текстом, а не таблицею полів.
	 *
	 * Ключ доступу зазвичай приходить одним рядком із документації чужого API —
	 * його вставляють, а не набирають по частинах.
	 */
	let headersText = $state(
		untrack(() =>
			Object.entries(controller.triggerFor(trackId)?.headers ?? {})
				.map(([n, v]) => `${n}: ${v}`)
				.join('\n')
		)
	);

	const health = $derived(triggerWatcher.health[trackId] ?? null);

	/**
	 * РОЗКЛАД — окремий перемикач, а не сім рядків, які завжди на екрані.
	 *
	 * Більшості треків він не потрібен: тривога має звучати тоді, коли вона є.
	 * Сім рядків із годинами на кожному тригері перетворили б вікно на таблицю,
	 * у якій головне — адреса й умова — губиться.
	 */
	$effect(() => {
		if (initialMode && draft.mode !== initialMode) draft.mode = initialMode;
	});

	const nextInfo = $derived(
		draft.mode === 'schedule' && draft.on ? describeNextDue(draft.blocks ?? []) : null
	);
	const nextRunText = $derived.by(() => {
		if (draft.mode === 'schedule' && !draft.on) return t('schedule.disabled');
		if (!nextInfo || nextInfo.kind === 'never') return t('schedule.nextNever');
		if (nextInfo.kind === 'today') return t('schedule.nextToday', { time: nextInfo.time });
		if (nextInfo.kind === 'tomorrow') return t('schedule.nextTomorrow', { time: nextInfo.time });
		return t('schedule.nextDay', { day: t(nextInfo.dayKey), time: nextInfo.time });
	});

	function save() {
		const patch =
			draft.mode === 'schedule'
				? { ...draft, mode: 'schedule' as const, blocks: draft.blocks ?? [] }
				: {
						...draft,
						mode: 'api' as const,
						url: draft.url.trim(),
						everySec: Math.max(MIN_INTERVAL_SEC, Math.round(draft.everySec) || MIN_INTERVAL_SEC),
						headers: parseHeaders(headersText)
					};
		controller.setTrigger(trackId, patch);
		saved.show();
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
		<h3 class="pane__title">
			{draft.mode === 'schedule' ? t('track.schedule') : t('trigger.paneSource')}
		</h3>

		<div class="field">
			<span class="field__label" id="trigger-mode-label">{t('trigger.mode')}</span>
			<Picker
				row
				labelledby="trigger-mode-label"
				value={draft.mode ?? 'api'}
				prefix="trigger-mode"
				options={[
					{ value: 'api', label: t('trigger.modeApi') },
					{ value: 'schedule', label: t('trigger.modeSchedule') }
				]}
				onpick={(next) => (draft.mode = next as 'api' | 'schedule')}
			/>
		</div>

		{#if draft.mode === 'schedule'}
			<Switch
				checked={draft.on}
				label={t('trigger.onSchedule')}
				testid="trigger-schedule-on-toggle"
				onchange={(next) => (draft.on = next)}
			/>
			<div class="field">
				<span class="field__label">{t('schedule.nextRun')}</span>
				<p class="mono">{nextRunText}</p>
			</div>
		{:else}
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
		{/if}
	</section>

	<section class="pane">
		<h3 class="pane__title">
			{draft.mode === 'schedule' ? t('schedule.title') : t('trigger.paneWhen')}
		</h3>

		{#if draft.mode === 'schedule'}
			<ScheduleEditor bind:blocks={draft.blocks!} onpreset={() => (draft.on = true)} />
		{:else}
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
				<Picker
					row
					labelledby="trigger-test-label"
					value={draft.test}
					prefix="trigger-test"
					options={TRIGGER_TESTS.map((test) => ({
						value: test,
						label: t(`trigger.${test}`)
					}))}
					onpick={(next) => (draft.test = next as TriggerTest)}
				/>
			</div>

			<ApiScheduleSection bind:schedule={draft.schedule} />

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
			{#if draft.mode === 'schedule'}
				<p class="note" class:note--warn={!draft.on} data-testid="schedule-next-status">
					<IconLater size={18} aria-hidden="true" />
					<span>{nextRunText}</span>
				</p>
			{:else}
				<p class="note" class:note--warn={health?.error} data-testid="trigger-health">
					{#if health?.error}
						<IconWarning size={18} aria-hidden="true" />
						<span>
							{t(FAULT_TEXT[health.error.code], {
								detail: 'detail' in health.error ? health.error.detail : ''
							})}
						</span>
					{:else if health}
						<span>
							{t('trigger.lastOk', { value: health.value })}
							· {t('trigger.fires', { count: health.fires })}
							{#if health.shared > 1}
								·
								{plural(
									{
										one: 'trigger.sharedOne',
										few: 'trigger.sharedFew',
										other: 'trigger.sharedMany'
									},
									health.shared
								)}
							{/if}
						</span>
					{:else}
						<span>{t('trigger.never')}</span>
					{/if}
				</p>
			{/if}
		</div>

		<div class="row">
			<button class="btn btn--primary" type="button" onclick={save} data-testid="trigger-save">
				{#if saved.on}
					<IconCheck size={18} aria-hidden="true" />
					{t('settings.saved')}
				{:else}
					{t('trigger.save')}
				{/if}
			</button>

			{#if controller.triggerFor(trackId).url || controller.triggerFor(trackId).mode === 'schedule'}
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
</style>
