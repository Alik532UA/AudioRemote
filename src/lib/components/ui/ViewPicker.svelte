<script lang="ts">
	import Picker from './Picker.svelte';
	import { screenView, VIEWS, type View } from '$lib/services/screenView.svelte';

	/**
	 * ЩО ВИДНО НА ЦІЙ СТОРІНЦІ.
	 *
	 * Панель і журнал на таблі рівноправні, і людині за пультом потрібна то одна,
	 * то обидві. Підписи приходять ззовні: сам вибір нічого не знає про те, що
	 * саме ховає.
	 */
	interface Props {
		/** Основа локаторів кнопок вибору. */
		prefix: string;
		title: string;
		label: (view: View) => string;
	}

	let { prefix, title, label }: Props = $props();
</script>

<div class="field">
	<span class="field__label" id="{prefix}-label">{title}</span>
	<Picker
		row
		labelledby="{prefix}-label"
		value={screenView.view}
		{prefix}
		options={VIEWS.map((which) => ({ value: which, label: label(which) }))}
		onpick={(next) => screenView.set(next as View)}
	/>
</div>
