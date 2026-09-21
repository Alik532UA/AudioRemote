<!--
	ЖУРНАЛ ОСТАННІХ ДІЙ — окремий компонент, і причина та сама, що в
	`HardResetButton`.

	`SettingsPanel.svelte` перевищує межу розміру й лежить у переліку боргу
	(`structure.test.ts`, ратчет: борг лише скорочується). Журнал — самодостатня
	відповідальність зі власним станом, власним `onMount` і власними стилями,
	тобто саме те, що виносять першим.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { IconCheck } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { currentTrail, previousTrail, trailAsText } from '$lib/services/breadcrumbs';

	let copied = $state(false);
	let trail = $state<{ at: number; step: string }[]>([]);
	let isPrevious = $state(false);

	/** Журнал готовим текстом: у розмітці перенос рядка не записати. */
	const text = $derived(
		trail.map((crumb) => `+${crumb.at}ms  ${crumb.step}`).join(String.fromCharCode(10))
	);

	async function copy() {
		try {
			await navigator.clipboard.writeText(trailAsText());
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* буфер заборонений — журнал видно на екрані */
		}
	}

	onMount(() => {
		/*
		 * Показуємо ПОПЕРЕДНІЙ сеанс, якщо він є: саме він обривається на кроці,
		 * після якого вкладка не вижила. Поточний цікавий лише коли попереднього
		 * немає — тобто нічого не падало.
		 */
		const previous = previousTrail();
		isPrevious = previous.length > 0;
		trail = isPrevious ? previous : currentTrail();
	});
</script>

<details class="trail" data-testid="trail">
	<summary class="trail__toggle">
		{t('settings.trail')}
		{#if isPrevious}· {t('settings.trailHint')}{/if}
	</summary>

	<div class="trail__body">
		{#if trail.length === 0}
			<p class="muted">{t('settings.trailEmpty')}</p>
		{:else}
			<pre class="trail__text mono">{text}</pre>
			<button class="btn" type="button" onclick={copy} data-testid="copy-trail">
				{#if copied}
					<IconCheck size={18} aria-hidden="true" />
					{t('common.copied')}
				{:else}
					{t('common.copy')}
				{/if}
			</button>
		{/if}
	</div>
</details>

<style>
	.trail {
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.trail__toggle {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		list-style-position: inside;
	}

	.trail__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: 0 var(--gap) var(--gap);
	}

	.trail__text {
		max-height: 40dvh;
		margin: 0;
		overflow: auto;
		color: var(--text-secondary);
		font-size: 0.75rem;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
