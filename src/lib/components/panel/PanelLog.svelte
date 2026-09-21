<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconCheck } from '$lib/config/icons';
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
	 * тихою міткою: без неї людина шукала б у залі того, хто попросив, хоч
	 * просила вона сама.
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
		notices: readonly (PanelNotice & { id: string; at: number; own: boolean })[];
	}

	let { notices }: Props = $props();

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
	let hushed = $state<string | null>(null);

	const head = $derived(notices.length > 0 && notices[0].id !== hushed ? notices[0].id : null);

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
				<span class="log__what">
					{#if notice.own}
						<span class="log__own">{t('panel.byHost')}</span>
					{/if}
					{#if notice.caption}
						<strong>{notice.caption}</strong>
					{/if}
					<span>{notice.label ?? moveWord(notice.move)}</span>
					{#if notice.from !== null && notice.to !== null}
						<span class="muted">
							{t('panel.change', { from: `${notice.from}`, to: `${notice.to}` })}
						</span>
					{/if}
				</span>

				{#if head === notice.id}
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
	 * Мітка «сам» — тиха: вона уточнює рядок, а не сперечається з ним. Тому
	 * дрібна рамка кольору тексту, а не акцент і не попередження.
	 */
	.log__own {
		flex: none;
		padding: 0 6px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		font-size: 0.7rem;
	}

	/*
	 * Галочка тиха: вона прибирає підсвітку, а не рядок, і не мусить
	 * сперечатися за увагу з тим, що в рядку написано.
	 */
	.log__hush {
		display: grid;
		flex: none;
		place-items: center;
		margin-inline-start: auto;
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
