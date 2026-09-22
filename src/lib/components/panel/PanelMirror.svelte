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
	 * Скільки панелей і чиї вони, вирішує не вона, а стіна (`PanelWall`).
	 *
	 * ## Пульт ОДИН, копій кілька
	 *
	 * Сітка в усіх копіях та сама — це не різні пульти, а різні ЕКРАНИ одного.
	 * Копія існує заради єдиного: видно, ЧИЄ натискання світиться. Тому
	 * підсвітка приходить сюди вже відібрана по автору, а не спільна на всіх:
	 * інакше натискання одного помічника блимало б у всіх панелях одразу, і
	 * друга копія не була б варта місця на екрані.
	 */
	interface Props {
		panel: Panel;
		levels: Record<string, number>;
		flags: Record<string, boolean>;
		/** Чий пульт показувати. `null` — уся дошка однією панеллю. */
		sheet: string | null;
		/** Назва над сіткою. Порожньо — панель одна, і називати її нема чим. */
		title: string;
		/** Помічник зник, але місце ще тримається: панель тьмяніє, а не їде. */
		away?: boolean;
		/**
		 * Локатор панелі — ЗА МІСЦЕМ, а не за пультом.
		 *
		 * Пульт більше не розрізняє панелі: двоє помічників, що дивляться всю
		 * дошку, дали б два однакові `…-all`, і рантайм-гейт локаторів упав би на
		 * дублікаті — справедливо, бо на екрані їх справді два.
		 */
		testid: string;
		recent: string | null;
		hot: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let {
		panel,
		levels,
		flags,
		sheet,
		title,
		away = false,
		testid,
		recent,
		hot,
		press
	}: Props = $props();
</script>

<section class="card mirror" class:mirror--away={away} data-testid={testid}>
	{#if title}
		<!--
			ПІДПИС КАЖЕ ДВІ РЕЧІ: чия це панель і чи є за нею хтось ЗАРАЗ. Перше
			стале, друге живе — і саме друге відповідає на «чому мовчать».
		-->
		<header class="mirror__head">
			<h3 class="mirror__name">{title}</h3>
			{#if away}
				<p class="mirror__who">{t('panel.away')}</p>
			{/if}
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

	/*
	 * Місце зниклого тьмяніє, а не звільняється: панель, що зникла, зсуває
	 * сусідні, і палець влучає не туди. Тьмяна панель каже те саме («його
	 * немає») і не рухає нічого.
	 */
	.mirror--away {
		opacity: 0.55;
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
</style>
