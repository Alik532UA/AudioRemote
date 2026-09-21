<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { kindOf } from '$lib/board/myBoards';
	import { watchInfo } from '$lib/net/board';
	import { hasPlayer, trackPresence, watchPresence } from '$lib/net/presence';
	import { mark } from '$lib/services/breadcrumbs';
	import { describeError } from '$lib/net/describeError';
	import Failure from '$lib/components/ui/Failure.svelte';
	import type { BoardInfo } from '$lib/net/boardTypes';
	import type { TranslationKey } from '$lib/i18n/i18n.svelte';

	/**
	 * ПІДКАЗКА — екран помічника в залі.
	 *
	 * Він дивиться на сцену, а в телефон — краєм ока, і натискає наосліп. Тому
	 * далі тут буде сітка великих клітинок і нічого крім неї. Зараз є те, без
	 * чого сітка однаково не працює: дошка, присутність і чесна відповідь на
	 * питання «а чи дивиться зараз хтось на табло».
	 */
	let info = $state<BoardInfo | null>(null);
	let boardOnline = $state(false);
	/** Доки перший знімок присутності не приїхав, «офлайн» означає «ще не знаємо». */
	let presenceKnown = $state(false);
	let fatal = $state<TranslationKey | null>(null);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;

		if (!board || kindOf(board) !== 'info' || board.role !== 'remote') {
			void goto(resolve('/menu'));
			return;
		}

		mark('info-remote:start');
		const cleanups: (() => void)[] = [];
		let stopped = false;
		const track = (stop: () => void) => (stopped ? stop() : cleanups.push(stop));

		void (async () => {
			try {
				track(await trackPresence(board.key, 'remote'));
				track(await watchInfo(board.key, (next) => (info = next)));
				track(
					await watchPresence(board.key, (present) => {
						boardOnline = hasPlayer(present);
						presenceKnown = true;
					})
				);
				mark('info-remote:ready');
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
		<Failure reason={fatal} block testid="info-remote-fatal-error" />
	{:else if boardSession.current}
		{@const board = boardSession.current}
		<header class="head card" data-testid="board-head">
			<div class="head__who">
				<h1 class="head__role" data-testid="board-role-title">{t('info.remoteTitle')}</h1>
				{#if info?.name}
					<p class="head__title">{info.name}</p>
				{/if}
				<p class="muted mono">{board.id}</p>
			</div>
			<div class="head__side">
				<p class="link" class:link--on={boardOnline} data-testid="link-state">
					<span class="link__dot" aria-hidden="true"></span>
					{boardOnline ? t('info.boardOnline') : t('info.boardOffline')}
				</p>
			</div>
		</header>

		<p class="card muted" data-testid="info-remote-empty-text">
			{presenceKnown ? t('info.noPanelRemote') : t('common.loading')}
		</p>
	{/if}
</div>

<style>
	/* Ті самі крапка й кольори, що й на пульті: питання «чи чують мене» одне. */
	.link {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--offline);
		font-size: 0.9rem;
	}

	.link--on {
		color: var(--online);
	}

	.link__dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: currentColor;
	}
</style>
