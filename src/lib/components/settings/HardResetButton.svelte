<!--
	АВАРІЙНЕ СКИДАННЯ — останній засіб, і окремий компонент він не з охайності.

	`SettingsPanel.svelte` уже перевищує межу розміру й лежить у переліку боргу
	(`structure.test.ts`, ратчет: борг лише скорочується). Дописати сюди ще
	тридцять рядків означало б збільшити борг заради кнопки, яку натискають раз
	на рік, — тому вона живе окремо, а панель лише ставить її на місце.
-->
<script lang="ts">
	import { IconTrash } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { hardReset } from '$lib/services/resetService';

	/**
	 * Стан потрібен лише щоб кнопка не спрацювала двічі: прибирання триває
	 * частку секунди, але перезавантаження настає не одразу, і за цей час на
	 * неї встигають натиснути ще раз.
	 */
	let resetting = $state(false);

	async function run() {
		if (resetting) return;

		/*
		 * `confirm()`, а не своє вікно: скидання може знадобитися рівно тоді,
		 * коли зламався рендер, — і тоді власне вікно не намалюється. Текст
		 * через `t()` лишається: словники вантажаться першими й окремо.
		 */
		if (!window.confirm(t('reset.confirm'))) return;

		resetting = true;
		try {
			await hardReset();
		} catch {
			/*
			 * Сюди майже не потрапляємо — `hardReset` ковтає помилки окремих
			 * кроків і однаково перезавантажується. Але якщо не вийшло навіть
			 * це, кнопка мусить ожити: заблокована назавжди вона читається як
			 * «застосунок завис».
			 */
			resetting = false;
		}
	}
</script>

<button
	class="btn btn--danger"
	type="button"
	onclick={run}
	disabled={resetting}
	data-testid="hard-reset-btn"
>
	<IconTrash size={18} aria-hidden="true" />
	{resetting ? t('common.loading') : t('reset.action')}
</button>
<p class="muted">{t('reset.hint')}</p>
