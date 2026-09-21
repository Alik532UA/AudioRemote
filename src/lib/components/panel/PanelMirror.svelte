<script lang="ts">
	import type { Panel, PanelCommandType } from '$lib/net/panelTypes';
	import PanelGrid from './PanelGrid.svelte';
	import SheetPicker from './SheetPicker.svelte';

	/**
	 * ПАНЕЛЬ НА ТАБЛІ — і це НЕ ДЗЕРКАЛО.
	 *
	 * Та сама панель, і тиснеться вона так само. Ручки крутить саме
	 * звукорежисер, а кнопку з підписом він тисне, щоб позначити зроблене — і
	 * рядок про це лягає в той самий журнал, що й прохання із зали.
	 *
	 * Перемикач пультів тут без памʼяті, на відміну від зали: звукорежисерові
	 * потрібні обидва погляди — «що бачить Оля», коли вона питає про кнопку, і
	 * «що взагалі є на дошці» решту часу. Це погляд на мить, а не вибір
	 * робочого місця.
	 */
	interface Props {
		panel: Panel;
		levels: Record<string, number>;
		flags: Record<string, boolean>;
		sheets: readonly string[];
		recent: string | null;
		hot: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let { panel, levels, flags, sheets, recent, hot, press }: Props = $props();

	let sheet = $state<string | null>(null);
</script>

<section class="card mirror" data-testid="info-panel-section">
	<SheetPicker {sheets} value={sheet} onpick={(next) => (sheet = next)} />
	<PanelGrid {panel} {levels} {flags} {recent} {hot} {sheet} {press} />
</section>

<style>
	.mirror {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		/*
		 * Заміряно на 1280×900: при `min(60dvh, 30rem)` кнопка в дзеркалі виходила
		 * 89×18 — підпис у ній ще вміщався, але прочитати його з відстані, на якій
		 * сидять за пультом, уже не виходило. Ця пара чисел дає 89×26.
		 */
		block-size: min(70dvh, 38rem);
	}
</style>
