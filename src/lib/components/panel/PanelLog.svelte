<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { PanelNotice } from '$lib/panel/apply';

	/**
	 * ЖУРНАЛ ПРОХАНЬ — те, заради чого інфодошка й існує.
	 *
	 * Сітка каже, ЩО можна попросити; журнал каже, чого попросили щойно. Одне
	 * без одного не працює: підсвічена комірка зникає з поля зору за секунду, а
	 * звукорежисер у цю секунду дивився на пульт, а не в телефон.
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
		notices: readonly (PanelNotice & { id: string; at: number })[];
	}

	let { notices }: Props = $props();

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
				class:log__row--head={index === 0}
				data-testid="panel-notice-{index}-row"
			>
				<span class="log__time mono">{clock(notice.at)}</span>
				<span class="log__what">
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

	.log__row {
		display: flex;
		align-items: baseline;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
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

	.log__what {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--gap-xs);
		min-width: 0;
	}
</style>
