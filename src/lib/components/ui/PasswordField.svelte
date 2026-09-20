<script lang="ts">
	import type { Snippet } from 'svelte';
	import { IconEye, IconEyeOff } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		value: string;
		id: string;
		label: string;
		autocomplete?: 'current-password' | 'new-password' | 'off';
		readonly?: boolean;
		/**
		 * Ще одна дія в самому полі, поруч із оком.
		 *
		 * Поруч із полем її поставити не можна: під полем завжди є рядок
		 * підказок (Caps Lock, розкладка), і кнопка, вирівняна по низу, з'їжджає
		 * під нього. Усередині вона стоїть там, де на неї й дивляться.
		 */
		action?: Snippet;
	}

	let {
		value = $bindable(),
		id,
		label,
		autocomplete = 'current-password',
		readonly = false,
		action
	}: Props = $props();

	let revealed = $state(false);
	let capsLock = $state(false);

	/**
	 * CAPS LOCK — найчастіша причина «пароль не підходить» у людини, яка ввела
	 * все правильно. Пароль тут диктують уголос, тобто набирають з першого разу
	 * й наосліп, а поле його не показує.
	 *
	 * Читається з ПОДІЇ, а не з окремого API: `getModifierState` існує лише на
	 * події клавіатури. Тому й `keyup` теж — інакше стан не оновиться, коли
	 * Caps Lock вимкнули, не набравши нічого.
	 */
	function checkCaps(event: KeyboardEvent) {
		capsLock = event.getModifierState?.('CapsLock') ?? false;
	}

	/**
	 * РОЗКЛАДКА — друга причина з тієї ж пари.
	 *
	 * Згенерований пароль складається з українських слів. Латиниця в полі
	 * майже завжди означає незмінену розкладку, а не свідомий вибір. Це саме
	 * ПІДКАЗКА, а не помилка: власний пароль людини цілком може бути латинським,
	 * і забороняти його було б зухвало.
	 *
	 * Тринадцять літер, що виглядають однаково в обох абетках, нормалізація
	 * згортає сама (`normalizePassword`), тож підказка не спрацьовує на «КАВА»,
	 * набране латиницею, — воно й так працюватиме.
	 */
	const looksLatin = $derived(/[a-z]/i.test(value) && !/[Ѐ-ӿ]/.test(value));
</script>

<div class="field">
	<label class="field__label" for={id}>{label}</label>

	<div class="field__box">
		<input
			{id}
			class="field__input mono"
			type={revealed ? 'text' : 'password'}
			bind:value
			{autocomplete}
			{readonly}
			autocapitalize="characters"
			autocorrect="off"
			spellcheck="false"
			data-testid={id}
			onkeydown={checkCaps}
			onkeyup={checkCaps}
		/>
		{@render action?.()}
		<button
			type="button"
			class="field__toggle"
			aria-pressed={revealed}
			aria-label={revealed ? t('field.hide') : t('field.reveal')}
			title={revealed ? t('field.hide') : t('field.reveal')}
			onclick={() => (revealed = !revealed)}
		>
			{#if revealed}
				<IconEyeOff size={18} aria-hidden="true" />
			{:else}
				<IconEye size={18} aria-hidden="true" />
			{/if}
		</button>
	</div>

	<!--
		Підказки в `aria-live`: людина з читалкою мусить дізнатися про Caps Lock
		тоді ж, коли й та, що бачить екран, — а не після невдалої спроби.
	-->
	<p class="field__hints" aria-live="polite">
		{#if capsLock}
			<span class="field__hint field__hint--warn" data-testid="{id}-caps"
				>{t('field.capsLock')}</span
			>
		{/if}
		{#if looksLatin}
			<span class="field__hint" data-testid="{id}-layout">{t('field.layout')}</span>
		{/if}
	</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
	}

	.field__label {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.field__box {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-input);
	}

	.field__box:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.field__input {
		flex: 1;
		min-width: 0;
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		font-size: 1rem;
	}

	/* Рамку малює обгортка — інакше їх було б дві, вкладені одна в одну. */
	.field__input:focus-visible {
		outline: none;
	}

	.field__toggle {
		display: grid;
		place-items: center;
		width: var(--tap);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.field__toggle:hover,
	.field__toggle:focus-visible {
		color: var(--accent);
	}

	.field__hints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		min-height: 1.2em;
		margin: 0;
	}

	.field__hint {
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.field__hint--warn {
		color: var(--warn);
		font-weight: 600;
	}
</style>
