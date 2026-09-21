<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { PanelVerdict } from '$lib/net/panelTypes';

	/**
	 * ВІДПОВІДЬ ЗВУКОРЕЖИСЕРА — ЗВЕРХУ ЕКРАНА, і це не смак.
	 *
	 * Помічник тримає планшет у руці й дивиться на сцену; коли він опускає очі,
	 * пальці вже лежать на панелі. Смуга внизу опинилася б під ними, а в
	 * центрі — поверх кнопок, тобто перекривала б рівно те, заради чого екран і
	 * відкритий. Угорі над панеллю вільно завжди.
	 *
	 * ## Три кольори й три слова
	 *
	 * «Зроблено» зелене, «не буде» червоне, «зараз не можу» жовте. Колір
	 * упізнається швидше за напис — але сам по собі він каже лише «щось
	 * сталося», тож слово лишається. Разом із ним лишається й підпис віджета:
	 * між проханням і відповіддю могло минути пів хвилини, і за цей час
	 * помічник міг попросити ще двічі.
	 *
	 * ## Зникає САМА
	 *
	 * Відповідь — новина, а не стан. Смуга, яку треба закрити рукою, коштувала б
	 * одного натискання в темряві щоразу, а висить вона над панеллю.
	 */
	interface Props {
		verdict: PanelVerdict | null;
	}

	let { verdict }: Props = $props();
</script>

{#if verdict}
	<!--
		`aria-live="assertive"`, а не ввічливе `polite`: читалка мусить сказати це
		ПЕРЕБИВАЮЧИ — відповідь прийшла на те, чого людина зараз чекає.
	-->
	<p
		class="toast toast--{verdict.kind}"
		role="status"
		aria-live="assertive"
		data-testid="info-verdict-text"
	>
		{#if verdict.caption}<strong>{verdict.caption}</strong>{/if}
		<span>{t(`verdict.${verdict.kind}Said`)}</span>
	</p>
{/if}

<style>
	.toast {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap-xs);
		margin: 0;
		padding: var(--gap-sm) var(--gap);
		border: 1px solid currentcolor;
		border-radius: var(--radius-sm);
		font-size: 1.05rem;
		font-weight: 600;
		text-align: center;
	}

	.toast--done {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, var(--bg-surface));
	}

	.toast--no {
		color: var(--danger);
		background: color-mix(in oklab, var(--danger) 14%, var(--bg-surface));
	}

	.toast--wait {
		color: var(--warn);
		background: color-mix(in oklab, var(--warn) 14%, var(--bg-surface));
	}
</style>
