<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';
	import { listBoards } from '$lib/board/myBoards';
	import { openPlayerBoard } from '$lib/board/openBoard';
	import { boardSession, toActive } from '$lib/board/session.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import { decideStart, startNotice, type StartDecision } from '$lib/settings/startPage.svelte';
	import { mark } from '$lib/services/breadcrumbs';

	/**
	 * КОРІНЬ — СТРІЛОЧНИК, А НЕ СТОРІНКА.
	 *
	 * Меню переїхало на `/menu`, і причина не косметична. Доки меню жило тут,
	 * будь-яка переадресація при запуску забирала б його назовсім: знак
	 * застосунку в шапці веде «на початок», і з початку людину щоразу
	 * відкидало б туди, звідки вона щойно пішла.
	 *
	 * Тепер дві адреси означають дві різні речі. `/` — «застосунок відкрили»,
	 * і він має право повести куди завгодно. `/menu` — меню, і воно не веде
	 * нікуди ніколи. Знак у шапці й усі гвардії показують саме на `/menu`.
	 *
	 * `replaceState` обов'язковий: без нього `/` лишався б в історії, і кнопка
	 * «назад» із меню поверталася б сюди, а звідси — знову в меню.
	 *
	 * Сторінка нічого не малює, крім рядка очікування: намалювати меню й одразу
	 * піти з нього означало б показати блимання саме тим, хто відкриває
	 * застосунок щодня.
	 */
	onMount(() => {
		settings.load();
		const decision = decideStart(settings.startPage, listBoards(), settings.hasFixedPair);
		mark(`start:${settings.startPage} → ${decision.kind}`);
		void follow(decision);
	});

	async function follow(decision: StartDecision): Promise<void> {
		const to = (path: '/menu' | '/create' | '/connect' | '/player' | '/remote') =>
			goto(resolve(path), { replaceState: true });

		switch (decision.kind) {
			case 'page':
				await to(decision.page === 'create' ? '/create' : '/connect');
				return;

			case 'board':
				boardSession.open(toActive(decision.board));
				await to(decision.board.role === 'player' ? '/player' : '/remote');
				return;

			case 'createFixed':
				try {
					await openPlayerBoard(settings.fixedBoardId, settings.fixedPassword);
					await to('/player');
				} catch (error) {
					// Вивести ключ можна лише в безпечному контексті; решта причин теж
					// не має лишати людину на порожньому корені.
					mark(`start:failed ${String(error).slice(0, 60)}`);
					startNotice.reason = 'createFailed';
					await to('/menu');
				}
				return;

			default:
				startNotice.reason = decision.notice ?? null;
				await to('/menu');
		}
	}
</script>

<p class="muted" data-testid="starting">{t('common.loading')}</p>
