<script lang="ts">
	import { IconClose, IconPower } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		/** Спробувати озброїтися. `false` — браузер відмовив, вікно лишається. */
		onarm: () => Promise<boolean>;
		/** Людина закрила вікно, не вмикаючи звук. */
		ondismiss: () => void;
	}

	let { onarm, ondismiss }: Props = $props();

	/**
	 * ПРОХАННЯ ВВІМКНУТИ ЗВУК — ОКРЕМЕ ВІКНО, а не картка в колонці.
	 *
	 * Це разова дія, і доки її не зроблено, дошка не грає взагалі: жодна інша
	 * кнопка на екрані не дасть результату. Картка серед решти карток казала
	 * протилежне — що це одна з кількох рівних речей, які можна зробити, а можна
	 * й ні. Вікно поверх сторінки каже правду: спершу це.
	 *
	 * Закрити його все одно можна. Зачиняти людину в модальному вікні заради
	 * дозволу, який однаково видасться при першому ж натисканні на трек (див.
	 * `playLocal`), означало б вимагати обряд заради обряду.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	let refused = $state(false);

	$effect(() => {
		node?.showModal();
	});
</script>

<dialog bind:this={node} class="arm" data-testid="arm-dialog" onclose={ondismiss}>
	<div class="arm__body">
		<header class="arm__head">
			<h2 class="arm__title">{t('player.arm')}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="arm-dialog-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<p class="muted">{t('player.armHint')}</p>

		{#if refused}
			<p class="error" role="alert" data-testid="arm-refused">{t('player.armRefused')}</p>
		{/if}

		<button
			class="btn btn--primary arm__btn"
			type="button"
			onclick={async () => {
				refused = !(await onarm());
			}}
			data-testid="arm"
		>
			<IconPower size={22} aria-hidden="true" />
			{t('player.arm')}
		</button>
	</div>
</dialog>

<style>
	.arm {
		width: min(420px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.arm::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.arm__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		padding: var(--gap-lg);
	}

	.arm__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.arm__title {
		font-size: 1.1rem;
	}

	.arm__btn {
		min-height: 64px;
		font-size: 1.1rem;
		/* Підпис переноситься: `.btn` тримає `nowrap`, а вікно буває вузьким. */
		white-space: normal;
	}
</style>
