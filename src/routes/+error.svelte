<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * СТОРІНКА ПОМИЛКИ — щоб замість неї не було білого аркуша.
	 *
	 * Доти будь-яка помилка навігації — невідома адреса, відмова `load` —
	 * лишала порожню сторінку без жодного напису. Вийти з неї можна було хіба
	 * що кнопкою браузера, а у встановленому застосунку, де тієї кнопки немає,
	 * не можна було взагалі (ERROR-HANDLING-v9 § 2.2).
	 *
	 * `page` береться з `$app/state`: стор `$page` застарілий із SvelteKit 2.12.
	 *
	 * Версія збірки стоїть тут не для краси: перше питання до будь-якого звіту —
	 * «яку збірку ви бачили» (VERSIONING-v9 § 3), а ця сторінка якраз і є тим
	 * місцем, звідки звіт пишуть.
	 */

	/*
	 * 404 — НЕ ПОЛОМКА, і називати його «сторінка зламалася» означає відправити
	 * людину шукати несправність там, де її немає. У застосунку без серверного
	 * рантайму невідома адреса приходить сюди тим самим шляхом, що й справжня
	 * відмова, тож розрізняє їх лише код.
	 */
	const title = $derived(page.status === 404 ? t('error.notFound') : t('error.crashTitle'));
</script>

<div class="fail" data-testid="error-page">
	<p class="fail__code mono">{page.status}</p>
	<h1 class="fail__title">{title}</h1>

	{#if page.error?.message}
		<p class="fail__detail mono" data-testid="error-detail">{page.error.message}</p>
	{/if}

	<a class="btn" href={resolve('/menu')} data-testid="error-to-menu">{t('error.toMenu')}</a>

	<p class="fail__version mono">{__APP_VERSION__}</p>
</div>

<style>
	.fail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap);
		padding: var(--gap-lg) var(--gap);
		text-align: center;
	}

	.fail__code {
		margin: 0;
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.fail__title {
		margin: 0;
		font-size: 1.3rem;
	}

	.fail__detail {
		margin: 0;
		max-width: 60ch;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	.fail__version {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>
