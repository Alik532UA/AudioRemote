<script lang="ts">
	import { onDestroy } from 'svelte';
	import { themeState, type Theme } from '$lib/services/theme.svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import Picker from './Picker.svelte';

	interface Props {
		labelledby?: string;
	}

	let { labelledby }: Props = $props();

	const options = $derived([
		{ value: 'light', label: t('theme.light') },
		{ value: 'dark', label: t('theme.dark') },
		{ value: 'system', label: t('theme.system') }
	]);

	function onEnter(value: string, event: PointerEvent) {
		if (value === 'system') return;
		themeState.preview(value as Theme, event.pointerType);
	}

	function onChoose(value: string) {
		if (value === 'system') themeState.chooseSystem();
		else themeState.choose(value as Theme);
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

<Picker
	row
	{labelledby}
	label={labelledby ? undefined : t('theme.group')}
	value={themeState.chosen ?? 'system'}
	prefix="theme"
	{options}
	onpick={onChoose}
	onitementer={onEnter}
	onitemleave={() => themeState.endPreview()}
/>
