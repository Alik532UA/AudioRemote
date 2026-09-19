<script lang="ts">
	interface Props {
		size?: number;
	}

	let { size = 32 }: Props = $props();

	/**
	 * ЗНАК ЗАСТОСУНКУ — інлайновий SVG, а не `<img src="favicon.svg">`.
	 *
	 * Причина одна, і вона про теми: знак у шапці мусить бути видно і на світлому
	 * тлі, і на темному. Файл значка має власні зашиті кольори (він же лягає на
	 * робочий стіл, де тла застосунку немає), тож у світлій темі його темний
	 * квадрат виглядав би чужою плямою.
	 *
	 * Тут трикутник бере `currentColor`, а хвилі — акцент теми. Тобто знак
	 * перефарбовується разом зі сторінкою й не потребує другого файлу.
	 *
	 * Форма — та сама, що в `static/favicon.svg` і `scripts/make-icons.mjs`:
	 * трикутник «грати» й дві хвилі. Розходитися їм нема з чого, бо це та сама
	 * геометрія, переписана вручну один раз.
	 */
</script>

<svg
	class="mark"
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	role="img"
	aria-hidden="true"
>
	<path d="M19 18 L19 46 L33 32 Z" fill="currentColor" />
	<g fill="none" stroke="var(--accent)" stroke-width="3.2" stroke-linecap="round">
		<path d="M38 24 A 12 12 0 0 1 38 40" />
		<path d="M44 18 A 20 20 0 0 1 44 46" />
	</g>
</svg>

<style>
	.mark {
		display: block;
		flex: none;
	}
</style>
