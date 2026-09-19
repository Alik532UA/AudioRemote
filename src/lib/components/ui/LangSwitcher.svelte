<script lang="ts">
	import { i18n, LOCALES, t, type Locale } from '$lib/i18n/i18n.svelte';

	const LABELS: Record<Locale, string> = { uk: 'UK', en: 'EN' };
</script>

<div class="langs" role="group" aria-label={t('lang.group')}>
	{#each LOCALES as locale (locale)}
		<button
			type="button"
			class="langs__btn"
			class:langs__btn--active={i18n.locale === locale}
			aria-pressed={i18n.locale === locale}
			data-testid="lang-{locale}"
			onclick={() => i18n.set(locale)}
		>
			{LABELS[locale]}
		</button>
	{/each}
</div>

<style>
	.langs {
		display: flex;
		gap: var(--gap-xs);
	}

	.langs__btn {
		min-height: var(--tap);
		min-width: var(--tap);
		border: 2px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.langs__btn:hover,
	.langs__btn:focus-visible {
		border-color: var(--accent);
	}

	.langs__btn--active {
		border-color: var(--accent);
		color: var(--text-primary);
	}
</style>
