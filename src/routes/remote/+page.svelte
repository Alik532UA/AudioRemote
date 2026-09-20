<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconDown,
		IconFolder,
		IconMute,
		IconNext,
		IconPause,
		IconPlay,
		IconPrev,
		IconUp,
		IconStop,
		IconVolume,
		IconWarning
	} from '$lib/config/icons';
	import { plural, t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { RemoteController } from '$lib/remote/controller.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { titleLines } from '$lib/audio/source';
	import HotkeyTips from '$lib/components/ui/HotkeyTips.svelte';
	import { boardPanel } from '$lib/services/boardPanel.svelte';
	import { narrow } from '$lib/services/narrow.svelte';

	let controller = $state<RemoteController | null>(null);
	// Те саме число, що й типова гучність приймача: доки той не оголосив свою,
	// повзунок не має показувати чуже значення.
	let volume = $state(70);
	/** Чи тягне людина повзунок зараз: доки тягне, значення з бази не перебиває. */
	let draggingVolume = $state(false);
	/** Палець на смузі перемотки: доти позиція з приймача її не смикає. */
	let seeking = $state(false);
	let seekValue = $state(0);

	const clock = (ms: number) => {
		const total = Math.max(0, Math.round(ms / 1000));
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	};

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;
		if (!board) {
			// У МЕНЮ, а не в корінь: корінь — стрілочник, і за налаштуванням
			// «відкривати приймач» він відправив би сюди знову, по колу.
			void goto(resolve('/menu'));
			return;
		}

		const instance = new RemoteController(board);
		controller = instance;

		let dispose: (() => void) | null = null;
		void instance.start().then((stop) => {
			dispose = stop;
		});

		/*
		 * Гарячі клавіші є й тут: пультом може бути ноутбук, а не лише телефон.
		 * На телефоні вони просто не спрацьовують — клавіатури немає, і жодної
		 * шкоди від слухача теж.
		 */
		const onKeydown = (event: KeyboardEvent) => {
			// Синхронно до `await`: інакше пробіл устигне прокрутити сторінку.
			const action = instance.resolveKey(event);
			if (!action) return;
			event.preventDefault();
			void instance.run(action);
		};
		window.addEventListener('keydown', onKeydown);

		return () => {
			window.removeEventListener('keydown', onKeydown);
			dispose?.();
			instance.stop();
		};
	});

	/*
	 * Гучність приїжджає з приймача, але НЕ поки палець на повзунку: інакше
	 * кожне оголошення стану смикало б повзунок назад під пальцем.
	 */
	$effect(() => {
		const fromPlayer = controller?.state?.volume;
		if (fromPlayer !== undefined && !draggingVolume) volume = Math.round(fromPlayer * 100);
	});

	/**
	 * Чи розгорнуте керування на телефоні. `null` — «як само вийде».
	 *
	 * Те саме правило, що й у приймача: доки трек не обрано, від смуги
	 * перемотки й чотирьох кнопок користі нема, а висоту вони забирають у
	 * списку. Гучність лишається завжди — її крутять і в тиші.
	 */
	let deckOpen = $state<boolean | null>(null);

	const armed = $derived(controller?.state?.armed === true);
	const playing = $derived(controller?.state?.playing === true);

	/**
	 * На телефоні шапка дошки переїжджає під кнопку налаштувань.
	 *
	 * Медіазапитом цього не зробити: вузол мусить опинитися в ІНШОМУ
	 * компоненті, а два однакові вузли з одними `data-testid` — це не розкладка,
	 * а пастка. Прибирання обовʼязкове: інакше фрагмент пережив би сторінку, і в
	 * налаштуваннях лишилася б дошка, з якої вже пішли.
	 */
	$effect(() => {
		if (!narrow.matches) return;
		boardPanel.content = boardHead;
		return () => (boardPanel.content = null);
	});
</script>

<!-- Та сама пара місць, що й у приймача: картка ліворуч або рядок у смузі. -->
{#snippet boardHead()}
	{#if controller && boardSession.current}
		{@const board = boardSession.current}
		<header class="head" class:card={!narrow.matches} data-testid="board-head">
			<div class="head__who">
				<h1 class="head__title">{controller.info?.name || t('remote.title')}</h1>
				<p class="muted mono">{board.id}</p>
			</div>
			<p class="link" class:link--on={controller.playerOnline} data-testid="link-state">
				<span class="link__dot" aria-hidden="true"></span>
				{controller.playerOnline ? t('remote.online') : t('remote.offline')}
			</p>
		</header>
	{/if}
{/snippet}

<div class="stack stack--wide">
	{#if controller && boardSession.current}
		<!--
			ТРИ КОЛОНКИ — ТІ САМІ, ЩО В ПЛЕЄРА.

			Пульт і приймач показують одну дошку, і людина ходить між ними в межах
			одного вечора. Дві різні розкладки на один предмет означають, що на
			кожному екрані треба наново шукати, де тут що.

			На телефоні — де пульт і живе — колонки однаково згортаються в один
			стовпець, тож ширший екран нічого не коштує вузькому.
		-->
		<div class="board">
			<div class="board__col board__col--side">
				{#if !narrow.matches}
					{@render boardHead()}
				{/if}

				{#if !controller.playerOnline}
					<p class="note note--warn card" data-testid="offline-hint">
						<IconWarning size={18} aria-hidden="true" />
						<span>{t('remote.offlineHint')}</span>
					</p>
				{:else if !armed}
					<!--
						ІНШИЙ ТЕКСТ, А НЕ ТОЙ САМИЙ. «Вкладку закрито» й «звук не ввімкнено»
						виглядають однаково — обидва означають «не працює», — але дії різні:
						у першому випадку треба відкрити сторінку, у другому вона вже
						відкрита й досить одного натискання. Один текст на два випадки
						відправляв би людину робити зайве.
					-->
					<p class="note note--warn card" data-testid="not-armed-hint">
						<IconWarning size={18} aria-hidden="true" />
						<span>{t('remote.notArmedHint')}</span>
					</p>
				{/if}

				{#if controller.trouble}
					<p class="error" role="alert" data-testid="remote-trouble">
						{t(controller.trouble as TranslationKey, { name: controller.currentTitle ?? '' })}
					</p>
				{/if}
			</div>

			<!-- ─── Керування ─────────────────────────────────────────────── -->
			<!--
				На телефоні керування зʼявляється разом із бібліотекою: доки приймач
				нічого не оголосив, керувати нема чим. Умова стоїть НАД колонкою, а не
				всередині: порожня колонка лишала по собі проміжок і заважала короткій
				дошці стати посеред екрана.
			-->
			{#if !narrow.matches || controller.tracks.length > 0}
				{@const full = !narrow.matches || (deckOpen ?? controller.state?.trackId != null)}
				<div class="board__col board__col--deck">
					<section class="now card" class:now--short={!full} data-testid="deck">
						{#if !narrow.matches}
							<HotkeyTips id="remote-tips" />
						{:else if full}
							<button
								class="now__fold"
								type="button"
								title={t('player.deckCollapse')}
								aria-label={t('player.deckCollapse')}
								aria-expanded={true}
								onclick={() => (deckOpen = false)}
								data-testid="deck-collapse"
							>
								<IconDown size={20} aria-hidden="true" />
							</button>
						{/if}

						{#if full}
							<p class="now__title" data-testid="now-playing">
								{controller.currentTitle ?? t('remote.nothing')}
							</p>

							<!--
								Перемотка з пульта. Позиція рахується як оголошена плюс час, що минув
								відтоді, — приймач не шле її щосекунди, і саме тому смужка рухається
								плавно, а мережею йде одне повідомлення на зміну стану.
							-->
							<div class="bar">
								<span class="bar__time mono">
									{clock(seeking ? seekValue : controller.positionMs)}
								</span>
								<!--
									Перемотка комітиться на `pointerup`, і значення береться з САМОГО
									поля, а не з `seekValue`.

									Клік по смузі (а не тягання) міг не дати жодного `input` — тоді
									`seekValue` лишався нулем, і одне натискання кидало трек на
									початок. А `change` тут не годиться: він приходить ПІСЛЯ того, як
									знято `seeking`, і реактивне значення вже встигло повернути
									повзунок на оголошену позицію — перемотка виходила «сама в себе».

									Клавіатура йде окремою парою: у неї `pointerup` не буває.
								-->
								<input
									class="bar__range"
									type="range"
									min="0"
									max={Math.max(1000, controller.durationMs)}
									step="250"
									disabled={!controller.state?.trackId || controller.durationMs === 0}
									value={seeking ? seekValue : controller.positionMs}
									data-testid="remote-seek"
									onpointerdown={(event) => {
										seeking = true;
										seekValue = Number(event.currentTarget.value);
									}}
									oninput={(event) => (seekValue = Number(event.currentTarget.value))}
									onpointerup={(event) => {
										seeking = false;
										void controller?.seek(Number(event.currentTarget.value));
									}}
									onpointercancel={() => (seeking = false)}
									onkeydown={() => (seeking = true)}
									onkeyup={(event) => {
										seeking = false;
										void controller?.seek(Number(event.currentTarget.value));
									}}
								/>
								<span class="bar__time mono">{clock(controller.durationMs)}</span>
							</div>

							<!-- Ті самі чотири значки, що й у плеєра, і в тому самому порядку. -->
							<div class="now__buttons">
								<button
									class="btn now__btn"
									type="button"
									disabled={controller.sending || controller.tracks.length === 0}
									title={t('remote.prev')}
									aria-label={t('remote.prev')}
									onclick={() => controller?.send('prev')}
									data-testid="cmd-prev"
								>
									<IconPrev size={22} aria-hidden="true" />
								</button>

								{#if playing}
									<button
										class="btn btn--primary now__btn"
										type="button"
										disabled={controller.sending}
										title={t('remote.pause')}
										aria-label={t('remote.pause')}
										onclick={() => controller?.send('pause')}
										data-testid="cmd-pause"
									>
										<IconPause size={22} aria-hidden="true" />
									</button>
								{:else}
									<button
										class="btn btn--primary now__btn"
										type="button"
										disabled={controller.sending || !controller.state?.trackId}
										title={t('remote.resume')}
										aria-label={t('remote.resume')}
										onclick={() => controller?.send('resume')}
										data-testid="cmd-resume"
									>
										<IconPlay size={22} aria-hidden="true" />
									</button>
								{/if}

								<button
									class="btn now__btn"
									type="button"
									disabled={controller.sending || !controller.state?.trackId}
									title={t('remote.stop')}
									aria-label={t('remote.stop')}
									onclick={() => controller?.send('stop')}
									data-testid="cmd-stop"
								>
									<IconStop size={22} aria-hidden="true" />
								</button>

								<button
									class="btn now__btn"
									type="button"
									disabled={controller.sending || controller.tracks.length === 0}
									title={t('remote.next')}
									aria-label={t('remote.next')}
									onclick={() => controller?.send('next')}
									data-testid="cmd-next"
								>
									<IconNext size={22} aria-hidden="true" />
								</button>
							</div>
						{/if}

						<div class="volume">
							<!-- Значок був підписом, тепер це кнопка: тиша потрібна найчастіше. -->
							<button
								class="volume__mute"
								class:volume__mute--on={controller.muted}
								type="button"
								aria-pressed={controller.muted}
								title={controller.muted ? t('sound.unmute') : t('sound.mute')}
								aria-label={controller.muted ? t('sound.unmute') : t('sound.mute')}
								onclick={() => controller?.toggleMute()}
								data-testid="remote-mute"
							>
								{#if controller.muted}
									<IconMute size={20} aria-hidden="true" />
								{:else}
									<IconVolume size={20} aria-hidden="true" />
								{/if}
							</button>
							<label class="visually-hidden" for="remote-volume">{t('remote.volume')}</label>
							<input
								id="remote-volume"
								class="volume__slider"
								type="range"
								min="0"
								max="100"
								step="1"
								bind:value={volume}
								data-testid="cmd-volume"
								onpointerdown={() => (draggingVolume = true)}
								onpointerup={() => (draggingVolume = false)}
								oninput={() => controller?.setVolume(volume)}
							/>
							<output class="volume__value mono">{volume}</output>

							{#if !full}
								<!-- У згорнутому вигляді верхнього кута немає: картка в один рядок. -->
								<button
									class="volume__mute"
									type="button"
									title={t('player.deckExpand')}
									aria-label={t('player.deckExpand')}
									aria-expanded={false}
									onclick={() => (deckOpen = true)}
									data-testid="deck-expand"
								>
									<IconUp size={20} aria-hidden="true" />
								</button>
							{/if}
						</div>
					</section>
				</div>
			{/if}

			<!-- ─── Список ────────────────────────────────────────────────── -->
			<div class="board__col board__col--list">
				<section class="card stack">
					{#if controller.tracks.length === 0}
						<p class="muted">{t('remote.emptyLibrary')}</p>
					{:else}
						<!--
							Шапка та сама, що в плеєра, але без назви папки: пульт її не знає
							і знати не мусить — приймач оголошує самі треки. Лишається те, що
							пульту справді потрібно: скільки їх.
						-->
						<div class="folder">
							<IconFolder size={18} aria-hidden="true" />
							<span class="folder__count">
								{plural(
									{ one: 'player.tracksOne', few: 'player.tracksFew', other: 'player.tracksMany' },
									controller.tracks.length
								)}
							</span>
						</div>

						<ul class="tracks">
							{#each controller.tracks as track (track.id)}
								{@const hex = colorOf(track.color)}
								{@const key = controller.keyLabels[track.id]}
								{@const current = controller.state?.trackId === track.id}
								{@const sounding = current && playing}
								<li>
									<button
										class="tracks__btn"
										class:tracks__btn--tinted={hex !== null}
										class:tracks__btn--playing={controller.state?.trackId === track.id}
										style={hex ? `--track-color: ${hex}` : undefined}
										type="button"
										disabled={controller.sending}
										onclick={() =>
											current
												? controller?.send(sounding ? 'pause' : 'resume')
												: controller?.send('play', track.id)}
										data-testid="play-{track.id}"
									>
										<!--
											На телефоні клавіш немає: клавіатури там нема, а місце потрібне назві.
										
											Значок каже, що станеться від натискання: у того, що звучить, — пауза.
											Доти скрізь стояв трикутник «грати», і рядок обіцяв запустити те, що
											вже грає.
										-->
										<span class="tracks__mark">
											{#if key && !narrow.matches}
												<kbd class="tracks__key" aria-label={t('hotkeys.slot', { key })}>
													{key}
												</kbd>
											{:else if sounding}
												<IconPause size={18} aria-hidden="true" />
											{:else}
												<IconPlay size={18} aria-hidden="true" />
											{/if}
										</span>
										<span class="tracks__title">
											{#if narrow.matches}
												{#each titleLines(track.title) as line (line)}
													<span class="tracks__line">{line}</span>
												{/each}
											{:else}
												{track.title}
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{:else}
		<p class="muted">{t('common.loading')}</p>
	{/if}
</div>

<style>
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

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--warn);
		font-size: 0.85rem;
	}

	/* `relative` — прив'язка для тултіпа підказок у правому верхньому куті. */
	.now {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	/* Згорнута — це один рядок: падінг картки на весь зріст тут зайвий. */
	.now--short {
		padding-block: var(--gap-sm);
	}

	/* Там само, де на широкому екрані значок підказки. */
	.now__fold {
		position: absolute;
		top: var(--gap-sm);
		right: var(--gap-sm);
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.now__fold:hover,
	.now__fold:focus-visible {
		color: var(--accent);
	}

	.now__title {
		padding-right: var(--tap);
		font-size: clamp(1.2rem, 5vw, 1.6rem);
		font-weight: 700;
		text-wrap: balance;
	}

	/* Чотири рівні значки в один ряд — так само, як у приймача. */
	.now__buttons {
		display: flex;
		gap: var(--gap-sm);
	}

	.now__btn {
		flex: 1 1 0;
		min-width: 0;
		min-height: 56px;
		padding-inline: var(--gap-xs);
	}

	.volume {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		min-height: var(--tap);
		color: var(--text-secondary);
	}

	.volume__mute {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--tap);
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.volume__mute:hover,
	.volume__mute:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.volume__mute--on {
		border-color: var(--warn);
		color: var(--warn);
	}

	.volume__slider,
	.bar__range {
		flex: 1;
		min-width: 0;
		height: var(--tap);
		accent-color: var(--accent);
	}

	.bar {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	.bar__time {
		min-width: 4ch;
		color: var(--text-secondary);
		font-size: 0.8rem;
		text-align: center;
	}

	/* Номер клавіші — у вигляді клавіші, а не порядкового номера. */
	.tracks__key {
		display: grid;
		place-items: center;
		flex: none;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1;
	}

	.volume__value {
		min-width: 3ch;
		text-align: end;
	}

	.tracks {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tracks__btn {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		width: 100%;
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: inherit;
		cursor: pointer;
		text-align: start;
	}

	/* Той самий подвійний зріст, що й у приймача: ціль для пальця наосліп. */
	@media (max-width: 899px) {
		.tracks__btn {
			min-height: calc(var(--tap) * 2);
		}

		/*
		 * Смуга «N треків» на телефоні зайва: у пульта в ній лише число, а
		 * назви папки він не знає. Приймач її лишає — там є що сказати.
		 */
		.folder {
			display: none;
		}

		/*
		 * Значок переїжджає ПРАВОРУЧ і стає колом.
		 *
		 * Ліворуч він читався як маркер списку — те, на що не тиснуть. У колі
		 * праворуч він читається як кнопка, і стоїть там, куди на телефоні
		 * дотягується великий палець.
		 */
		.tracks__mark {
			order: 2;
			width: var(--tap);
			height: var(--tap);
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-full);
			background: var(--bg-surface);
			color: var(--accent);
		}

		/* Два рядки замість одного обірваного — див. `titleLines`. */
		.tracks__title {
			display: flex;
			flex-direction: column;
			justify-content: center;
		}

		.tracks__line {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.tracks__btn:hover:not(:disabled),
	.tracks__btn:focus-visible {
		border-color: var(--accent);
	}

	.tracks__btn:disabled {
		opacity: 0.6;
	}

	/*
	 * Колір — смуга збоку плюс підкладка на 12%, а не тло під текстом: інакше
	 * довелося б добирати читабельну пару для кожної з десяти заготовок у кожній
	 * темі. Колір тут для того, щоб трек ЗНАХОДИЛИ оком, а не читали.
	 */
	.tracks__btn--tinted {
		border-inline-start: 4px solid var(--track-color);
		background: color-mix(in oklab, var(--track-color) 12%, var(--bg-surface-raised));
	}

	.tracks__btn--playing {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 700;
	}

	.tracks__mark {
		display: grid;
		place-items: center;
		flex: none;
	}

	.tracks__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
