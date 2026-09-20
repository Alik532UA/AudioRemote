<script lang="ts">
	import { IconCheck, IconClose, IconCopy } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';

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

	/**
	 * ПОВНА ІНСТРУКЦІЯ, а не два рядки.
	 *
	 * Копіювали це, щоб переслати колезі — і колега отримував ідентифікатор із
	 * паролем без жодного слова про те, куди їх вводити. Тепер у буфер іде те
	 * саме, що на екрані: кроки, адреса й обидва значення.
	 *
	 * Текст збирається з ТИХ САМИХ рядків словника, що й вікно, — інакше
	 * переклад розійшовся б із тим, що читає людина.
	 */
	const fullText = $derived(
		[
			t('player.connectHow'),
			`1. ${t('player.connectStep1')} ${address}`,
			`2. ${t('player.connectStep2')}`,
			`3. ${t('player.connectStep3')}`,
			'',
			`${t('create.idLabel')}: ${id}`,
			`${t('create.passwordLabel')}: ${password}`
		].join(String.fromCharCode(10))
	);

	async function copyAll() {
		try {
			await navigator.clipboard.writeText(fullText);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер заборонений політикою — усе потрібне й так на екрані.
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
				<li>{t('player.connectStep1')}</li>
				<li>{t('player.connectStep2')}</li>
				<li>{t('player.connectStep3')}</li>
			</ol>
		</section>

		<!--
			Три значення — три кнопки. Адресу відкривають у браузері телефона,
			ідентифікатор і пароль вводять у двох різних полях, а часом треба
			переслати лише пароль: одна кнопка на все вікно змушувала виділяти
			текст мишею — і то з поля, де пароль прихований крапками.
		-->
		<div class="field">
			<span class="field__label">{t('player.connectAddress')}</span>
			<div class="line">
				<output class="mono line__value line__value--address" data-testid="dialog-address">
					{address}
				</output>
				<CopyButton value={address} label={t('player.connectAddress')} testid="copy-address" />
			</div>
		</div>

		<div class="field">
			<span class="field__label">{t('create.idLabel')}</span>
			<div class="line">
				<output class="secret mono line__value" data-testid="dialog-id">{id}</output>
				<CopyButton value={id} label={t('create.idLabel')} testid="copy-id" />
			</div>
		</div>

		<!--
			Кнопка пароля — ВСЕРЕДИНІ поля, поруч із оком. Поруч із полем вона
			з'їжджала б під рядок підказок (Caps Lock, розкладка), який там є
			завжди, навіть порожній.
		-->
		<PasswordField
			id="player-password"
			label={t('create.passwordLabel')}
			value={password}
			autocomplete="off"
			readonly
		>
			{#snippet action()}
				<CopyButton value={password} label={t('create.passwordLabel')} testid="copy-password" />
			{/snippet}
		</PasswordField>

		<button class="btn" type="button" onclick={copyAll} data-testid="copy-secret">
			{#if copied}
				<IconCheck size={18} aria-hidden="true" />
				{t('common.copied')}
			{:else}
				<IconCopy size={18} aria-hidden="true" />
				{t('player.connectCopyAll')}
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

	/*
		Значення й кнопка в один рядок. Кнопка не стискається — скорочуватися має
		довга адреса, а не дія біля неї.
	*/
	.line {
		display: flex;
		align-items: end;
		gap: var(--gap-sm);
	}

	.line__value {
		flex: 1 1 auto;
		min-width: 0;
	}

	.line__value--address {
		word-break: break-all;
		color: var(--accent);
	}

	.secret {
		font-size: 1.15rem;
		letter-spacing: 0.12em;
	}
</style>
