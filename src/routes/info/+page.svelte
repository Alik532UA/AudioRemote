<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { kindOf } from '$lib/board/myBoards';
	import { ensureBoard } from '$lib/net/board';
	import { countRemotes, trackPresence, watchPresence } from '$lib/net/presence';
	import { mark } from '$lib/services/breadcrumbs';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import type { TranslationKey } from '$lib/i18n/i18n.svelte';

	/**
	 * ТАБЛО — екран того, хто сидить за звуковим пультом.
	 *
	 * Він працює руками й у телефон не дивиться. Тому тут не буде ні тостів, що
	 * зникають, ні журналу, що росте: на екрані стоятиме сама панель, яку бачить
	 * помічник, і останні прохання поруч із нею. Зараз із цього є перша
	 * половина — дошка, присутність і те, що обидві сторони бачать одна одну.
	 *
	 * ЧОМУ ЦЕ НЕ СТОРІНКА ПЛЕЄРА. Спільного в них лише дошка: тут немає ні
	 * папки, ні звуку, ні політики автозапуску, ні черги повторів. Гілка `kind`
	 * усередині плеєра означала б, що кожна наступна правка звуку мусить
	 * питати, чи вона не про табло.
	 */
	let ready = $state(false);
	let helpers = $state(0);
	let fatal = $state<TranslationKey | null>(null);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;

		/*
		 * У МЕНЮ, а не в корінь: корінь — стрілочник, і за налаштуванням він
		 * відправив би сюди знову, по колу. Чужий вид дошки — те саме: аудіодошка
		 * на цьому екрані не має ні панелі, ні сенсу.
		 */
		if (!board || kindOf(board) !== 'info' || board.role !== 'player') {
			void goto(resolve('/menu'));
			return;
		}

		mark('info:start');
		const cleanups: (() => void)[] = [];
		let stopped = false;
		const track = (stop: () => void) => (stopped ? stop() : cleanups.push(stop));

		void (async () => {
			try {
				await ensureBoard(board.key, board.name);
				track(await trackPresence(board.key, 'player'));
				track(
					await watchPresence(board.key, (present) => {
						helpers = countRemotes(present);
					})
				);
				ready = true;
				mark('info:ready');
			} catch (error) {
				fatal = describeError(error);
			}
		})();

		return () => {
			stopped = true;
			for (const stop of cleanups.splice(0)) stop();
		};
	});
</script>

<div class="stack">
	{#if fatal}
		<Failure reason={fatal} block testid="info-fatal-error" />
	{:else if boardSession.current}
		{@const board = boardSession.current}
		<header class="head card" data-testid="board-head">
			<div class="head__who">
				<h1 class="head__role" data-testid="board-role-title">{t('info.boardTitle')}</h1>
				{#if board.name}
					<p class="head__title">{board.name}</p>
				{/if}
				<p class="muted mono">{board.id}</p>
			</div>
			<div class="head__side">
				<p class="muted" data-testid="info-helpers-count">
					{t('info.helpers', { count: `${helpers}` })}
				</p>
			</div>
		</header>

		<!--
			ПАНЕЛІ ЩЕ НЕМАЄ, і сказано про це прямо. Порожній екран без пояснення
			читається як поломка, а не як «тут буде далі».
		-->
		<p class="card muted" data-testid="info-empty-text">
			{ready ? t('info.noPanel') : t('common.loading')}
		</p>
	{/if}
</div>
