<script lang="ts">
	import { onMount } from 'svelte';
	import { IconCheck, IconDice, IconTrash, IconWarning } from '$lib/config/icons';
	import { i18n, LOCALES, t, type Locale } from '$lib/i18n/i18n.svelte';
	import {
		makeBoardId,
		makePassword,
		normalizeBoardId,
		normalizePassword
	} from '$lib/board/secret';
	import { settings } from '$lib/settings/settings.svelte';
	import { isStartPage, START_PAGES } from '$lib/settings/startPage.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import ThemeSwitcher from '$lib/components/ui/ThemeSwitcher.svelte';
	import { isEmulator } from '$lib/net/firebase';
	import { currentTrail, previousTrail, trailAsText } from '$lib/services/breadcrumbs';

	const LOCALE_NAMES: Record<Locale, string> = { uk: 'Українська', en: 'English' };

	let boardId = $state('');
	let password = $state('');
	let saved = $state(false);
	let trailCopied = $state(false);
	let trail = $state<{ at: number; step: string }[]>([]);
	let trailIsPrevious = $state(false);

	/** Журнал готовим текстом: у розмітці перенос рядка не записати. */
	const trailText = $derived(
		trail.map((crumb) => `+${crumb.at}ms  ${crumb.step}`).join(String.fromCharCode(10))
	);

	async function copyTrail() {
		try {
			await navigator.clipboard.writeText(trailAsText());
			trailCopied = true;
			setTimeout(() => (trailCopied = false), 2000);
		} catch {
			/* буфер заборонений — журнал видно на екрані */
		}
	}

	onMount(() => {
		/*
		 * Показуємо ПОПЕРЕДНІЙ сеанс, якщо він є: саме він обривається на кроці,
		 * після якого вкладка не вижила. Поточний цікавий лише коли попереднього
		 * немає — тобто нічого не падало.
		 */
		const previous = previousTrail();
		trailIsPrevious = previous.length > 0;
		trail = trailIsPrevious ? previous : currentTrail();

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
		settings.save({ fixedBoardId: boardId.trim(), fixedPassword: password.trim() });
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}

	function clear() {
		settings.clear();
		boardId = '';
		password = '';
	}
</script>

<div class="stack stack--auth">
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

		<div class="field">
			<label class="field__label" for="start-page">{t('settings.startTitle')}</label>
			<!--
				Списком, а не рядом кнопок: варіантів п'ять, і підписи в них довгі —
				ряд кнопок на телефоні перетворився б на п'ять рядків.
			-->
			<select
				id="start-page"
				class="input"
				value={settings.startPage}
				data-testid="settings-start"
				onchange={(event) => {
					const chosen = event.currentTarget.value;
					if (isStartPage(chosen)) settings.save({ startPage: chosen });
				}}
			>
				{#each START_PAGES as page (page)}
					<option value={page}>{t(`start.${page}`)}</option>
				{/each}
			</select>
			<p class="muted">{t('settings.startLead')}</p>
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

		<hr class="rule" />

		<!--
			Версія переїхала сюди з підвалу кожної сторінки. Вона потрібна рівно
			тоді, коли про неї питають («а яка у вас збірка?»), — тобто в
			налаштуваннях, а не під очима щохвилини.

			Поруч — ознака емулятора: інакше «дошка не створюється» на бойовій
			адресі й на локальній виглядають однаково.
		-->
		<details class="trail" data-testid="trail">
			<summary class="trail__toggle">
				{t('settings.trail')}
				{#if trailIsPrevious}· {t('settings.trailHint')}{/if}
			</summary>

			<div class="trail__body">
				{#if trail.length === 0}
					<p class="muted">{t('settings.trailEmpty')}</p>
				{:else}
					<pre class="trail__text mono">{trailText}</pre>
					<button class="btn" type="button" onclick={copyTrail} data-testid="copy-trail">
						{#if trailCopied}
							<IconCheck size={18} aria-hidden="true" />
							{t('common.copied')}
						{:else}
							{t('common.copy')}
						{/if}
					</button>
				{/if}
			</div>
		</details>

		<hr class="rule" />

		<p class="about muted" data-testid="about">
			<span>{t('app.name')}</span>
			<span class="mono">{t('settings.version')} {__APP_VERSION__}</span>
			{#if isEmulator()}
				<span class="about__badge">{t('settings.emulator')}</span>
			{/if}
		</p>
	</section>
</div>

<style>
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

	.about {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
	}

	.trail {
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.trail__toggle {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.85rem;
		list-style-position: inside;
	}

	.trail__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: 0 var(--gap) var(--gap);
	}

	.trail__text {
		max-height: 40vh;
		margin: 0;
		overflow: auto;
		color: var(--text-secondary);
		font-size: 0.75rem;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.about__badge {
		padding: 2px 8px;
		border: 1px solid var(--warn);
		border-radius: var(--radius-full);
		color: var(--warn);
		font-size: 0.75rem;
	}
</style>
