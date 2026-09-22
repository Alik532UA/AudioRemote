<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconCheck } from '$lib/config/icons';
	import LogWho from '$lib/components/ui/LogWho.svelte';
	import type { VerdictKind } from '$lib/net/panelTypes';
	import type { LogEntry } from '$lib/services/panelLog.svelte';
	import type { PanelNotice } from '$lib/panel/apply';

	/**
	 * ЖУРНАЛ ПРОХАНЬ — те, заради чого інфодошка й існує.
	 *
	 * Сітка каже, ЩО можна попросити; журнал каже, чого попросили щойно. Одне
	 * без одного не працює: підсвічена комірка зникає з поля зору за секунду, а
	 * звукорежисер у цю секунду дивився на пульт, а не в телефон.
	 *
	 * ## Чому в журналі й СВОЇ дії теж
	 *
	 * Бо журнал відповідає на питання «що тут щойно сталося», а не «хто винен».
	 * Звукорежисер, який сам посунув повзунок і за хвилину дивиться, чому звук
	 * не той, мусить бачити обидві половини картини. Власні рядки позначені
	 * стороною — «табло»: без цього людина шукала б у залі того, хто попросив,
	 * хоч просила вона сама.
	 *
	 * ## Останнє — ЗВЕРХУ, і воно більше за решту
	 *
	 * Бо читають тут одне: що просять ЗАРАЗ. Історія нижче потрібна на випадок
	 * «я відвернувся» і не мусить конкурувати з нею за увагу.
	 *
	 * ## Час показується, а не «щойно»
	 *
	 * Відносний час («10 с тому») довелося б перемальовувати щосекунди — тобто
	 * тримати такт на екрані, який може стояти відкритим цілий вечір. Годинник
	 * відповідає на те саме питання й не рухається.
	 */
	interface Props {
		notices: readonly LogEntry[];
		/**
		 * ВІДПОВІСТИ НА ПРОХАННЯ. Є лише на таблі: у залі відповідати нема на що.
		 *
		 * Три кнопки стоять на ВЕРХНЬОМУ рядку, бо відповідають саме на нього — на
		 * те, що просять зараз. Біля кожного рядка вони перетворили б журнал на
		 * анкету, а відповідь на позавчорашнє прохання нікому не потрібна.
		 */
		onverdict?: (kind: VerdictKind, cell: string, caption: string) => void;
	}

	let { notices, onverdict }: Props = $props();

	/**
	 * ПІДСВІТКУ ВЕРХНЬОГО РЯДКА МОЖНА ПРИБРАТИ — і саме тут, а не на панелі.
	 *
	 * На панелі підсвітка гасне сама за три секунди: там питання «що просять
	 * ЗАРАЗ», і відповідь на нього псується від часу. У журналі вона тримається
	 * скільки завгодно, бо питання інше — «що було останнім», і відповідь на
	 * нього не псується ніколи.
	 *
	 * Але «останнє» і «те, чим я ще займаюся» — різні речі. Звукорежисер, який
	 * прохання вже виконав, лишається з яскравим рядком, що каже «дивись сюди»,
	 * і єдиний спосіб його прибрати — дочекатися наступного прохання. Тому
	 * галочка: вона позначає рядок як опрацьований і НІЧОГО не видаляє — рядок
	 * лишається на місці, тьмяніючи нарівні з рештою.
	 *
	 * Стан тут ЛОКАЛЬНИЙ навмисно: він про те, що прочитала людина біля цього
	 * екрана, а не про дошку. У базі йому не було б чого робити, а сторінці не
	 * довелося б нести ще одне поле заради чужої галочки.
	 */
	const VERDICTS: readonly VerdictKind[] = ['done', 'no', 'wait'];

	let hushed = $state<string | null>(null);

	/*
	 * Підсвічується лише ПРОХАННЯ: рядок «помічник підключено» не питає ні про
	 * що, і відповідати на нього нема чим.
	 */
	const head = $derived(
		notices.length > 0 && notices[0].notice && notices[0].id !== hushed ? notices[0].id : null
	);

	const clock = (at: number) =>
		new Date(at).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});

	/**
	 * Чим саме була дія, коли підпису кнопки немає.
	 *
	 * Слова тут ІНШІ, ніж на самих кнопках, і різниця не косметична: на кнопці
	 * стоїть наказ («Більше»), у журналі — частина речення («загальна
	 * гучність — більше»). Одне слово на два місця дає або наказ посеред
	 * фрази, або кнопку, підписану з малої літери.
	 */
	const moveWord = (move: PanelNotice['move']) => {
		if (move === 'up') return t('panel.wentUp');
		if (move === 'down') return t('panel.wentDown');
		if (move === 'on') return t('panel.turnedOn');
		if (move === 'off') return t('panel.turnedOff');
		return '';
	};
</script>

{#if notices.length === 0}
	<p class="muted" data-testid="panel-log-empty-text">{t('panel.logEmpty')}</p>
{:else}
	<ul class="log" data-testid="panel-log-list">
		{#each notices as notice, index (notice.id)}
			<li
				class="log__row"
				class:log__row--head={head === notice.id}
				data-testid="panel-notice-{index}-row"
			>
				<span class="log__time mono">{clock(notice.at)}</span>
				<!--
					СТОРОНА, ПОТІМ ІМʼЯ — одна вісь, а не дві. Доти тут стояло «сам» АБО
					підпис: перше відповідає на «чия сторона», друге на «хто саме», і
					поруч вони читалися як дві відповіді на одне питання. Мітка спільна
					з журналом аудіодошки, бо питання в обох те саме.
				-->
				<LogWho
					side={notice.own ? t('panelFrom.self') : t('panelFrom.remote')}
					name={notice.who}
					tone={notice.own ? 'own' : 'remote'}
					testid="panel-notice-{index}-who-text"
				/>
				<span class="log__what">
					{#if notice.join}
						{t(`logAct.${notice.join}`)}
					{:else if notice.notice}
						{@const asked = notice.notice}
						{#if asked.caption}
							<strong>{asked.caption}</strong>
						{/if}
						<span>{asked.label ?? moveWord(asked.move)}</span>
						{#if asked.from !== null && asked.to !== null}
							<span class="muted">
								{t('panel.change', { from: `${asked.from}`, to: `${asked.to}` })}
							</span>
						{/if}
					{/if}
				</span>

				{#if head === notice.id}
					<!--
						ВІДПОВІДЬ ЗАРАЗОМ ГАСИТЬ РЯДОК: сказавши «зробив», людина вже
						відповіла на питання «чим я ще займаюся», і вимагати від неї другого
						натискання по галочці було б бюрократією.
					-->
					{#if onverdict}
						<div class="log__answer">
							{#each VERDICTS as answer (answer)}
								<button
									class="log__verdict log__verdict--{answer}"
									type="button"
									onclick={() => {
										if (notice.notice)
											onverdict?.(answer, notice.notice.cell, notice.notice.caption);
										hushed = notice.id;
									}}
									data-testid="panel-verdict-{answer}-btn"
								>
									{t(`verdict.${answer}`)}
								</button>
							{/each}
						</div>
					{/if}

					<button
						class="log__hush"
						type="button"
						title={t('panel.hush')}
						aria-label={t('panel.hush')}
						onclick={() => (hushed = notice.id)}
						data-testid="panel-hush-btn"
					>
						<IconCheck size={16} aria-hidden="true" />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.log {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/*
	 * СТАРІ РЯДКИ ТЬМЯНІЮТЬ — повільно й не до кінця.
	 *
	 * Журнал стоїть відкритим цілий вечір, і всі рядки в ньому однаково яскраві:
	 * прохання, яке щойно прилетіло, виглядає так само, як те, що було годину
	 * тому. Око не має за що зачепитися й мусить читати час у кожному рядку.
	 *
	 * П'ять секунд повної яскравості — це рівно стільки, щоб рядок устигли
	 * побачити. Далі сто секунд плавного згасання до половини: так «щойно»
	 * відрізняється від «нещодавно», а «нещодавно» лишається читабельним —
	 * половина, а не нуль, бо журнал не історія, яку ховають, а картина, за
	 * якою потім розбираються.
	 *
	 * Такт зникає при `prefers-reduced-motion`: рядок лишається яскравим. Це
	 * втрата підказки, а не даних — усе, що вона каже, стоїть у ньому часом.
	 */
	.log__row {
		display: flex;
		align-items: baseline;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		animation: settle 100s linear 5s forwards;
	}

	@keyframes settle {
		to {
			opacity: 0.5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.log__row {
			animation: none;
		}
	}

	/*
	 * Верхній рядок більший і з акцентною смугою збоку: його читають через усю
	 * ширину пульта, іноді не підходячи до екрана.
	 */
	.log__row--head {
		border-color: var(--accent);
		border-inline-start: 4px solid var(--accent);
		font-size: 1.15rem;
	}

	.log__time {
		flex: none;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	/*
	 * Галочка тиха: вона прибирає підсвітку, а не рядок, і не мусить
	 * сперечатися за увагу з тим, що в рядку написано.
	 */
	/*
	 * ТРИ ВІДПОВІДІ — КОЛЬОРАМИ, а не самими словами: їх читають краєм ока, і
	 * зелене-червоне-жовте впізнається швидше за будь-який напис. Слова
	 * лишаються — сам колір каже «щось сталося», а не що саме.
	 */
	.log__answer {
		display: flex;
		flex: none;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		margin-inline-start: auto;
	}

	.log__verdict {
		padding: 2px var(--gap-xs);
		border: 1px solid currentcolor;
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
	}

	.log__verdict--done {
		color: var(--ok);
	}

	.log__verdict--no {
		color: var(--danger);
	}

	.log__verdict--wait {
		color: var(--warn);
	}

	/*
	 * ПІДСВІТКА — ВТОПЛЕНОЮ ПОВЕРХНЕЮ, А НЕ ДОМІШКОЮ САМОЇ КНОПКИ.
	 *
	 * Доти під курсором кнопка отримувала 14% ВЛАСНОГО кольору. Тло при цьому
	 * їде рівно в бік напису — у темній темі світлішає під світло-зеленим, у
	 * світлій темнішає під темно-зеленим, — тобто контраст падає завжди, і
	 * падає він у той самий момент, коли кнопку читають перед натисканням:
	 * 5.20 → 4.20 у темній темі при потрібних 4.5 (`contrast.test.ts`).
	 *
	 * `--bg-sunken` не має цієї вади ні в одній темі й не забирає ознаки типу:
	 * колір лишається в рамці та написі, де він контрасту не псує
	 * (product_criteria/v1 NOTIFICATIONS § 6). Те саме тло на тій самій події
	 * вже стоїть у кнопок закриття (`base.css`).
	 */
	.log__verdict:hover,
	.log__verdict:focus-visible {
		background: var(--bg-sunken);
	}

	.log__hush {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 28px;
		block-size: 28px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.log__hush:hover,
	.log__hush:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.log__what {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--gap-xs);
		min-width: 0;
	}
</style>
