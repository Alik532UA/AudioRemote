<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { IconBack, IconCheck, IconDice, IconTrash, IconWarning } from '$lib/config/icons';
	import { i18n, LOCALES, t, type Locale } from '$lib/i18n/i18n.svelte';
	import {
		makeBoardId,
		makePassword,
		normalizeBoardId,
		normalizePassword
	} from '$lib/board/secret';
	import { settings } from '$lib/settings/settings.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';

	const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' };

	let boardId = $state('');
	let password = $state('');
	let saved = $state(false);

	onMount(() => {
		settings.load();
		boardId = settings.fixedBoardId;
		password = settings.fixedPassword;
	});

	const hasId = $derived(normalizeBoardId(boardId).length > 0);
	const hasPassword = $derived(normalizePassword(password).length > 0);
	/** Заповнена половина пари — не налаштування, а помилка, яку видно одразу. */
	const halfPair = $derived(hasId !== hasPassword);
	const bothSet = $derived(hasId && hasPassword);

	function save() {
		settings.save(boardId.trim(), password.trim());
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	function clear() {
		settings.clear();
		boardId = '';
		password = '';
	}
</script>

<div class="stack">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	<section class="card card--auth stack">
		<h1 class="title">{t('settings.title')}</h1>

		<div class="field">
			<span class="field__label" id="lang-label">{t('settings.language')}</span>
			<div class="langs" role="group" aria-labelledby="lang-label">
				{#each LOCALES as locale (locale)}
					<button
						type="button"
						class="btn langs__btn"
						class:btn--primary={i18n.locale === locale}
						aria-pressed={i18n.locale === locale}
						data-testid="settings-lang-{locale}"
						onclick={() => i18n.set(locale)}
					>
						{LOCALE_NAMES[locale]}
					</button>
				{/each}
			</div>
		</div>

		<div class="field">
			<span class="field__label" id="theme-label">{t('theme.group')}</span>
			<!--
				ТРИТАКТНИЙ ВИБІР ЖИВЕ САМЕ ТУТ.

				У шапці стоїть двопозиційний тугал: він показує, що людина бачить,
				і перемикає одним рухом. Третє положення — «як у пристрої», тобто
				ВІДМОВА від вибору — у перемикача з двома станами не вміщається.
				Тому воно тут, разом із показом теми на наведенні, якого тугал теж
				не вміє (THEME-SWITCHER § 2–4).
			-->
			<div aria-labelledby="theme-label">
				<ThemeSwitcher />
			</div>
		</div>

		<hr class="rule" />

		<div class="stack">
			<h2 class="subtitle">{t('settings.fixedTitle')}</h2>
			<p class="muted">{t('settings.fixedLead')}</p>

			<div class="field">
				<label class="field__label" for="fixed-id">{t('settings.fixedId')}</label>
				<div class="row">
					<input
						id="fixed-id"
						class="input mono"
						type="text"
						bind:value={boardId}
						maxlength="16"
						autocapitalize="characters"
						autocorrect="off"
						spellcheck="false"
						data-testid="fixed-id"
					/>
					<button
						class="btn"
						type="button"
						title={t('settings.generate')}
						aria-label="{t('settings.generate')}: {t('settings.fixedId')}"
						onclick={() => (boardId = makeBoardId())}
					>
						<IconDice size={18} aria-hidden="true" />
					</button>
				</div>
			</div>

			<div class="row row--grow">
				<div class="row__field">
					<PasswordField
						id="fixed-password"
						label={t('settings.fixedPassword')}
						bind:value={password}
						autocomplete="off"
					/>
				</div>
				<button
					class="btn"
					type="button"
					title={t('settings.generate')}
					aria-label="{t('settings.generate')}: {t('settings.fixedPassword')}"
					onclick={() => (password = makePassword())}
				>
					<IconDice size={18} aria-hidden="true" />
				</button>
			</div>

			{#if halfPair}
				<p class="note note--warn" data-testid="half-pair">
					<IconWarning size={18} aria-hidden="true" />
					<span>{t('settings.halfPair')}</span>
				</p>
			{:else if bothSet}
				<p class="note note--warn" data-testid="reuse-warning">
					<IconWarning size={18} aria-hidden="true" />
					<span>{t('settings.reuseWarning')}</span>
				</p>
			{:else}
				<p class="muted">{t('settings.emptyMeans')}</p>
			{/if}

			<div class="row">
				<button
					class="btn btn--primary"
					type="button"
					onclick={save}
					disabled={halfPair}
					data-testid="settings-save"
				>
					{#if saved}
						<IconCheck size={18} aria-hidden="true" />
						{t('settings.saved')}
					{:else}
						{t('settings.save')}
					{/if}
				</button>

				{#if settings.fixedBoardId || settings.fixedPassword}
					<button
						class="btn btn--danger"
						type="button"
						onclick={clear}
						data-testid="settings-clear"
					>
						<IconTrash size={18} aria-hidden="true" />
						{t('settings.clear')}
					</button>
				{/if}
			</div>
		</div>
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

	.subtitle {
		font-size: 1.05rem;
	}

	.rule {
		width: 100%;
		height: 1px;
		margin: 0;
		border: 0;
		background: var(--border);
	}

	.langs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	.langs__btn {
		flex: 1;
		min-width: 120px;
	}

	/* Поле розтягується, кнопка-кубик лишається квадратною поруч із ним. */
	.row--grow {
		align-items: start;
	}

	.row__field {
		flex: 1;
		min-width: 0;
	}

	.row--grow .btn {
		margin-top: 1.35rem;
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
