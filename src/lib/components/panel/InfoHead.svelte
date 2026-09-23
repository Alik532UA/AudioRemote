<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import { IconPhone } from '$lib/config/icons';
	import SeatTags from '$lib/components/ui/SeatTags.svelte';
	import { panelLog } from '$lib/services/panelLog.svelte';
	import type { PanelNotice } from '$lib/panel/apply';

	/**
	 * КАРТКА ТАБЛА — що ця дошка про себе каже.
	 *
	 * Рівно те саме, що `BoardHead` в аудіодошки, і окремим файлом із тієї
	 * самої причини: це найсамостійніша частина сторінки — вона нічого не знає
	 * ні про панель, ні про журнал, ні про складальник. Спільним компонентом
	 * поки не стає: у них розійшлися локатори, і зводити їх разом означало б
	 * міняти назви, на які спираються описи, заради економії десятка рядків.
	 */
	interface Props {
		/** Назва дошки. Порожньо — її не дали, і рядка не буде. */
		name: string;
		id: string;
		/** Скільки помічників на звʼязку — рядком, уже порахованим і перекладеним. */
		helpers: string;
		/** Підписи тих, хто назвався. Число каже «скільки», мітки — «хто саме». */
		names: readonly string[];
		/** Покликати помічника. Немає — дошка чужа, пароля в записі теж немає. */
		onconnect?: () => void;
	}

	let { name, id, helpers, names, onconnect }: Props = $props();

	let action = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastSeenId: string | null = panelLog.entries[0]?.id ?? null;

	const moveWord = (move: PanelNotice['move']) => {
		if (move === 'up') return t('panel.wentUp');
		if (move === 'down') return t('panel.wentDown');
		if (move === 'on') return t('panel.turnedOn');
		if (move === 'off') return t('panel.turnedOff');
		return '';
	};

	$effect(() => {
		const top = panelLog.entries[0];
		if (!top || !top.notice) return;
		if (top.id === lastSeenId) return;
		lastSeenId = top.id;

		const asked = top.notice;
		const what = asked.label ?? moveWord(asked.move);
		const parts: string[] = [];
		if (top.who) parts.push(top.who);
		if (asked.caption && what) parts.push(`${asked.caption} — ${what}`);
		else if (asked.caption) parts.push(asked.caption);
		else if (what) parts.push(what);
		if (asked.from !== null && asked.to !== null) {
			parts.push(t('panel.change', { from: `${asked.from}`, to: `${asked.to}` }));
		}

		action = parts.join(' · ') || null;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			action = null;
		}, 3000);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<header class="head card desk__who" data-testid="board-head">
	<div class="head__who">
		<h1 class="head__role" data-testid="board-role-title">{action ?? t('info.boardTitle')}</h1>
		{#if name}
			<p class="head__title">{name}</p>
		{/if}
		<p class="muted mono">{id}</p>
	</div>

	<div class="head__side">
		<p class="muted" data-testid="info-helpers-count">{helpers}</p>
		<SeatTags {names} testid="info-seats-text" />

		<!--
			ЯК ПОКЛИКАТИ ПОМІЧНИКА — там само, де в плеєра «Підключити пульт».
			Без цієї кнопки дошка була глухим кутом: ідентифікатор на екрані є,
			пароль знає лише той, хто створював, а звідки його взяти вдруге —
			нізвідки. Те саме вікно, ті самі кроки; різне лише слово «помічник» і
			розділ, у якому шукати форму.
		-->
		{#if onconnect}
			<button
				class="btn btn--sm"
				type="button"
				onclick={onconnect}
				data-testid="info-open-remote-btn"
			>
				<IconPhone size={18} aria-hidden="true" />
				{t('info.connectHelper')}
			</button>
		{/if}
	</div>
</header>

<style>
	/*
	 * Шапка стовпчиком, а не в два кінці рядка: у вузькій колонці «в два кінці»
	 * означає «майже впритул», і роль злипалася б із лічильником.
	 */
	.desk__who {
		flex-direction: column;
		align-items: stretch;
	}

	.head__side {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--gap-xs);
	}
</style>
