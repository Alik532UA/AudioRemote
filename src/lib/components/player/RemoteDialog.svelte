<script lang="ts">
	import { IconCheck, IconClose, IconCopy } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	interface Props {
		id: string;
		password: string;
		onclose: () => void;
	}

	let { id, password, onclose }: Props = $props();

	/**
	 * ЯК ПІДКЛЮЧИТИ ПУЛЬТ — ВІКНО, А НЕ ЗГОРНУТИЙ БЛОК НА СТОРІНЦІ.
	 *
	 * Пароль лежав у `<details>` під заголовком дошки й тягнув на себе місце в
	 * колонці, хоч потрібен рівно один раз — коли до дошки підключають телефон.
	 * Тут він разом з інструкцією, тобто там, де його шукають, і зникає з очей
	 * одразу, як інструкцію прочитали. Пароль на екрані в залі бачить не лише
	 * той, хто його спитав.
	 *
	 * `<dialog>` із `showModal()` — з тих самих причин, що й у вікні треку:
	 * затемнення, Escape, пастка фокуса й повернення його назад уже написані.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	let copied = $state(false);

	/**
	 * Адреса, яку диктують уголос, — без шляху сторінки.
	 *
	 * На екрані зараз `/player`, але телефону потрібен корінь: звідти йдуть до
	 * «Підключитися». Диктувати адресу з `/player` означало б відправити людину
	 * на сторінку приймача.
	 */
	const address = $derived.by(() => {
		if (typeof window === 'undefined') return '';
		const { origin, pathname } = window.location;
		return origin + pathname.replace(/\/player\/?$/, '/');
	});

	$effect(() => {
		node?.showModal();
	});

	async function copyBoth() {
		try {
			await navigator.clipboard.writeText(
				[`${t('create.idLabel')}: ${id}`, `${t('create.passwordLabel')}: ${password}`].join(
					String.fromCharCode(10)
				)
			);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер заборонений політикою — обидва рядки й так на екрані.
		}
	}
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="remote-dialog"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t('player.connect')}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="remote-dialog-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<section>
			<h3 class="dialog__sub">{t('player.connectHow')}</h3>
			<ol class="steps">
				<li>
					{t('player.connectStep1')}
					<span class="mono steps__address">{address}</span>
				</li>
				<li>{t('player.connectStep2')}</li>
				<li>{t('player.connectStep3')}</li>
			</ol>
		</section>

		<div class="field">
			<span class="field__label">{t('create.idLabel')}</span>
			<output class="secret mono" data-testid="dialog-id">{id}</output>
		</div>

		<PasswordField
			id="player-password"
			label={t('create.passwordLabel')}
			value={password}
			autocomplete="off"
			readonly
		/>

		<button class="btn" type="button" onclick={copyBoth} data-testid="copy-secret">
			{#if copied}
				<IconCheck size={18} aria-hidden="true" />
				{t('common.copied')}
			{:else}
				<IconCopy size={18} aria-hidden="true" />
				{t('common.copy')}
			{/if}
		</button>
	</div>
</dialog>

<style>
	.dialog {
		width: min(480px, calc(100vw - 32px));
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

	.dialog__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		font-size: 1.1rem;
	}

	.dialog__sub {
		margin-bottom: var(--gap-xs);
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.9rem;
	}

	.steps__address {
		display: block;
		word-break: break-all;
		color: var(--accent);
	}

	.secret {
		font-size: 1.15rem;
		letter-spacing: 0.12em;
	}
</style>
