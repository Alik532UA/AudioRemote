<script lang="ts">
	interface Props {
		/** Стан налаштування. Двостороннє звʼязування необовʼязкове. */
		checked: boolean;
		/** Підпис поруч. Він називає НАЛАШТУВАННЯ, а не дію. */
		label: string;
		/** Що станеться від натискання — у підказці на наведенні. */
		title?: string;
		testid?: string;
		onchange: (next: boolean) => void;
	}

	let { checked, label, title, testid, onchange }: Props = $props();

	/**
	 * ПЕРЕМИКАЧ НАЛАШТУВАННЯ — доріжка з кулькою, а не кнопка з мінливим написом.
	 *
	 * Різниця не косметична. Кнопка, підпис якої стрибає між «Приховати» і
	 * «Показати», ніколи не каже, у якому стані річ СТОЇТЬ: щоб дізнатися, треба
	 * прочитати напис і подумки його інвертувати. Доріжка каже це положенням
	 * кульки, не вимагаючи нічого інвертувати.
	 *
	 * Геометрія й кольори — ті самі, що в перемикача теми (`ThemeToggle`), але
	 * меншого зросту: тут він стоїть у ряду полів, а не в шапці поруч із круглою
	 * кнопкою. Спільного файлу стилів у них немає навмисно — той перемикач
	 * навмисно НЕ бере кольори теми (доріжка мусить виглядати однаково в обох),
	 * а цей бере: він частина форми й мусить жити за її правилами.
	 *
	 * `role="switch"` плюс `aria-checked`: для читалки імʼя лишається іменем
	 * налаштування, а стан — станом.
	 */
</script>

<label class="switch">
	<button
		class="switch__track"
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		{title}
		data-testid={testid}
		onclick={() => onchange(!checked)}
	></button>
	<span class="switch__label">{label}</span>
</label>

<style>
	.switch {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		min-height: var(--tap);
		cursor: pointer;
	}

	/*
	 * Геометрія виводиться з висоти, як і в перемикача теми: вписані окремо,
	 * ширина, кулька й зсув розійшлися б при першій же правці — і кулька або не
	 * доїхала б до краю, або виїхала б за нього.
	 */
	.switch__track {
		--switch-h: 26px;
		--switch-w: calc(var(--switch-h) * 1.8);
		--switch-pad: 3px;
		--switch-knob: calc(var(--switch-h) - var(--switch-pad) * 2);

		position: relative;
		flex: none;
		width: var(--switch-w);
		height: var(--switch-h);
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: var(--switch-h);
		background: var(--bg-sunken);
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast);
	}

	.switch__track::before {
		content: '';
		position: absolute;
		top: var(--switch-pad);
		left: var(--switch-pad);
		width: var(--switch-knob);
		height: var(--switch-knob);
		border-radius: 50%;
		background: var(--text-secondary);
		transition:
			transform var(--transition-fast),
			background var(--transition-fast);
	}

	.switch__track[aria-checked='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.switch__track[aria-checked='true']::before {
		transform: translateX(calc(var(--switch-w) - var(--switch-knob) - var(--switch-pad) * 2 - 2px));
		background: var(--accent);
	}

	.switch__track:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.switch__label {
		font-size: 0.9rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.switch__track,
		.switch__track::before {
			transition: none;
		}
	}
</style>
