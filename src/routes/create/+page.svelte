<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { IconCheck, IconCopy, IconDice, IconWarning } from '$lib/config/icons';
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { deriveBoardKey } from '$lib/board/boardPath';
	import {
		makeBoardId,
		makePassword,
		MIN_PASSWORD_LENGTH,
		normalizePassword
	} from '$lib/board/secret';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import { kindFromSearch, rememberBoard } from '$lib/board/myBoards';
	import { boardSession } from '$lib/board/session.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	/**
	 * ВИД ДОШКИ ПРИХОДИТЬ АДРЕСОЮ, а форма лишається одна.
	 *
	 * Ідентифікатор, пароль, запас, диктування — усе це в обох видів однакове.
	 * Другий примірник цієї сторінки розійшовся б із першим на першій же правці,
	 * і розійшовся б мовчки.
	 */
	const kind = $derived(kindFromSearch(page.url.search));

	let name = $state('');
	let boardId = $state('');
	let password = $state('');
	let copied = $state(false);
	let busy = $state(false);
	let failure = $state<TranslationKey | null>(null);
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
			/*
			 * Буфер обміну заборонений політикою — і саме тому тут НІЧОГО не
			 * показується. Обидва рядки й так на екрані великим шрифтом, тож
			 * «щось пішло не так» сказало б людині, що зламався застосунок, хоча
			 * зламалася кнопка-зручність. Так само мовчить `copyAll` у вікні
			 * підключення пульта.
			 */
		}
	}

	async function create() {
		busy = true;
		failure = null;
		try {
			const key = await deriveBoardKey(boardId, password);
			const board = {
				key,
				id: boardId,
				name: name.trim(),
				role: 'player' as const,
				kind,
				password
			};
			rememberBoard(board);
			boardSession.open(board);
			await goto(resolve(kind === 'info' ? '/info' : '/player'));
		} catch (error) {
			busy = false;
			/*
			 * `error.message` ЛЮДИНІ НЕ ПОКАЗУЮТЬ. Тут це був би технічний рядок
			 * на кшталт `auth/network-request-failed` — саме той випадок, проти
			 * якого й існує `describeError`: він розрізняє відмови, у яких ДІЯ
			 * різна, і на решту чесно каже «щось пішло не так».
			 */
			failure = describeError(error);
		}
	}
</script>

<div class="stack stack--auth">
	<section class="card card--auth stack">
		<h1 class="title">{kind === 'info' ? t('info.createTitle') : t('create.title')}</h1>

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
			<Failure reason={failure} testid="create-error" />
		{/if}

		<button
			class="btn btn--primary btn--block"
			type="button"
			disabled={!ready}
			onclick={create}
			data-testid="create-submit"
		>
			{busy ? t('common.loading') : kind === 'info' ? t('info.createSubmit') : t('create.submit')}
		</button>
	</section>
</div>

<style>
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
