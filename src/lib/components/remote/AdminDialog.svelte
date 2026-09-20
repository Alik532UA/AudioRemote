<script lang="ts">
	import { IconClose } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	interface Props {
		/** `false` — пароль не підійшов. Вікно лишається відкритим. */
		onenter: (password: string) => Promise<boolean>;
		onclose: () => void;
	}

	let { onenter, onclose }: Props = $props();

	/**
	 * ВХІД У РЕЖИМ АДМІНІСТРАТОРА — окреме вікно, а не поле десь у кутку.
	 *
	 * Це підвищення прав, і виглядати воно мусить як окремий крок: людина з
	 * пультом у руках зазвичай просто вмикає музику, а сюди заходить раз на
	 * тиждень — змінити налаштування, не йдучи до самого комп'ютера.
	 *
	 * Пароль перевіряє БАЗА, а не цей код: правильний пароль дає адресу каналу,
	 * за якою щось є, неправильний — адресу, за якою немає нічого. Тому й
	 * повідомлення про невдачу одне на два випадки — пароль не той або
	 * адміністратора не вмикали зовсім. Розрізнити їх звідси неможливо за
	 * побудовою, і вигадувати різницю було б брехнею.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	let password = $state('');
	let busy = $state(false);
	let wrong = $state(false);

	$effect(() => {
		node?.showModal();
	});

	async function submit() {
		if (password.trim().length === 0 || busy) return;
		busy = true;
		wrong = !(await onenter(password));
		busy = false;
	}
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="admin-dialog"
	{onclose}
	onclick={(event) => {
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t('admin.title')}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="admin-dialog-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<p class="muted">{t('admin.askPassword')}</p>

		<!--
			Форма, а не просто поле з кнопкою: пароль набирають на телефоні, і
			«Enter» там — це кнопка на самій клавіатурі. Без форми вона не робила б
			нічого, і людина тиснула б її двічі, перш ніж шукати кнопку на екрані.
		-->
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<PasswordField
				id="admin-enter"
				label={t('admin.password')}
				bind:value={password}
				autocomplete="current-password"
			/>

			{#if wrong}
				<p class="error" role="alert" data-testid="admin-wrong">{t('admin.wrong')}</p>
			{/if}

			<button
				class="btn btn--primary btn--block"
				type="submit"
				disabled={password.trim().length === 0 || busy}
				data-testid="admin-enter-submit"
			>
				{t('admin.enter')}
			</button>
		</form>
	</div>
</dialog>

<style>
	.dialog {
		width: min(420px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow: hidden;
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
		max-height: calc(100dvh - 48px);
		overflow: auto;
		padding: var(--gap);
	}

	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		margin: 0;
		font-size: 1.1rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
	}
</style>
