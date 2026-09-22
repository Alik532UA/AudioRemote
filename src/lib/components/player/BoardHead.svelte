<script lang="ts">
	import { IconPhone } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { narrow } from '$lib/services/narrow.svelte';
	import SeatTags from '$lib/components/ui/SeatTags.svelte';

	/**
	 * КАРТКА ДОШКИ — що ця дошка про себе каже.
	 *
	 * ## Роль ОКРЕМИМ РЯДКОМ, а не замість назви
	 *
	 * Доти тут стояло `board.name || t('player.title')`: дошка з назвою
	 * втрачала слово «Плеєр» зовсім. А саме воно й відповідає на питання, яке
	 * ставлять із іншого кінця зали, — «на цьому пристрої що?». Назва відповідає
	 * на інше: «яка це з дощок».
	 *
	 * ## Чому окремим файлом
	 *
	 * Сторінка приймача вперлася в свою стелю розміру, і ця картка — найбільш
	 * самостійна її частина: вона нічого не знає ні про звук, ні про папку, ні
	 * про список. Виносити її дешевше, ніж піднімати стелю, і корисніше: сюди ж
	 * переїде все, що дошка про себе каже далі.
	 */
	interface Props {
		/** Роль цього пристрою на екрані: «Плеєр», «Табло». */
		role: string;
		/** Назва дошки. Порожньо — її не дали, і рядка не буде. */
		name: string;
		id: string;
		/** Хто на звʼязку — рядком, уже порахованим і перекладеним. */
		listeners: string;
		/** Підписи тих, хто назвався. Число каже «скільки», мітки — «хто саме». */
		names?: readonly string[];
		/** Покликати ще один пульт. Немає — дошка без пароля, кликати нічим. */
		onconnect?: () => void;
	}

	let { role, name, id, listeners, names = [], onconnect }: Props = $props();
</script>

<header class="head" class:card={!narrow.matches} data-testid="board-head">
	<div class="head__who">
		<h1 class="head__role" data-testid="board-role-title">{role}</h1>
		{#if name}
			<p class="head__title">{name}</p>
		{/if}
		<p class="muted mono">{id}</p>
	</div>

	<div class="head__side">
		<p class="muted" data-testid="board-listeners-text">{listeners}</p>
		<SeatTags {names} testid="board-seats-text" />
		{#if onconnect}
			<button class="btn btn--sm" type="button" onclick={onconnect} data-testid="open-remote">
				<IconPhone size={18} aria-hidden="true" />
				{t('player.connect')}
			</button>
		{/if}
	</div>
</header>
