<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { deriveBoardKey, EmptySecretError, isBoardKey } from '$lib/board/boardPath';
	import { normalizeBoardId } from '$lib/board/secret';
	import { listBoards, rememberBoard } from '$lib/board/myBoards';
	import { boardSession } from '$lib/board/session.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import { boardExists } from '$lib/net/board';
	import { describeError } from '$lib/net/describeError';
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
	 * На телефоні набрати пʼятизначний ідентифікатор — це півхвилини щовечора
	 * заради того самого залу, тож підставляється ідентифікатор останньої
	 * дошки, до якої підключалися.
	 *
	 * Пароля тут немає й бути не може: пульт його не зберігає (див.
	 * `myBoards`), а з ключа він не відновлюється за побудовою. Названу в
	 * налаштуваннях пару сюди теж не беремо — вона належить сторінкам, які
	 * дошку відкривають, а ця форма її саме шукає.
	 */
	onMount(() => {
		/*
		 * ПОСИЛАННЯ НЕСЕ АДРЕСУ ДОШКИ, А НЕ ПАРОЛЬ.
		 *
		 * Пульту пароль не потрібен ніколи: увійти досить за ключем, бо ключ і є
		 * адреса. Тому тут його й не питають — і пароль не покидає комп'ютера,
		 * що особливо важить при сталій парі в налаштуваннях: там один пароль
		 * відкриває всі дошки.
		 *
		 * Ключ приїжджає у ФРАГМЕНТІ, після `#`: браузер серверу його не
		 * надсилає ніколи — ні в журнал хостингу, ні в проксі, ні в `Referer`.
		 * Лишалася б історія браузера, тому фрагмент стирається з адреси
		 * відразу, як його прочитали.
		 *
		 * Названо прямо: ключ ВІДКРИВАЄ дошку. Хто отримав посилання, той
		 * усередині — інакше «одне натискання» неможливе за побудовою.
		 */
		const fromLink = new URLSearchParams(window.location.hash.slice(1));
		const linkedKey = fromLink.get('k');
		const linkedId = fromLink.get('id');

		if (linkedKey && isBoardKey(linkedKey)) {
			history.replaceState(null, '', window.location.pathname + window.location.search);
			void openByKey(linkedKey, linkedId ?? '', fromLink.get('start') === '1');
			return;
		}

		boardId = listBoards().find((board) => board.role === 'remote')?.id ?? '';
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!ready) return;
		await enter();
	}

	/**
	 * Вхід за парою — спільний для форми й для посилання.
	 *
	 * Окремо, бо шлях за посиланням не має ні події, ні кнопки: він
	 * починається сам. А поводитися мусить так само, включно з тим, що при
	 * невдачі поля лишаються заповненими — щоб людина могла просто натиснути
	 * ще раз, а не набирати все наново.
	 */
	/**
	 * Вхід за посиланням: ключ уже готовий, виводити його нема з чого.
	 *
	 * Перевірка існування дошки лишається та сама — застаріле посилання мусить
	 * сказати «немає такої дошки», а не відкрити порожній пульт.
	 */
	async function openByKey(key: string, linkedId: string, makeDefault: boolean) {
		busy = true;
		failure = null;

		try {
			if (!(await boardExists(key))) {
				failure = t('connect.notFound');
				busy = false;
				return;
			}

			const board = { key, id: normalizeBoardId(linkedId), name: '', role: 'remote' as const };
			if (remember) rememberBoard(board);

			/*
			 * «Відкривати одразу» — це запис у налаштування телефона, а не окреме
			 * сховище: інакше поруч із наявним «що відкривати при запуску» жило б
			 * друге джерело тієї самої правди, і сторінка налаштувань показувала б
			 * не те, що відбувається насправді. `last` тут точніше за `fixed`: ця
			 * дошка щойно стала останньою відкритою, а пароля пульт не має.
			 */
			if (makeDefault) {
				settings.load();
				settings.save({ startPage: 'remote', startBoard: 'last' });
			}

			boardSession.open(board);
			await goto(resolve('/remote'));
		} catch (error) {
			busy = false;
			failure = t(describeError(error));
		}
	}

	async function enter() {
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
