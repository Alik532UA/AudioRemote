<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import { CHECK_EVERY_MS, createUpdateSchedule } from '$lib/services/updateCheck';

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
	/**
	 * ПИТАТИ ДОВОДИТЬСЯ САМИМ.
	 *
	 * Браузер перевіряє воркер лише на навігації, а приймач відкривають зранку
	 * й не чіпають до вечора — навігації немає жодної. Без цих трьох підписок
	 * пропозиція оновитися не з'являлася б ніколи, і в залі грала б збірка
	 * тижневої давнини.
	 *
	 * Коли саме питати — вирішує `updateCheck`, і саме там це перевірено
	 * тестами: повернення до вкладки піднімає і `visibilitychange`, і `focus`,
	 * тож без спільного проміжку одне переключення вікна дає два запити.
	 */
	let timer: ReturnType<typeof setInterval> | null = null;
	let unwatch: (() => void) | null = null;

	const { needRefresh, updateServiceWorker } = useRegisterSW({
		immediate: true,
		onRegisteredSW(_url, registration) {
			if (!registration) return;

			const schedule = createUpdateSchedule({
				now: () => Date.now(),
				online: () => navigator.onLine !== false,
				// Мережа падає — це не подія для людини: пропозиція просто не
				// з'явиться, а наступний тік спробує знову.
				update: () => void registration.update().catch(() => {})
			});

			timer = setInterval(() => schedule.tick(), CHECK_EVERY_MS);

			const onReturn = () => {
				if (document.visibilityState === 'visible') schedule.tick();
			};
			document.addEventListener('visibilitychange', onReturn);
			window.addEventListener('focus', onReturn);
			unwatch = () => {
				document.removeEventListener('visibilitychange', onReturn);
				window.removeEventListener('focus', onReturn);
			};
		}
	});

	onDestroy(() => {
		if (timer !== null) clearInterval(timer);
		timer = null;
		unwatch?.();
		unwatch = null;
	});
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
