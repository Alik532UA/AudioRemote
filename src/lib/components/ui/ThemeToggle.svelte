<script lang="ts">
	import { IconMoon, IconSun } from '$lib/config/icons';
	import { themeState } from '$lib/services/theme.svelte';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * ПЕРЕМИКАЧ ТЕМИ — перенесений із `BGLog/brr-log` (`ThemeToggle.tsx`).
	 *
	 * ## Чому перемикач, а не кнопка
	 *
	 * Тема — це налаштування, яке або ввімкнене, або ні. Доріжка з кулькою каже,
	 * у якому стані воно СТОЇТЬ, без того щоб натискати й дивитися. Кнопка,
	 * підпис якої стрибає між двома діями, цього не каже ніколи.
	 *
	 * `role="switch"` плюс `aria-checked` доносять це до читалки так само: імʼя
	 * лишається іменем НАЛАШТУВАННЯ, а стан лишається станом. Тому `aria-label`
	 * тут постійний («темна тема»), а `title` — змінний: він каже, що станеться
	 * від натискання.
	 *
	 * ## Чому він двопозиційний, а третій стан лишився в налаштуваннях
	 *
	 * У перемикача два положення за побудовою, а тем у проєкті три: світла,
	 * темна й «як у пристрої» (тобто відмова від вибору). Тут показується та,
	 * яку людина БАЧИТЬ: доки вибору немає, відповідь дає система, а перший клік
	 * робить вибір явним. Повернутися до «як у пристрої» можна на сторінці
	 * налаштувань, де для цього є місце й підпис.
	 *
	 * Свідоме відхилення від THEME-SWITCHER § 2–4 (показ теми на наведенні,
	 * кнопка кольорами своєї теми): одна доріжка не може бути пофарбована під
	 * дві теми одночасно. Тритактний вибір із прев'ю нікуди не подівся — він
	 * переїхав у налаштування, і саме там правило й виконується.
	 */
	const dark = $derived(themeState.isDark);
</script>

<button
	type="button"
	role="switch"
	aria-checked={dark}
	aria-label={t('theme.dark')}
	title={dark ? t('theme.switchToLight') : t('theme.switchToDark')}
	class="theme-switch"
	data-testid="theme-toggle"
	onclick={() => themeState.toggle()}
>
	<!-- Кулька — це `::before` доріжки; ці двоє лише міняють колір під нею. -->
	<IconSun class="theme-switch-sun" size={18} aria-hidden="true" />
	<IconMoon class="theme-switch-moon" size={18} aria-hidden="true" />
</button>

<style>
	/*
	 * КОЛЬОРИ — дослівно з джерела, і НАВМИСНО не через токени тем: доріжка
	 * мусить виглядати однаково в обох темах. Інакше перемикач перефарбовувався б
	 * разом із тим, що він перемикає, і положення кульки читалося б гірше за сам
	 * колір сторінки.
	 */
	/*
	 * ГЕОМЕТРІЯ ВИВОДИТЬСЯ З ВИСОТИ, а не вписана чотирма числами.
	 *
	 * Джерело мало 60×30 із кулькою 24 і зсувом 30. Тут тугал підріс до висоти
	 * сенсорної цілі, щоб стояти в одному ряду з круглою кнопкою налаштувань:
	 * два органи керування різної висоти поруч читаються як недороблені.
	 *
	 * Числа лишилися пропорціями, тож зміна `--switch-h` тягне за собою й ширину,
	 * і кульку, і зсув. Вписані окремо, вони розійшлися б при першій же правці —
	 * і кулька або не доїхала б до краю, або виїхала б за нього.
	 */
	.theme-switch {
		--switch-h: var(--tap);
		--switch-w: calc(var(--switch-h) * 1.9);
		--switch-pad: 4px;
		--switch-knob: calc(var(--switch-h) - var(--switch-pad) * 2);

		position: relative;
		display: inline-block;
		width: var(--switch-w);
		height: var(--switch-h);
		padding: 0;
		border: none;
		border-radius: var(--switch-h);
		background: #94a3b8;
		cursor: pointer;
		transition: background var(--transition-normal);
	}

	.theme-switch::before {
		content: '';
		position: absolute;
		top: var(--switch-pad);
		left: var(--switch-pad);
		width: var(--switch-knob);
		height: var(--switch-knob);
		border-radius: 50%;
		background: #ffffff;
		transition:
			transform var(--transition-normal),
			background var(--transition-normal);
	}

	.theme-switch[aria-checked='true'] {
		background: #475569;
	}

	.theme-switch[aria-checked='true']::before {
		transform: translateX(calc(var(--switch-w) - var(--switch-knob) - var(--switch-pad) * 2));
		background: #0f172a;
	}

	.theme-switch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	/*
	 * `:global`, бо значки — окремі компоненти: клас потрапляє в їхній <svg>, а
	 * не в розмітку цього файлу, тож область видимості Svelte до нього не дістає.
	 */
	.theme-switch :global(svg) {
		position: absolute;
		top: calc((var(--switch-h) - 18px) / 2);
		z-index: 1;
		transition: color var(--transition-normal);
	}

	.theme-switch :global(.theme-switch-sun) {
		left: calc(var(--switch-h) * 0.25);
		/* У світлому положенні сонце лежить на білій кульці — звідси темний колір. */
		color: #334155;
	}

	.theme-switch :global(.theme-switch-moon) {
		right: calc(var(--switch-h) * 0.25);
		color: #f8fafc;
	}

	.theme-switch[aria-checked='true'] :global(.theme-switch-sun) {
		color: #cbd5e1;
	}

	.theme-switch[aria-checked='true'] :global(.theme-switch-moon) {
		color: #e2e8f0;
	}

	@media (prefers-reduced-motion: reduce) {
		.theme-switch,
		.theme-switch::before,
		.theme-switch :global(svg) {
			transition: none;
		}
	}
</style>
