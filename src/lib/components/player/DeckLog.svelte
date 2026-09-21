<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { BoardTrack } from '$lib/board/editor';
	import { deckLog, type DeckNote } from '$lib/services/deckLog.svelte';

	/**
	 * ОСТАННІ ДІЇ АУДІОДОШКИ — те саме, що давно є в інфодошки.
	 *
	 * Питання після вистави те саме: «а чому воно тоді заграло?». Джерел звуку
	 * три — руки за пультом, чужий пульт по мережі й тригер за API, — і
	 * розрізнити їх постфактум було неможливо взагалі.
	 *
	 * ## Джерело — МІТКОЮ, а не текстом рядка
	 *
	 * «Пульт», «API», підпис людини: це відповідь на «хто», і вона мусить
	 * читатися окремо від «що». Мітка «сам» не ставиться зовсім — дію руками за
	 * цим самим комп'ютером людина щойно бачила, і підписувати її означало б
	 * шуміти в кожному другому рядку.
	 *
	 * ## Назва треку береться зі СПИСКУ
	 *
	 * Журнал тримає `trackId`, а не підпис (`services/deckLog.svelte.ts`):
	 * перейменований трек мусить називатися однаково і в списку, і тут. Зниклий
	 * — показує власний номер, бо це чесніше за порожнє місце.
	 */
	interface Props {
		/** Треки дошки — щоб дати рядкам назви, а не номери. */
		tracks: readonly BoardTrack[];
	}

	let { tracks }: Props = $props();

	const notes = $derived(deckLog.notes);

	const titleOf = (trackId: string): string =>
		tracks.find((track) => track.id === trackId)?.title ?? trackId;

	const clock = (at: number) =>
		new Date(at).toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});

	/**
	 * Що сталося — одним рядком.
	 *
	 * Слова тут інші, ніж на кнопках деки: на кнопці стоїть наказ («Стоп»), у
	 * журналі — частина речення («зупинив»). Одне слово на два місця дало б або
	 * наказ посеред фрази, або кнопку, підписану дієсловом минулого часу.
	 */
	function say(note: DeckNote): string {
		if (note.kind === 'trigger') return t('deckAct.trigger', { track: titleOf(note.trackId) });
		if (note.kind === 'play') return t('deckAct.play', { track: titleOf(note.trackId) });
		if (note.kind === 'volume') return t('deckAct.volume', { n: `${note.value ?? 0}` });
		if (note.kind === 'seek') return t('deckAct.seek');
		if (note.kind === 'pause') return t('deckAct.pause');
		if (note.kind === 'resume') return t('deckAct.resume');
		if (note.kind === 'stop') return t('deckAct.stop');
		if (note.kind === 'prev') return t('deckAct.prev');
		return t('deckAct.next');
	}
</script>

<section class="card stack" data-testid="deck-log-section">
	<div class="head">
		<h2 class="subtitle">{t('deck.logTitle')}</h2>

		{#if notes.length > 0}
			<button
				class="btn btn--sm"
				type="button"
				onclick={() => deckLog.clear()}
				data-testid="deck-log-clear-btn"
			>
				{t('deck.logClear')}
			</button>
		{/if}
	</div>

	{#if notes.length === 0}
		<p class="muted" data-testid="deck-log-empty-text">{t('deck.logEmpty')}</p>
	{:else}
		<ul class="log" data-testid="deck-log-list">
			{#each notes as note, index (note.id)}
				<li class="log__row" data-testid="deck-note-{index}-row">
					<span class="log__time mono">{clock(note.at)}</span>

					{#if note.source !== 'self'}
						<span class="log__who log__who--{note.source}">
							{note.who || t(`deckFrom.${note.source}`)}
						</span>
					{/if}

					<span class="log__what">{say(note)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.subtitle {
		font-size: 1.05rem;
	}

	.log {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		/*
		 * Журнал не росте без межі: дека стоїть над ним, а список треків поруч,
		 * і сорок рядків виштовхнули б обидва за край екрана. Прокрутка саме
		 * тут — у частини, яку читають очима, а не тиснуть наосліп.
		 */
		max-block-size: 14rem;
		overflow: auto;
		padding: 0;
		list-style: none;
	}

	.log__row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
	}

	.log__time {
		flex: none;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	/*
	 * Мітка джерела помітна рівно настільки, щоб відрізнятися від тексту:
	 * питання «хто» тут друге за важливістю, а не перше.
	 */
	.log__who {
		flex: none;
		padding: 0 6px;
		border: 1px solid currentcolor;
		border-radius: var(--radius-full);
		font-size: 0.7rem;
	}

	.log__who--remote {
		color: var(--text-secondary);
	}

	/* Спрацювання за API — єдине, до чого не торкалася жодна рука. */
	.log__who--api {
		color: var(--accent);
	}

	.log__what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
