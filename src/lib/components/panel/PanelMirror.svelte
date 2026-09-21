<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { Panel, PanelCommandType } from '$lib/net/panelTypes';
	import PanelGrid from './PanelGrid.svelte';

	/**
	 * ОДНА ПАНЕЛЬ НА ТАБЛІ — і це НЕ ДЗЕРКАЛО.
	 *
	 * Та сама панель, і тиснеться вона так само. Ручки крутить саме
	 * звукорежисер, а кнопку з підписом він тисне, щоб позначити зроблене — і
	 * рядок про це лягає в той самий журнал, що й прохання із зали.
	 *
	 * Який пульт показувати, вирішує не вона, а стіна (`PanelWall`): панелей на
	 * екрані кілька, і кожна знає лише про свою частину. Перемикач, що стояв тут
	 * раніше, був відповіддю на те саме питання, але по черзі.
	 */
	interface Props {
		panel: Panel;
		levels: Record<string, number>;
		flags: Record<string, boolean>;
		/** Чий пульт. `null` — уся дошка однією панеллю. */
		sheet: string | null;
		/** Назва над сіткою. Порожньо — панель одна, і називати її нема чим. */
		title: string;
		/** Хто зараз за цим пультом. Порожній список — нікого. */
		who: readonly string[];
		recent: string | null;
		hot: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let { panel, levels, flags, sheet, title, who, recent, hot, press }: Props = $props();
</script>

<section class="card mirror" data-testid="info-panel-section-{sheet ?? 'all'}">
	{#if title}
		<!--
			ПІДПИС КАЖЕ ДВІ РЕЧІ: чий це пульт і чи є за ним хтось ЗАРАЗ. Перше
			стале й береться з віджетів, друге живе й береться з присутності —
			і саме друге відповідає на «чому мовчать».
		-->
		<header class="mirror__head">
			<h3 class="mirror__name">{title}</h3>
			<p class="mirror__who" class:mirror__who--none={who.length === 0}>
				{who.length > 0 ? who.join(', ') : t('panel.nobody')}
			</p>
		</header>
	{/if}

	<PanelGrid {panel} {levels} {flags} {recent} {hot} {sheet} {press} />
</section>

<style>
	.mirror {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: var(--gap-sm);
		/*
		 * Ширина панелі стала, а не часткою від екрана: сітка всередині й так
		 * має свою межу в 26rem, а частка робила б кнопку то більшою, то меншою
		 * залежно від того, скільки пультів на дошці.
		 *
		 * Заміряно на 1280×900: при `min(60dvh, 30rem)` кнопка виходила 89×18 —
		 * підпис у ній ще вміщався, але прочитати його з відстані, на якій сидять
		 * за пультом, уже не виходило. Ця пара чисел дає 89×26.
		 */
		inline-size: min(26rem, 82vw);
		block-size: min(70dvh, 38rem);
	}

	.mirror__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--gap-xs) var(--gap-sm);
	}

	.mirror__name {
		margin: 0;
		font-size: 1rem;
	}

	.mirror__who {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	/* «Нікого» — тихіше за імена: це відсутність, а не подія. */
	.mirror__who--none {
		opacity: 0.6;
	}
</style>
