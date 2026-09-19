<script lang="ts">
	import { onDestroy } from 'svelte';
	import { themeState, type Theme } from '$lib/services/theme.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	type Option = { value: Theme | null; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' };

	const options: Option[] = [
		{ value: 'light', labelKey: 'theme.light' },
		{ value: 'dark', labelKey: 'theme.dark' },
		{ value: null, labelKey: 'theme.system' }
	];

	function onEnter(option: Option, event: PointerEvent) {
		if (option.value === null) return;
		themeState.preview(option.value, event.pointerType);
	}

	function onChoose(option: Option) {
		if (option.value === null) themeState.chooseSystem();
		else themeState.choose(option.value);
	}

	/*
	 * ДРУГЕ ДЖЕРЕЛО ЗНЯТТЯ ПОКАЗУ (THEME-SWITCHER § 3.1).
	 *
	 * `pointerleave` приходить не завжди: перемикач може зникнути разом із
	 * курсором — при переході на іншу сторінку або коли панель згорнули з
	 * клавіатури. Тоді події не буде взагалі, і сторінка лишиться в показаній
	 * темі назавжди.
	 */
	onDestroy(() => themeState.endPreview());
</script>

<div
	class="themes"
	role="group"
	aria-label={t('theme.group')}
	onpointerleave={() => themeState.endPreview()}
>
	{#each options as option (option.labelKey)}
		<button
			type="button"
			class="themes__btn themes__btn--{option.value ?? 'system'}"
			class:themes__btn--active={themeState.chosen === option.value}
			aria-pressed={themeState.chosen === option.value}
			data-testid="theme-{option.value ?? 'system'}"
			onpointerenter={(event) => onEnter(option, event)}
			onclick={() => onChoose(option)}
		>
			{#if option.value === null}
				<!--
					«Як у пристрої» — це ВІДМОВА від вибору, а не третя палітра, тож і
					пофарбувати кнопку «під свою тему» нема в що.

					Доти вона була залита градієнтом навпіл, а підпис лежав просто
					зверху: у темній темі світлий текст потрапляв на білу половину й
					зникав, у світлій — навпаки. Читабельної пари для тексту, що лежить
					одночасно на #ffffff і на #121927, не існує.

					Тепер двоколірність винесена в кружечок поруч, а підпис лежить на
					звичайній поверхні — тобто читається завжди, а «обидві теми»
					лишається видно.
				-->
				<span class="themes__dot" aria-hidden="true"></span>
			{/if}
			{t(option.labelKey)}
		</button>
	{/each}
</div>

<style>
	.themes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	/*
	 * ПОДВІЙНИЙ КЛАС — не косметика (THEME-SWITCHER § 4.2).
	 *
	 * Ці кнопки мусять перекрити загальне правило `.btn:hover`. За рівної ваги
	 * селекторів виграє те правило, що стоїть пізніше у зібраному файлі, — а це
	 * буде не наше: порядок у бандлі задає порядок імпортів, а не наш намір.
	 */
	.themes__btn.themes__btn {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	/* Кожна кнопка теми — кольорами СВОЄЇ теми, а не поточної. */
	.themes__btn--light.themes__btn--light {
		background: var(--swatch-light-bg);
		color: var(--swatch-light-fg);
		border-color: var(--swatch-light-border);
	}

	.themes__btn--dark.themes__btn--dark {
		background: var(--swatch-dark-bg);
		color: var(--swatch-dark-fg);
		border-color: var(--swatch-dark-border);
	}

	/* Системна — звичайна поверхня плюс двоколірний кружечок. */
	.themes__btn--system.themes__btn--system {
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		border-color: var(--border);
	}

	.themes__dot {
		flex: none;
		width: 14px;
		height: 14px;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
		/* Половина на половину: ліворуч світла тема, праворуч темна. */
		background: linear-gradient(
			90deg,
			var(--swatch-light-bg) 0 50%,
			var(--swatch-dark-bg) 50% 100%
		);
	}

	/*
	 * Наведення міняє РАМКУ, а не заливає акцентом (§ 4.1.2). Акцент —
	 * середньотоновий, і читабельної пари «текст на акценті» для обох тем
	 * одночасно не існує.
	 */
	.themes__btn.themes__btn:hover,
	.themes__btn.themes__btn:focus-visible {
		border-color: var(--accent);
	}

	.themes__btn--active.themes__btn--active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
</style>
