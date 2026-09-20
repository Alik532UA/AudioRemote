<script lang="ts">
	import { IconCheck, IconCopy } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		value: string;
		/** Що саме копіюємо — читає той, хто користується читачем екрана. */
		label: string;
		testid: string;
	}

	let { value, label, testid }: Props = $props();

	/**
	 * КОПІЮВАННЯ ПО ОДНОМУ ЗНАЧЕННЮ.
	 *
	 * Одна кнопка на все вікно годиться рівно доти, доки все потрібне
	 * пересилають разом. Але адресу відкривають у браузері телефона,
	 * ідентифікатор і пароль вводять у двох різних полях, а часом треба
	 * переслати лише пароль — і щоразу доводилося виділяти текст мишею з
	 * вікна, де пароль ще й прихований крапками.
	 *
	 * Тому кнопка маленька й стоїть біля самого значення: вона копіює те, поруч
	 * із чим намальована, і нічого більше.
	 */
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер заборонений політикою браузера — значення й так на екрані.
		}
	}
</script>

<button
	class="copy"
	class:copy--done={copied}
	type="button"
	title={copied ? t('common.copied') : `${t('common.copy')}: ${label}`}
	aria-label={copied ? t('common.copied') : `${t('common.copy')}: ${label}`}
	onclick={copy}
	data-testid={testid}
>
	{#if copied}
		<IconCheck size={16} aria-hidden="true" />
	{:else}
		<IconCopy size={16} aria-hidden="true" />
	{/if}
</button>

<style>
	.copy {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: color var(--transition-fast);
	}

	.copy:hover,
	.copy:focus-visible {
		border-color: var(--border);
		color: var(--text-primary);
	}

	/* Підтвердження кольором, а не написом: місця на напис тут немає. */
	.copy--done {
		color: var(--ok);
	}
</style>
