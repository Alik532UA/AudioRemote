<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { deriveBoardKey, EmptySecretError } from '$lib/board/boardPath';
	import { normalizeBoardId } from '$lib/board/secret';
	import { listBoards, rememberBoard } from '$lib/board/myBoards';
	import { boardSession } from '$lib/board/session.svelte';
	import { boardExists } from '$lib/net/board';
	import { describeError } from '$lib/net/describeError';
	import { settings } from '$lib/settings/settings.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	let boardId = $state('');
	let password = $state('');
	let remember = $state(true);
	let busy = $state(false);
	let failure = $state<string | null>(null);

	const ready = $derived(boardId.trim().length > 0 && password.trim().length > 0 && !busy);

	/**
	 * ФОРМА ВІДКРИВАЄТЬСЯ НЕ ПОРОЖНЬОЮ.
	 *
	 * На телефоні набрати п'ятизначний ідентифікатор і пароль зі словами — це
	 * півхвилини щовечора заради того самого залу. Названа в налаштуваннях
	 * дошка підставляється цілком; інакше підставляється хоча б ідентифікатор
	 * останньої, до якої підключалися.
	 *
	 * Пароля збереженої дошки тут немає й бути не може: пульт його не зберігає
	 * (див. `myBoards`), а з ключа він не відновлюється за побудовою.
	 */
	onMount(() => {
		settings.load();

		if (settings.startBoard === 'fixed' && settings.startBoardId.trim()) {
			boardId = settings.startBoardId;
			password = settings.startBoardPassword;
			return;
		}

		boardId = listBoards().find((board) => board.role === 'remote')?.id ?? '';
	});

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

<div class="stack stack--auth">
	<form class="card card--auth stack" onsubmit={submit}>
		<h1 class="title">{t('connect.title')}</h1>

		<div class="field">
			<label class="field__label" for="connect-id">{t('connect.idLabel')}</label>
			<input
				id="connect-id"
				class="input mono"
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
	.title {
		font-size: 1.3rem;
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
