<script lang="ts">
	import { IconWarning } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		onleave: () => void;
		onstay: () => void;
	}

	let { onleave, onstay }: Props = $props();

	/**
	 * ПОПЕРЕДЖЕННЯ ПРО ВИХІД — ЛИШЕ ТАМ, ДЕ ВИХІД СПРАВДІ ЩОСЬ КОШТУЄ.
	 *
	 * У браузері дозвіл на папку живе рівно доти, доки живе сторінка приймача.
	 * Пішли — і повернення означає «оберіть папку з музикою» та порожній список,
	 * хоч людина нічого не міняла. Це не наша недбалість, а межа браузера
	 * (PROJECT-CONTEXT § 5.0), і сказати про неї треба ДО виходу: після нього
	 * пояснення вже нічого не змінює.
	 *
	 * У застосунку на комп'ютері вікна немає взагалі: там папка пам'ятається, і
	 * попереджати нема про що. Питання не в тому, «веб чи застосунок», а в тому,
	 * чи втрачається доступ, — і саме так це й перевіряється на місці виклику.
	 */
	let node = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		node?.showModal();
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="leave-dialog"
	onclose={onstay}
	onclick={(event) => {
		// Клік по затемненню — це «лишитися»: вихід підтверджують кнопкою.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<h2 class="dialog__title">
			<IconWarning size={20} aria-hidden="true" />
			{t('player.leaveTitle')}
		</h2>
		<p>{t('player.leaveText')}</p>

		<div class="row">
			<button
				class="btn btn--primary"
				type="button"
				onclick={() => node?.close()}
				data-testid="leave-stay"
			>
				{t('player.leaveStay')}
			</button>
			<button class="btn" type="button" onclick={onleave} data-testid="leave-go">
				{t('player.leaveGo')}
			</button>
		</div>
	</div>
</dialog>

<style>
	.dialog {
		width: min(440px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		padding: var(--gap-lg);
	}

	.dialog__title {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		font-size: 1.1rem;
		color: var(--warn);
	}
</style>
