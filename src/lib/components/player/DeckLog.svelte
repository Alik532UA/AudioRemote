<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { BoardTrack } from '$lib/board/editor';
	import { deckLog, type DeckNote } from '$lib/services/deckLog.svelte';
	import LogWho from '$lib/components/ui/LogWho.svelte';
	import { IconBroom, IconDown, IconUp } from '$lib/config/icons';
	import { colorOf } from '$lib/config/trackColors';
	import { readItem, writeItem } from '$lib/services/storage';

	/**
	 * ОСТАННІ ДІЇ АУДІОДОШКИ — те саме, що давно є в інфодошки.
	 *
	 * Питання після вистави те саме: «а чому воно тоді заграло?». Джерел звуку
	 * три — руки за пультом, чужий пульт по мережі й тригер за API, — і
	 * розрізнити їх постфактум було неможливо взагалі.
	 *
	 * ## Джерело — МІТКОЮ, а не текстом рядка
	 *
	 * «Плеєр», «пульт», «за API», підпис людини: це відповідь на «хто», і вона
	 * мусить читатися окремо від «що». Мітка стоїть НА КОЖНОМУ рядку, включно з
	 * власними: доти їх не підписували зовсім — мовляв, дію руками за цим самим
	 * пристроєм людина щойно бачила. Це правда рівно доти, доки вона на нього
	 * дивиться; о пів на десяту, розбираючись, чому заграло не те, вона бачить
	 * список, де половина рядків без відповіді на «хто», і мусить здогадуватися,
	 * що порожнє місце означає «я».
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

	const OPEN_KEY = 'deck.logOpen';

	/**
	 * ЗГОРНУТО ЧИ НІ — вибір про ЦЕЙ екран, і він переживає перезавантаження.
	 *
	 * Доти журнал висів завжди й прибрати його не було чим; короткий тривибірник
	 * «і те, і те / керування / журнал» відповідав на те саме питання трьома
	 * варіантами, з яких два означали «сховати щось одне». Кнопка в заголовку
	 * каже рівно те, що робить, і не забирає рядка на екрані.
	 *
	 * Читається прямо в оголошенні: `readItem` на сервері мовчки віддає порожнє,
	 * а ефект тут означав би друге джерело правди — сховище й поле, які
	 * розходяться на такт після кожного перемикання.
	 */
	let open = $state(readItem(OPEN_KEY) !== 'no');

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
		if (note.kind === 'came' || note.kind === 'went') return t(`logAct.${note.kind}`);
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

		<!--
			ДВІ ДІЇ ШАПКИ — ОДНОГО РОДУ Й В ОДИН РЯД.

			Доти «Очистити» було текстовою кнопкою, а згортання — значком, і стояли
			вони СТОВПЧИКОМ: кнопка вгорі, стрілка під нею, заголовок посередині між
			ними. Причина — не тут, а в спільних стилях: у `base.css` є глобальне
			`.head__side { flex-direction: column }` для картки дошки, а цей блок
			носив те саме ім'я класу й напрямку не перекривав. Тому ім'я тепер
			своє, а обидві дії — квадратні значки з підписом у підказці: так само,
			як відповіді в журналі табла.
		-->
		<div class="acts">
			{#if open && notes.length > 0}
				<button
					class="act"
					type="button"
					title={t('deck.logClear')}
					aria-label={t('deck.logClear')}
					onclick={() => deckLog.clear()}
					data-testid="deck-log-clear-btn"
				>
					<IconBroom size={18} aria-hidden="true" />
				</button>
			{/if}

			<button
				class="act"
				type="button"
				aria-expanded={open}
				title={open ? t('deck.logHide') : t('deck.logShow')}
				aria-label={open ? t('deck.logHide') : t('deck.logShow')}
				onclick={() => {
					open = !open;
					writeItem(OPEN_KEY, open ? 'yes' : 'no');
				}}
				data-testid="deck-log-fold-btn"
			>
				{#if open}
					<IconUp size={18} aria-hidden="true" />
				{:else}
					<IconDown size={18} aria-hidden="true" />
				{/if}
			</button>
		</div>
	</div>

	{#if !open}
		<!-- Згорнутий журнал не мовчить зовсім: число каже, чи є на що дивитися. -->
		<p class="muted" data-testid="deck-log-folded-text">
			{t('deck.logFolded', { count: `${notes.length}` })}
		</p>
	{:else if notes.length === 0}
		<p class="muted" data-testid="deck-log-empty-text">{t('deck.logEmpty')}</p>
	{:else}
		<ul class="log" data-testid="deck-log-list">
			{#each notes as note, index (note.id)}
				<!--
					ЗАПИС ПРО ТРЕК — ТОГО Ж КОЛЬОРУ, ЩО Й ТРЕК. Колір у списку ставлять
					саме для того, щоб трек знаходили оком; у журналі той самий трек
					без кольору доводилося б читати словами. Рамкою, а не тлом — рівно
					як у журналі табла: однакові за змістом місця виглядають однаково.
				-->
				{@const hex = colorOf(tracks.find((track) => track.id === note.trackId)?.color)}
				<li
					class="log__row"
					style={hex ? `--row-color: ${hex}` : undefined}
					data-testid="deck-note-{index}-row"
				>
					<span class="log__time mono">{clock(note.at)}</span>

					<LogWho
						side={t(`deckFrom.${note.source}`)}
						name={note.who}
						tone={note.source === 'self' ? 'own' : note.source}
						testid="deck-note-{index}-who-text"
					/>

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

	.acts {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
	}

	/* Стрілка тиха: вона про показ, а не про вміст. */
	.act {
		display: grid;
		place-items: center;
		inline-size: var(--tap);
		block-size: var(--tap);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.act:hover,
	.act:focus-visible {
		background: var(--bg-sunken);
		color: var(--text-primary);
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
		border: 1px solid var(--row-color, var(--border));
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
	}

	.log__time {
		flex: none;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	.log__what {
		min-width: 0;
		overflow-wrap: anywhere;
	}
</style>
