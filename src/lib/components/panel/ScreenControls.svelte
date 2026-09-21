<script module lang="ts">
	/**
	 * ЩО ВИДНО НА ТАБЛІ — перелік живе тут, поруч із органом, який його показує.
	 *
	 * Сторінці він теж потрібен (вона вирішує, що малювати), але ДРУГИЙ такий
	 * самий перелік у ній розійшовся б із цим мовчки: додали б четвертий вид —
	 * і вибір показував би три кнопки, а сторінка знала б чотири.
	 */
	export type View = 'both' | 'panel' | 'log';
	export const VIEWS: readonly View[] = ['both', 'panel', 'log'];
</script>

<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconSliders } from '$lib/config/icons';
	import {
		ATTENTION_MODES,
		attentionState,
		type AttentionMode
	} from '$lib/services/attention.svelte';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';

	/**
	 * КЕРУВАННЯ ЕКРАНОМ — ОКРЕМОЮ КАРТКОЮ, а не хвостом картки дошки.
	 *
	 * У картці дошки лежить те, що ВОНА про себе каже: роль, ідентифікатор,
	 * скільки підказок на звʼязку, як покликати ще одну. Складання панелі,
	 * вибір того, що показувати, і гучність привертання уваги — це не про
	 * дошку, а про ЦЕЙ екран; усередині її картки вони читалися як її
	 * властивості.
	 *
	 * Своїм файлом — бо картка перестала бути двома кнопками: у ній три поля,
	 * умовна палітра й власний перелік режимів. У сторінці табла це було б
	 * восьмою частиною її розміру при тому, що до самої дошки не має стосунку
	 * нічого з цього.
	 */
	interface Props {
		view: View;
		editing: boolean;
		/** Порожня панель: складати нема чого, і кнопка живе в іншому місці. */
		empty: boolean;
		onview: (next: View) => void;
		onedit: () => void;
	}

	let { view, editing, empty, onview, onedit }: Props = $props();
</script>

<section class="card stack" data-testid="info-screen-section">
	<!--
		СКЛАДАННЯ — ОКРЕМИЙ РЕЖИМ, а не олівець біля кожної комірки. Складають
		панель раз на сезон, а дивляться на неї щовечора; олівці стояли б на
		екрані весь той час, поки вони не потрібні.

		На порожній дошці кнопки тут немає: те саме слово стоїть посеред картки,
		яка пояснює, чому екран порожній.
	-->
	{#if !empty || editing}
		<button
			class="btn btn--sm"
			type="button"
			aria-pressed={editing}
			onclick={onedit}
			data-testid="info-edit-btn"
		>
			<IconSliders size={18} aria-hidden="true" />
			{editing ? t('panel.editDone') : t('panel.edit')}
		</button>
	{/if}

	<!--
		ВИБІР ПІДПИСАНО. Три слова без підпису питали «і те, і те» — а чого саме?
		Тепер сказано прямо, і сам вибір — той самий орган, що й у налаштуваннях,
		а не власна копія його стилів: копія розтягувалася на всю ширину картки й
		лишала по собі порожній четвертий сегмент.
	-->
	<div class="field">
		<span class="field__label" id="info-view-label">{t('panel.viewTitle')}</span>
		<Picker
			row
			labelledby="info-view-label"
			value={view}
			prefix="info-view"
			options={VIEWS.map((which) => ({ value: which, label: t(`panelView.${which}`) }))}
			onpick={(next) => onview(next as View)}
		/>
	</div>

	<!--
		ЯК ГУЧНО ТАБЛО ГУКАЄ — вибір людини, а не наша здогадка.

		У малому залі з двома акторами досить підсвіченої кнопки; у великому з
		оркестром її не видно взагалі. Типовим лишається найтихіший режим:
		застосунок, який блимає на весь екран без попиту, вимикають на другій
		виставі. Що робить кожен режим, сказано в `attention.svelte.ts`.
	-->
	<div class="field">
		<span class="field__label" id="info-attention-label">{t('panel.attention')}</span>
		<Picker
			row
			labelledby="info-attention-label"
			value={attentionState.mode}
			prefix="info-attention"
			options={ATTENTION_MODES.map((which) => ({ value: which, label: t(`attention.${which}`) }))}
			onpick={(next) => attentionState.choose(next as AttentionMode)}
		/>
		<p class="muted">{t('panel.attentionHint')}</p>

		<!--
			Палітра лише тоді, коли є що фарбувати. У тихому режимі колір спалаху —
			питання про те, чого не буває.
		-->
		{#if attentionState.mode !== 'min'}
			<span class="field__label">{t('panel.attentionColor')}</span>
			<ColorPalette
				value={attentionState.color}
				testid="info-attention-swatch"
				onpick={(slug) => slug && attentionState.paint(slug)}
			/>
		{/if}
	</div>
</section>
