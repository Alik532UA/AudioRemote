<script lang="ts">
	import { IconFolder, IconRefresh } from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import type { PlayerController } from '$lib/player/controller.svelte';

	/**
	 * ШАПКА СПИСКУ: яка папка, скільки в ній треків і дві дії над нею.
	 *
	 * Смуга на всю ширину картки — відʼємні відступи рівно на її падінг плюс
	 * лінія знизу (`.folder` у `base.css`, спільна з пультом). Звичайним написом
	 * назва відділялася від списку тим самим проміжком, що й будь-які два
	 * сусіди, і читалася як ще один вміст, а не як заголовок того, що під нею.
	 *
	 * ОДИН РЯДОК: назва папки, поруч меншим — скільки в ній треків. Два рядки
	 * давали шапці вагу, якої вона не варта: це одна відповідь на одне питання
	 * «що це за список». Назва стоїть першою, бо саме її шукають очима;
	 * лічильник — уточнення, тому й менший.
	 */
	interface Props {
		controller: PlayerController;
		/** Відкрити перелік прихованих. Лічильник і Є входом — див. нижче. */
		onhidden: () => void;
		/** Обрати іншу папку. Через попередження, а не прямо в системний діалог. */
		onpick: () => void;
	}

	let { controller, onhidden, onpick }: Props = $props();
</script>

<div class="folder">
	<IconFolder size={18} aria-hidden="true" />
	<div class="folder__text">
		<span class="folder__name">{controller.folderName}</span>
		<span class="folder__count">
			{#if controller.scanning}
				{t('player.scanning')}
			{:else}
				{plural(
					{ one: 'player.tracksOne', few: 'player.tracksFew', other: 'player.tracksMany' },
					controller.entries.length
				)}
				{#if controller.hiddenCount > 0}
					·
					<!--
						Лічильник І Є входом. Трек, прихований від усіх, зникає зі списку
						повністю, тож іншого шляху повернути його не існує — а стан, з
						якого немає виходу, це не стан.
					-->
					<button
						class="folder__hidden"
						type="button"
						title={t('player.hiddenOpen')}
						onclick={onhidden}
						data-testid="open-hidden"
					>
						{t('player.hiddenCount', { count: controller.hiddenCount })}
					</button>
				{/if}
			{/if}
		</span>
	</div>
	<div class="folder__tools">
		<button
			class="icon-btn"
			type="button"
			title={t('player.rescan')}
			aria-label={t('player.rescan')}
			onclick={() => controller.rescan()}
			data-testid="rescan"
		>
			<IconRefresh size={16} aria-hidden="true" />
		</button>
		<button
			class="icon-btn"
			type="button"
			title={t('player.changeFolder')}
			aria-label={t('player.changeFolder')}
			onclick={onpick}
			data-testid="change-folder"
		>
			<IconFolder size={16} aria-hidden="true" />
		</button>
	</div>
</div>

<style>
	/* Решта смуги — у `base.css`: ту саму шапку показує й пульт. */
	.folder__hidden {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.folder__hidden:hover,
	.folder__hidden:focus-visible {
		color: var(--text-primary);
		text-decoration-style: solid;
	}
</style>
