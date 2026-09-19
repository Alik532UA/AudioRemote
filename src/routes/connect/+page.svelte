<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IconBack } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { deriveBoardKey, EmptySecretError } from '$lib/board/boardPath';
	import { normalizeBoardId } from '$lib/board/secret';
	import { rememberBoard } from '$lib/board/myBoards';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardExists } from '$lib/net/board';
	import { describeError } from '$lib/net/describeError';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	let boardId = $state('');
	let password = $state('');
	let remember = $state(true);
	let busy = $state(false);
	let failure = $state<string | null>(null);

	const ready = $derived(boardId.trim().length > 0 && password.trim().length > 0 && !busy);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!ready) return;

		busy = true;
		failure = null;

		try {
			const key = await deriveBoardKey(boardId, password);

			/*
			 * ОДНЕ ПОВІДОМЛЕННЯ НА ДВІ ПРИЧИНИ — і тут це навіть не політика, а
			 * факт: розрізнити «немає такої дошки» й «пароль невірний» неможливо
			 * НАВІТЬ НАМ. Адреса виводиться з обох значень одразу, тож невірний
			 * пароль дає адресу, за якою просто нічого немає.
			 *
			 * Саме через це форма не може стати інструментом перевірки, які дошки
			 * існують, — і це властивість схеми, а не наша обачність.
			 */
			if (!(await boardExists(key))) {
				failure = t('connect.notFound');
				busy = false;
				return;
			}

			const board = {
				key,
				id: normalizeBoardId(boardId),
				name: '',
				role: 'remote' as const
			};
			// Пароль НЕ зберігається: ключа досить, щоб зайти, а зберігати чужий
			// пароль на чужому телефоні немає жодної причини.
			if (remember) rememberBoard(board);
			boardSession.open(board);
			await goto(resolve('/remote'));
		} catch (error) {
			busy = false;
			// Порожній секрет — це не відмова бази, а незаповнена форма: людині
			// треба сказати те саме, що й про невірний пароль.
			if (error instanceof EmptySecretError) failure = t('connect.notFound');
			else failure = t(describeError(error));
		}
	}
</script>

<div class="stack">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	<form class="card card--auth stack" onsubmit={submit}>
		<h1 class="title">{t('connect.title')}</h1>

		<div class="field">
			<label class="field__label" for="connect-id">{t('connect.idLabel')}</label>
			<input
				id="connect-id"
				class="field__input mono"
				type="text"
				bind:value={boardId}
				maxlength="16"
				autocapitalize="characters"
				autocorrect="off"
				spellcheck="false"
				inputmode="text"
				data-testid="connect-id"
			/>
		</div>

		<PasswordField id="connect-password" label={t('connect.passwordLabel')} bind:value={password} />

		<label class="check">
			<input type="checkbox" bind:checked={remember} data-testid="connect-remember" />
			<span>{t('connect.remember')}</span>
		</label>

		{#if failure}
			<p class="error" role="alert" data-testid="connect-error">{failure}</p>
		{/if}

		<button
			class="btn btn--primary btn--block"
			type="submit"
			disabled={!ready}
			data-testid="connect-submit"
		>
			{busy ? t('connect.searching') : t('connect.submit')}
		</button>
	</form>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		align-self: start;
		min-height: var(--tap);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.back:hover {
		color: var(--accent);
	}

	.title {
		font-size: 1.3rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.field__label {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.field__input {
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-input);
		font-size: 1.1rem;
	}

	.field__input:focus-visible {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
		outline: none;
	}

	.check {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		min-height: var(--tap);
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.check input {
		width: 20px;
		height: 20px;
	}
</style>
