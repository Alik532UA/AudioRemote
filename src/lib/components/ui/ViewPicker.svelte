<script lang="ts">
	import Picker from './Picker.svelte';
	import { screenView, VIEWS, type Board, type View } from '$lib/services/screenView.svelte';

	/**
	 * ЩО ВИДНО НА ЦІЙ СТОРІНЦІ — один орган на обидві дошки.
	 *
	 * Питання в них те саме: на екрані стоять дві великі речі — орган керування
	 * й журнал, — і людині за пультом потрібна то одна, то обидві. Дві копії
	 * цього вибору розійшлися б на першій же правці; заразом у аудіодошки його
	 * доти не було зовсім, і журнал висів завжди.
	 *
	 * Підписи приходять ззовні: «Панель» і «Керування» — це різні речі, хоч
	 * вибір між ними й журналом однаковий.
	 */
	interface Props {
		board: Board;
		/** Основа локаторів кнопок вибору. */
		prefix: string;
		title: string;
		label: (view: View) => string;
		/** Стояти власною карткою. На таблі він усередині чужої, на плеєрі — сам. */
		card?: boolean;
	}

	let { board, prefix, title, label, card = false }: Props = $props();
</script>

<div class="field" class:card>
	<span class="field__label" id="{prefix}-label">{title}</span>
	<Picker
		row
		labelledby="{prefix}-label"
		value={screenView.of(board)}
		{prefix}
		options={VIEWS.map((which) => ({ value: which, label: label(which) }))}
		onpick={(next) => screenView.set(board, next as View)}
	/>
</div>
