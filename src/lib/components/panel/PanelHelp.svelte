<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconDown, IconUp } from '$lib/config/icons';
	import { readItem, writeItem } from '$lib/services/storage';

	/**
	 * ЯК ПРАЦЮЄ СКЛАДАЛЬНИК — збоку від нього, а не над ним.
	 *
	 * Три абзаци пояснення стояли в колонці складальника, над самою сіткою, і
	 * коштували їй третини висоти: колонка переставала вміщатися в екран, і
	 * сітку — те єдине, задля чого сюди заходять, — доводилося прокручувати.
	 * Сусідня колонка в цьому режимі при цьому майже порожня: у ній картка
	 * дошки й гучність привертання уваги, і більше нічого.
	 *
	 * ## ЗГОРТАЄТЬСЯ Й ПАМʼЯТАЄ
	 *
	 * Текст відповідає на питання, яке ставлять ОДИН РАЗ: що тут робити.
	 * Панель складають раз на сезон, а заходять правити її частіше — і
	 * вдесяте той самий абзац уже не пояснення, а перешкода. Вибір
	 * зберігається, бо це вибір про ЛЮДИНУ, а не про візит: хто прочитав,
	 * прочитав назавжди.
	 *
	 * Типово РОЗГОРНУТО: ціна зайвого абзацу для того, хто вже знає, — одне
	 * натискання; ціна схованого пояснення для того, хто не знає, — порожній
	 * екран без підказки, що з ним робити.
	 */

	const OPEN_KEY = 'panel.helpOpen';
	let open = $state(readItem(OPEN_KEY) !== 'no');
</script>

<section class="card stack" data-testid="panel-help-section">
	<div class="head">
		<h2 class="subtitle">{t('panel.helpTitle')}</h2>

		<button
			class="fold"
			type="button"
			aria-expanded={open}
			title={open ? t('panel.helpHide') : t('panel.helpShow')}
			aria-label={open ? t('panel.helpHide') : t('panel.helpShow')}
			onclick={() => {
				open = !open;
				writeItem(OPEN_KEY, open ? 'yes' : 'no');
			}}
			data-testid="panel-help-fold-btn"
		>
			{#if open}
				<IconUp size={18} aria-hidden="true" />
			{:else}
				<IconDown size={18} aria-hidden="true" />
			{/if}
		</button>
	</div>

	{#if open}
		<p class="muted">{t('panel.editHint')}</p>
		<p class="muted">{t('panel.dragHint')}</p>
		<p class="muted">{t('panel.boardSizeHint')}</p>
	{/if}
</section>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.subtitle {
		font-size: 1.05rem;
	}

	/* Та сама тиха стрілка, що й у журналі: питання про показ, а не про вміст. */
	.fold {
		display: grid;
		place-items: center;
		inline-size: var(--tap);
		block-size: var(--tap);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.fold:hover,
	.fold:focus-visible {
		background: var(--bg-sunken);
		color: var(--text-primary);
	}
</style>
