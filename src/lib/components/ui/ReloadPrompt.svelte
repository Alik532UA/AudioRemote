<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * ПРОПОЗИЦІЯ ОНОВИТИСЯ — саме пропозиція, а не оновлення.
	 *
	 * Воркер зареєстрований із `registerType: 'prompt'`, тобто новий стоїть у
	 * `waiting` і не чіпає відкриту вкладку, доки людина не погодиться. Для
	 * цього застосунку це важить більше, ніж деінде: вкладка-приймач — єдине,
	 * що грає звук, і перезавантаження посеред відтворення глушить зал.
	 *
	 * Якщо цей компонент колись перестане показуватися — дивитися треба не сюди,
	 * а в `vite.config.ts`: при `skipWaiting` воркер не чекає ніколи, тож
	 * `needRefresh` не стає `true` жодного разу, і готовий UI стає мертвим кодом.
	 */
	const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
</script>

{#if $needRefresh}
	<div class="reload" role="status" data-testid="reload-prompt">
		<span>{t('reload.ready')}</span>
		<button class="btn btn--primary" onclick={() => updateServiceWorker(true)}>
			{t('reload.apply')}
		</button>
		<button class="btn" onclick={() => needRefresh.set(false)}>{t('reload.later')}</button>
	</div>
{/if}

<style>
	.reload {
		position: fixed;
		inset-inline: 16px;
		bottom: calc(16px + env(safe-area-inset-bottom));
		z-index: 50;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--gap-sm);
		max-width: 520px;
		margin-inline: auto;
		padding: var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
		box-shadow: 0 8px 24px var(--shadow-strong);
	}
</style>
