<script lang="ts">
	import { tidOf, type BetaCheck } from '$lib/beta/checks';
	import { betaMarks, type Vote } from '$lib/beta/marks.svelte';

	interface Props {
		check: BetaCheck;
		number: number;
		lang: 'uk' | 'en';
	}

	let { check, number, lang }: Props = $props();

	const tid = $derived(tidOf(check.id));
	const mark = $derived(betaMarks.fresh(check.id));
	const isStale = $derived(betaMarks.stale(check.id));

	const say = (uk: string, en: string) => (lang === 'uk' ? uk : en);

	const voteName = (vote: Vote) =>
		({
			ok: say('Працює', 'Works'),
			fail: say('Не працює', 'Broken'),
			unclear: say('Не зрозуміло', 'Unclear'),
			skip: say('Пропустити', 'Skip')
		})[vote];
</script>

<li
	class="beta__item"
	class:beta__item--marked={mark !== null}
	class:beta__item--ok={mark?.vote === 'ok'}
	class:beta__item--fail={mark?.vote === 'fail'}
	class:beta__item--unclear={mark?.vote === 'unclear'}
	class:beta__item--skip={mark?.vote === 'skip'}
	data-testid="beta-check-{tid}-item"
>
	<p class="beta__text" data-testid="beta-check-{tid}-text">
		<span class="beta__no">{number}.</span>
		<span class="beta__cat" data-testid="beta-check-{tid}-category-text"
			>{check.category[lang]}</span
		>
		{check.text[lang]}
	</p>

	{#if check.test}
		<p class="beta__test mono">{check.test}</p>
	{/if}
	{#if isStale}
		<p class="beta__stale" data-testid="beta-check-{tid}-stale-hint">
			{say('Позначено на іншій версії', 'Marked on another version')}
		</p>
	{/if}

	<div class="beta__votes">
		{#each ['ok', 'fail', 'unclear', 'skip'] as const as vote (vote)}
			<button
				type="button"
				class="beta__vote beta__vote--{vote}"
				class:beta__vote--on={mark?.vote === vote}
				aria-pressed={mark?.vote === vote}
				onclick={() => betaMarks.vote(check.id, vote)}
				data-testid="beta-vote-{tid}-{vote}-btn"
			>
				{voteName(vote)}
			</button>
		{/each}
	</div>
</li>

<style>
	.beta__item {
		color-scheme: light dark;
		--vote-ok: light-dark(#047857, #10b981);
		--vote-fail: light-dark(#b01818, #fb8a8a);
		--vote-unclear: light-dark(#a34d08, #f59e0b);
		--vote-skip: light-dark(#0284c7, #38bdf8);
		padding: var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
	}
	.beta__item--marked {
		border-width: 2px;
	}
	.beta__item--ok {
		border-color: var(--vote-ok);
	}
	.beta__item--fail {
		border-color: var(--vote-fail);
	}
	.beta__item--unclear {
		border-color: var(--vote-unclear);
	}
	.beta__item--skip {
		border-color: var(--vote-skip);
	}

	.beta__text {
		margin: 0 0 var(--gap-xs);
	}

	.beta__no {
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.beta__cat {
		margin-inline-end: var(--gap-xs);
		font-weight: 600;
	}

	.beta__test,
	.beta__stale {
		margin: 0 0 var(--gap-xs);
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.beta__votes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.beta__vote {
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: var(--text-secondary);
		cursor: pointer;
		font: inherit;
	}
	.beta__vote--ok {
		background: color-mix(in srgb, var(--bg-surface), var(--vote-ok) 8%);
		border-color: color-mix(in srgb, var(--border-strong), var(--vote-ok) 35%);
	}
	.beta__vote--fail {
		background: color-mix(in srgb, var(--bg-surface), var(--vote-fail) 8%);
		border-color: color-mix(in srgb, var(--border-strong), var(--vote-fail) 35%);
	}
	.beta__vote--unclear {
		background: color-mix(in srgb, var(--bg-surface), var(--vote-unclear) 8%);
		border-color: color-mix(in srgb, var(--border-strong), var(--vote-unclear) 35%);
	}
	.beta__vote--skip {
		background: color-mix(in srgb, var(--bg-surface), var(--vote-skip) 8%);
		border-color: color-mix(in srgb, var(--border-strong), var(--vote-skip) 35%);
	}
	.beta__vote--on {
		border-width: 4px;
		font-weight: 700;
	}
	.beta__vote--ok.beta__vote--on {
		border-color: var(--vote-ok);
		color: var(--vote-ok);
		background: color-mix(in srgb, var(--bg-surface), var(--vote-ok) 18%);
	}
	.beta__vote--fail.beta__vote--on {
		border-color: var(--vote-fail);
		color: var(--vote-fail);
		background: color-mix(in srgb, var(--bg-surface), var(--vote-fail) 18%);
	}
	.beta__vote--unclear.beta__vote--on {
		border-color: var(--vote-unclear);
		color: var(--vote-unclear);
		background: color-mix(in srgb, var(--bg-surface), var(--vote-unclear) 18%);
	}
	.beta__vote--skip.beta__vote--on {
		border-color: var(--vote-skip);
		color: var(--vote-skip);
		background: color-mix(in srgb, var(--bg-surface), var(--vote-skip) 18%);
	}
</style>
