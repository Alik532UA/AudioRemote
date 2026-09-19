<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IconBack, IconCheck, IconCopy, IconDice, IconWarning } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { deriveBoardKey } from '$lib/board/boardPath';
	import {
		makeBoardId,
		makePassword,
		MIN_PASSWORD_LENGTH,
		normalizePassword
	} from '$lib/board/secret';
	import { rememberBoard } from '$lib/board/myBoards';
	import { boardSession } from '$lib/board/session.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	let name = $state('');
	let boardId = $state('');
	let password = $state('');
	let copied = $state(false);
	let busy = $state(false);
	let failure = $state<string | null>(null);
	/** Пара прийшла з налаштувань, а не згенерована. */
	let fixed = $state(false);

	onMount(() => {
		settings.load();

		/*
		 * СТАЛА ПАРА З НАЛАШТУВАНЬ ПЕРЕМАГАЄ ГЕНЕРАЦІЮ.
		 *
		 * Наслідок треба назвати вголос, і сторінка це робить нижче: адреса
		 * дошки виводиться з пари, тож зі сталою парою ця кнопка нічого не
		 * створює — вона щоразу відкриває ту саму дошку. Саме цього й просили;
		 * але людина, яка цього не знає, вирішила б, що застосунок зламався.
		 */
		fixed = settings.hasFixedPair;
		// Генерація потребує `crypto.getRandomValues` — тобто браузера.
		boardId = fixed ? settings.fixedBoardId : makeBoardId();
		password = fixed ? settings.fixedPassword : makePassword();
	});

	/*
	 * Слабкий пароль — ПОПЕРЕДЖЕННЯ, а не заборона.
	 *
	 * Згенерований дає близько 37 біт, і перебрати його можна лише мережевими
	 * читаннями. Власний пароль людини — її рішення, і забороняти його було б
	 * зухвало. Але мовчати теж не можна: тут пароль — це адреса дошки, тобто
	 * «1234» означає дошку, яку знайдуть перебором за хвилини.
	 */
	const weak = $derived(normalizePassword(password).length < MIN_PASSWORD_LENGTH);
	const ready = $derived(boardId.length > 0 && normalizePassword(password).length > 0 && !busy);

	const dictation = $derived(
		`${t('create.idLabel')}: ${boardId}\n${t('create.passwordLabel')}: ${password}`
	);

	async function copyPair() {
		try {
			await navigator.clipboard.writeText(dictation);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер обміну заборонений політикою — не привід ламати екран:
			// обидва рядки й так видно на екрані великим шрифтом.
			failure = t('error.unknown');
		}
	}

	async function create() {
		busy = true;
		failure = null;
		try {
			const key = await deriveBoardKey(boardId, password);
			const board = { key, id: boardId, name: name.trim(), role: 'player' as const, password };
			rememberBoard(board);
			boardSession.open(board);
			await goto(resolve('/player'));
		} catch (error) {
			busy = false;
			failure = error instanceof Error ? error.message : t('error.unknown');
		}
	}
</script>

<div class="stack stack--auth">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	<section class="card card--auth stack">
		<h1 class="title">{t('create.title')}</h1>

		<div class="field">
			<label class="field__label" for="board-name">{t('create.nameLabel')}</label>
			<input
				id="board-name"
				class="input"
				type="text"
				bind:value={name}
				maxlength="60"
				placeholder={t('create.namePlaceholder')}
				data-testid="board-name"
			/>
		</div>

		<!--
			Два рядки, які людина ДИКТУЄ ВГОЛОС. Тому вони великі, моноширинні й
			стоять поруч: їх читають з екрана вголос, а не переписують.
		-->
		<div class="secret">
			<div class="secret__row">
				<span class="secret__label">{t('create.idLabel')}</span>
				<output class="secret__value mono" data-testid="board-id">{boardId}</output>
			</div>

			<PasswordField
				id="board-password"
				label={t('create.passwordLabel')}
				bind:value={password}
				autocomplete="new-password"
			/>

			<div class="secret__actions">
				<button class="btn" type="button" onclick={() => (password = makePassword())}>
					<IconDice size={18} aria-hidden="true" />
					{t('create.regenerate')}
				</button>
				<button class="btn" type="button" onclick={copyPair} data-testid="copy-pair">
					{#if copied}
						<IconCheck size={18} aria-hidden="true" />
						{t('common.copied')}
					{:else}
						<IconCopy size={18} aria-hidden="true" />
						{t('common.copy')}
					{/if}
				</button>
			</div>
		</div>

		{#if weak}
			<p class="note note--warn" data-testid="weak-password">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('create.weak', { min: MIN_PASSWORD_LENGTH })}</span>
			</p>
		{/if}

		<p class="note">
			<IconWarning size={18} aria-hidden="true" />
			<span>{t('create.warnChange')}</span>
		</p>

		{#if fixed}
			<p class="note" data-testid="fixed-pair">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('create.fromSettings')}</span>
			</p>
		{/if}

		<p class="muted">{t('create.hint')}</p>

		{#if failure}
			<p class="error" role="alert">{failure}</p>
		{/if}

		<button
			class="btn btn--primary btn--block"
			type="button"
			disabled={!ready}
			onclick={create}
			data-testid="create-submit"
		>
			{busy ? t('common.loading') : t('create.submit')}
		</button>
	</section>
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

	.secret {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-sunken);
	}

	.secret__row {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.secret__label {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.secret__value {
		font-size: clamp(1.6rem, 8vw, 2.2rem);
		font-weight: 700;
		line-height: 1.1;
	}

	.secret__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.note--warn {
		color: var(--warn);
	}
</style>
