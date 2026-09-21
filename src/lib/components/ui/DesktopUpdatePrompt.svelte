<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import { checkDesktopUpdate, type DesktopUpdate } from '$lib/services/desktopUpdate';

	/**
	 * ПРОПОЗИЦІЯ ПОСТАВИТИ НОВУ ОБОЛОНКУ — і чому вона окрема від
	 * `ReloadPrompt`.
	 *
	 * Той компонент оновлює СТОРІНКУ: новий service worker уже завантажений,
	 * перезавантаження триває мить. Цей — ВСТАНОВЛЕНИЙ ЗАСТОСУНОК: інсталятор
	 * закриває вікно й відкриває заново, тобто звук у залі зникає на кілька
	 * секунд. Сплутати їх коштує зірваного заняття, тому текст інший і попе-
	 * редження про тишу стоїть прямо в панелі.
	 *
	 * ## Чому перевірка одна на запуск, а не за розкладом
	 *
	 * Оболонка міняється рідко — від правки `remote.urls` до правки дозволів,
	 * тобто кілька разів на рік. Опитувати GitHub раз на пів години заради
	 * цього нема сенсу, а перевірка при старті потрапляє саме туди, куди треба:
	 * плеєр відкривають зранку перед заняттями.
	 *
	 * ## Чому «не зараз» не запам'ятовується
	 *
	 * Бо наступний запуск — це наступний день, і питання доречне знову. Стан
	 * «відмовився назавжди» тут означав би застосунок, який ніколи не
	 * оновиться, і дізнатися про це не було б звідки.
	 */
	let update = $state<DesktopUpdate>({ kind: 'unavailable', reason: 'ще не перевіряли' });
	let installing = $state(false);
	let failed = $state(false);

	onMount(() => {
		// Без `await` у тілі `onMount`: воно мусить повернути функцію прибирання
		// або нічого, а не проміс.
		void checkDesktopUpdate().then((result) => {
			update = result;
		});
	});

	async function apply() {
		if (update.kind !== 'ready' || installing) return;
		installing = true;
		failed = false;
		try {
			await update.install();
		} catch {
			/*
			 * Мовчазна відмова читалася б як «оновив»: вікно лишається тим
			 * самим, і людина вважає, що версія нова. Тому кнопка повертається
			 * в робочий стан, а поруч лишається слід.
			 */
			installing = false;
			failed = true;
		}
	}
</script>

{#if update.kind === 'ready'}
	<div class="shell-update" role="status" data-testid="shell-update-banner">
		<div class="shell-update__text">
			<span>{t('shell.ready', { version: update.version })}</span>
			<small>{t('shell.warning')}</small>
		</div>
		<div class="shell-update__actions">
			<button
				class="btn btn--primary"
				type="button"
				disabled={installing}
				onclick={apply}
				data-testid="shell-update-apply-btn"
			>
				{installing ? t('common.loading') : t('shell.apply')}
			</button>
			<button
				class="btn"
				type="button"
				onclick={() => (update = { kind: 'none' })}
				data-testid="shell-update-later-btn"
			>
				{t('shell.later')}
			</button>
		</div>
		{#if failed}
			<small class="shell-update__failed" data-testid="shell-update-error">
				{t('shell.failed')}
			</small>
		{/if}
	</div>
{/if}

<style>
	.shell-update {
		position: fixed;
		inset-inline: 16px;
		bottom: calc(16px + env(safe-area-inset-bottom));
		z-index: 51;
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

	.shell-update__text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: center;
	}

	.shell-update__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.shell-update__failed {
		flex-basis: 100%;
		text-align: center;
		color: var(--danger);
	}
</style>
