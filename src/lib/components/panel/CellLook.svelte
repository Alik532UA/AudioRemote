<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { MAX_CAPTION, MAX_PANEL_ICON, MAX_SHEET } from '$lib/net/panelTypes';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';

	/**
	 * ЯК ВІДЖЕТ ВИГЛЯДАЄ Й КОМУ ВІН ВИДНО.
	 *
	 * Підпис, значок, пульт, колір, гучність натискання — п'ять полів, які
	 * відповідають на одне питання: «як його впізнають». Форма (скільки
	 * клітинок, куди повернутий) і вміст (кнопки, крок) відповідають на інші, і
	 * живуть окремо.
	 *
	 * Своїм файлом — бо вікно віджета вперлося в стелю розміру, і саме ця
	 * третина в ньому найменше пов'язана з рештою: вона не знає ні про рід
	 * комірки, ні про місце на панелі.
	 *
	 * ## Чернетка правиться НА МІСЦІ
	 *
	 * Об'єкт приїхав із вікна й лишається його власністю: другої копії тут
	 * немає, тож їй нема куди розійтися з першою.
	 */
	export interface CellLookDraft {
		caption: string;
		icon: string;
		sheet: string;
		color: string | null;
		important: boolean;
	}

	interface Props {
		look: CellLookDraft;
		/** Назви пультів, які вже є на панелі: підказка, а не межа. */
		sheets: readonly string[];
	}

	let { look, sheets }: Props = $props();
</script>

<div class="group">
	<div class="field">
		<label class="field__label" for="cell-caption">{t('panel.caption')}</label>
		<input
			id="cell-caption"
			class="input"
			type="text"
			maxlength={MAX_CAPTION}
			bind:value={look.caption}
			data-testid="cell-caption-input"
		/>
		<p class="muted">{t('panel.captionHint')}</p>
	</div>

	<!--
		ЗНАЧОК І КОЛІР — ті самі, що в треків, і з тієї ж причини: у темному залі
		шукають очима те, що впізнають, а не читають підпис. Клавіатуру емодзі
		відкриває сама система (Win+. на компʼютері), тож поле тут звичайне
		текстове.
	-->
	<div class="field">
		<label class="field__label" for="cell-icon">{t('panel.icon')}</label>
		<input
			id="cell-icon"
			class="input input--icon"
			type="text"
			maxlength={MAX_PANEL_ICON}
			bind:value={look.icon}
			placeholder={t('track.emojiHint')}
			data-testid="cell-icon-input"
		/>
	</div>

	<!--
		ЧИЙ ЦЕ ПУЛЬТ. Порожньо — спільний, його бачать усі: «стоп» і «готові»
		потрібні кожному в залі. Список — не обмеження, а пам'ять: назви беруться
		з уже названих віджетів, щоб та сама бригада не стала двома через одну
		літеру.
	-->
	<div class="field">
		<label class="field__label" for="cell-sheet">{t('panel.sheet')}</label>
		<input
			id="cell-sheet"
			class="input"
			type="text"
			list="cell-sheet-list"
			maxlength={MAX_SHEET}
			placeholder={t('panel.sheetAll')}
			bind:value={look.sheet}
			data-testid="cell-sheet-input"
		/>
		<datalist id="cell-sheet-list">
			{#each sheets as name (name)}
				<option value={name}></option>
			{/each}
		</datalist>
		<p class="muted">{t('panel.sheetHint')}</p>
	</div>

	<div class="field">
		<span class="field__label">{t('panel.color')}</span>
		<ColorPalette value={look.color} testid="cell-swatch" onpick={(slug) => (look.color = slug)} />
	</div>

	<!--
		ВАЖЛИВА ДІЯ — і чому нею мигає весь екран, а не сам віджет.

		Яскравішу рамку на самому віджеті видно лише тому, хто на нього й так
		дивиться. А потрібне зворотне: звукорежисер дивиться на пульт, у зал або
		в ноти, і мить іншого тла він упіймає КРАЄМ ОКА — саме тому, що
		змінюється все поле зору, а не його клаптик.

		Прапорець необовʼязковий навмисно: якби так поводилася кожна кнопка,
		екран блимав би цілу виставу й перестав би щось означати.
	-->
	<div class="field">
		<Switch
			checked={look.important}
			label={t('panel.important')}
			testid="cell-important-toggle"
			onchange={(next) => (look.important = next)}
		/>
		<p class="muted">{t('panel.importantHint')}</p>
	</div>
</div>

<style>
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		min-width: 0;
	}
</style>
