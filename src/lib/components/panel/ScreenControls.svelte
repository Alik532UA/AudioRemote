<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconSliders } from '$lib/config/icons';
	import {
		ATTENTION_MODES,
		attentionState,
		type AttentionMode
	} from '$lib/services/attention.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import type { Panel } from '$lib/net/panelTypes';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';
	import Picker from '$lib/components/ui/Picker.svelte';
	import ViewPicker from '$lib/components/ui/ViewPicker.svelte';

	/**
	 * КЕРУВАННЯ ЕКРАНОМ — ОКРЕМОЮ КАРТКОЮ, а не хвостом картки дошки.
	 *
	 * ## У складанні тут лишається ОДНЕ — гучність привертання уваги
	 *
	 * Вхід у складання звідси починається, а закінчується воно вже в самому
	 * складальнику: «Готово» стоїть над сіткою, яку воно й закінчує. Доти
	 * кнопка жила тут, у сусідній колонці, і між натисканням та наслідком око
	 * проходило через увесь екран.
	 *
	 * Вибір «що показувати» в цьому режимі теж зникає: ні панелі, ні журналу в
	 * цю мить на екрані немає, і вибирати між ними нема з чого.
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
		/** Триває складання: тоді тут лишається сама лише гучність. */
		editing: boolean;
		/** Порожня панель: складати нема чого, і кнопка живе в іншому місці. */
		empty: boolean;
		/** Поточна панель: потрібна, щоб знати, чи є органи без власного кольору. */
		panel?: Panel;
		onedit: () => void;
	}

	let { editing, empty, panel, onedit }: Props = $props();

	/**
	 * Чи є на панелі хоч один орган без власного кольору.
	 *
	 * Коли всі кнопки й віджети мають власні кольори, вибір кольору для
	 * стандартних кнопок ні на що не впливає: спалах бере власний колір
	 * органа (`attention.svelte.ts`). Орган, який нічого не міняє на екрані,
	 * лише заплутує, тому показуємо його тільки за наявності стандартних органів.
	 */
	const hasUncolored = $derived.by(() => {
		if (!panel?.cells) return false;
		const cells = Object.values(panel.cells);
		if (cells.length === 0) return false;

		return cells.some((cell) => {
			const cellColor = cell.color && colorOf(cell.color);
			if (cell.kind === 'buttons') {
				if (cellColor) return false;
				const buttons = cell.buttons ?? [];
				if (buttons.length === 0) return true;
				return buttons.some((btn) => !btn.color || !colorOf(btn.color));
			}
			return !cellColor;
		});
	});
</script>

<section class="card stack" data-testid="info-screen-section">
	<!--
		СКЛАДАННЯ — ОКРЕМИЙ РЕЖИМ, а не олівець біля кожної комірки. Складають
		панель раз на сезон, а дивляться на неї щовечора; олівці стояли б на
		екрані весь той час, поки вони не потрібні.

		На порожній дошці кнопки тут немає: те саме слово стоїть посеред картки,
		яка пояснює, чому екран порожній.
	-->
	{#if !empty && !editing}
		<button class="btn btn--sm" type="button" onclick={onedit} data-testid="info-start-edit-btn">
			<IconSliders size={18} aria-hidden="true" />
			{t('panel.edit')}
		</button>
	{/if}

	<!--
		ВИБІР ПІДПИСАНО. Три слова без підпису питали «і те, і те» — а чого саме?
		Тепер сказано прямо, і сам вибір — той самий орган, що й у налаштуваннях,
		а не власна копія його стилів: копія розтягувалася на всю ширину картки й
		лишала по собі порожній четвертий сегмент.

		У РЕЖИМІ СКЛАДАННЯ ЙОГО НЕМАЄ: ні панелі, ні журналу в цю мить на екрані
		немає взагалі, тож вибір «що з них показувати» відповідав би на питання
		про те, чого не видно. Орган, який нічого не міняє, читається як
		зламаний.
	-->
	{#if !editing}
		<ViewPicker
			prefix="info-view"
			title={t('panel.viewTitle')}
			label={(which) => t(`panelView.${which}`)}
		/>
	{/if}

	<!--
		ЯК ГУЧНО ТАБЛО ГУКАЄ — і чому тут немає підпису під вибором.

		Три слова говорять самі за себе, а будь-яке пояснення довелося б писати
		про те, ЧОГО ЦЕЙ ВИБІР СТОСУЄТЬСЯ, — а стосується він не зали й не
		прохання, а того, на якому саме моніторі стоїть застосунок. Це знає лише
		людина за пультом, і написати це за неї означало б вигадати їй причину.

		Сама причина — у `attention.svelte.ts`: на головному екрані досить
		підсвіченої кнопки, на другому помічним стає колір, а на третьому чи
		четвертому — лише тло на весь екран.
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

		<!--
			Палітра кольору для стандартних кнопок. Показується лише тоді, коли
			такі органи є на панелі: якщо кожен віджет має власний колір, ця
			палітра не впливатиме на жоден спалах.
		-->
		{#if hasUncolored}
			<span class="field__label">{t('panel.attentionColor')}</span>
			<ColorPalette
				value={attentionState.color}
				testid="info-attention-swatch"
				invertNone
				onpick={(slug) => attentionState.paint(slug)}
			/>
		{/if}
	</div>
</section>
