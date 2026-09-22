<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';
	import type { RepeatMode } from '$lib/audio/boardConfig';
	import type { PlayerController } from '$lib/player/controller.svelte';

	/**
	 * ЩО РОБИТИ ПІСЛЯ ТРЕКУ — два органи й один рядок пояснення.
	 *
	 * Стоїть на деці, під кнопками керування: питання «а що заграє далі»
	 * виникає саме там, де дивляться, що грає зараз. У налаштуваннях застосунку
	 * йому не місце — це властивість ЦІЄЇ програми, і живе вона у файлі поруч
	 * із музикою, а не в браузері.
	 *
	 * ## Чому два органи, а не один список із чотирьох станів
	 *
	 * Бо це два різні питання. «Переходити далі» — про те, чи дошка грає сама.
	 * «Повторювати» — про те, де закінчується програма. Зліплені в один список
	 * («зупинятися / далі / далі по колу / крутити трек»), вони читаються як
	 * шкала, якою не є: «крутити трек» не «більше», ніж «далі по колу».
	 *
	 * ## Мертва пара названа вголос
	 *
	 * «Повторювати список» при вимкненому переході не робить нічого — рухатися
	 * нема чому. Замість того щоб гасити варіант (погашене питає «чому мені не
	 * можна»), під ним зʼявляється рядок, який каже це прямо.
	 */
	interface Props {
		controller: PlayerController;
	}

	let { controller }: Props = $props();

	const MODES: readonly RepeatMode[] = ['none', 'all', 'one'];

	/** Обраний режим ні на що не впливає — сказати про це, а не приховати. */
	const idle = $derived(controller.play.repeat === 'all' && !controller.play.autoNext);
</script>

<section class="policy" data-testid="playback-policy-section">
	<Switch
		checked={controller.play.autoNext}
		label={t('player.autoNext')}
		testid="auto-next"
		onchange={(next) => controller.setPlay({ autoNext: next })}
	/>

	<Picker
		row
		label={t('player.repeatTitle')}
		value={controller.play.repeat}
		prefix="repeat"
		options={MODES.map((mode) => ({
			value: mode,
			label: t(`repeat.${mode}`)
		}))}
		onpick={(next) => controller.setPlay({ repeat: next as RepeatMode })}
	/>

	{#if idle}
		<p class="muted policy__note" data-testid="repeat-idle-text">{t('player.repeatIdle')}</p>
	{/if}
</section>

<style>
	.policy {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding-top: var(--gap-sm);
		border-top: 1px solid var(--border);
	}

	.policy__note {
		font-size: 0.8rem;
	}
</style>
