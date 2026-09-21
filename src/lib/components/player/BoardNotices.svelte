<script lang="ts">
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { IconWarning } from '$lib/config/icons';
	import type { PlayerController } from '$lib/player/controller.svelte';

	/**
	 * ТРИ МОВЧАЗНІ ВІДМОВИ, які раніше було видно лише на чужому екрані.
	 *
	 * Усі три зроблені з однієї помилки: щось не вийшло, а сторінка виглядає
	 * бездоганно. База не відповідає — SDK тримає запис у локальній черзі й не
	 * скаржиться. Правила відкинули бібліотеку — єдиним слідом був напис «на
	 * плеєрі ще не обрано папку» на ПУЛЬТІ, і причину тричі шукали в папці, хоч
	 * папка обрана й список на місці. Тека відкрита лише на читання —
	 * налаштування не зберігаються, і про це дізнаються наступного дня.
	 *
	 * Разом, бо це один рід повідомлення: «те, що ти зробив, не доїхало». Кожне
	 * з них мусить стояти НАД списком, а не всередині гілки «папку обрано»: до
	 * бази папка стосунку не має.
	 */
	interface Props {
		controller: PlayerController;
	}

	let { controller }: Props = $props();
</script>

{#if controller.dbOffline}
	<p class="note note--warn" data-testid="db-offline">
		<IconWarning size={18} aria-hidden="true" />
		<span>{t('player.dbOffline')}</span>
	</p>
{/if}

{#if controller.libraryTrouble}
	<p class="note note--warn" role="alert" data-testid="library-denied">
		<IconWarning size={18} aria-hidden="true" />
		<span>{t(controller.libraryTrouble as TranslationKey)}</span>
	</p>
{/if}

{#if controller.sourceStatus !== 'none' && controller.supported && !controller.configWritable}
	<p class="note note--warn" data-testid="config-readonly">
		<IconWarning size={18} aria-hidden="true" />
		<span>{t('player.configReadonly')}</span>
	</p>
{/if}
