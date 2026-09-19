<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconBack,
		IconNext,
		IconPause,
		IconPlay,
		IconKeyboard,
		IconMute,
		IconStop,
		IconVolume,
		IconWarning
	} from '$lib/config/icons';
	import { t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { RemoteController } from '$lib/remote/controller.svelte';
	import { hotkeyFor } from '$lib/hotkeys/hotkeys';
	import { colorOf } from '$lib/config/trackColors';

	let controller = $state<RemoteController | null>(null);
	let volume = $state(80);
	/** Чи тягне людина повзунок зараз: доки тягне, значення з бази не перебиває. */
	let draggingVolume = $state(false);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;
		if (!board) {
			void goto(resolve('/'));
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
			const action = hotkeyFor(event);
			if (!action) return;
			event.preventDefault();
			void instance.handleHotkey(action);
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

	const armed = $derived(controller?.state?.armed === true);
	const playing = $derived(controller?.state?.playing === true);
</script>

<div class="stack">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	{#if controller && boardSession.current}
		{@const board = boardSession.current}

		<header class="head card">
			<div>
				<h1 class="head__title">{controller.info?.name || t('remote.title')}</h1>
				<p class="muted mono">{board.id}</p>
			</div>
			<p class="link" class:link--on={controller.playerOnline} data-testid="link-state">
				<span class="link__dot" aria-hidden="true"></span>
				{controller.playerOnline ? t('remote.online') : t('remote.offline')}
			</p>
		</header>

		{#if !controller.playerOnline}
			<p class="note note--warn" data-testid="offline-hint">
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
			<p class="note note--warn" data-testid="not-armed-hint">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('remote.notArmedHint')}</span>
			</p>
		{/if}

		<!-- Що зараз грає — найбільший напис на екрані: з нього починається погляд. -->
		<section class="now card">
			<p class="now__title" data-testid="now-playing">
				{controller.currentTitle ?? t('remote.nothing')}
			</p>

			<div class="now__buttons">
				{#if playing}
					<button
						class="btn btn--primary now__btn"
						type="button"
						disabled={controller.sending}
						onclick={() => controller?.send('pause')}
						data-testid="cmd-pause"
					>
						<IconPause size={22} aria-hidden="true" />
						{t('remote.pause')}
					</button>
				{:else}
					<button
						class="btn btn--primary now__btn"
						type="button"
						disabled={controller.sending || !controller.state?.trackId}
						onclick={() => controller?.send('resume')}
						data-testid="cmd-resume"
					>
						<IconPlay size={22} aria-hidden="true" />
						{t('remote.resume')}
					</button>
				{/if}

				<button
					class="btn now__btn"
					type="button"
					disabled={controller.sending || !controller.state?.trackId}
					onclick={() => controller?.send('stop')}
					data-testid="cmd-stop"
				>
					<IconStop size={22} aria-hidden="true" />
					{t('remote.stop')}
				</button>

				<button
					class="btn now__btn"
					type="button"
					disabled={controller.sending || controller.tracks.length === 0}
					onclick={() => controller?.send('next')}
					data-testid="cmd-next"
				>
					<IconNext size={22} aria-hidden="true" />
					{t('remote.next')}
				</button>
			</div>

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
			</div>
		</section>

		{#if controller.trouble}
			<p class="error" role="alert" data-testid="remote-trouble">
				{t(controller.trouble as TranslationKey, { name: controller.currentTitle ?? '' })}
			</p>
		{/if}

		<section class="card stack">
			{#if controller.tracks.length === 0}
				<p class="muted">{t('remote.emptyLibrary')}</p>
			{:else}
				<p class="hint">
					<IconKeyboard size={16} aria-hidden="true" />
					<span>{t('hotkeys.hint')}</span>
				</p>

				<ul class="tracks">
					{#each controller.tracks as track (track.id)}
						{@const hex = colorOf(track.color)}
						<li>
							<button
								class="tracks__btn"
								class:tracks__btn--tinted={hex !== null}
								class:tracks__btn--playing={controller.state?.trackId === track.id}
								style={hex ? `--track-color: ${hex}` : undefined}
								type="button"
								disabled={controller.sending}
								onclick={() => controller?.send('play', track.id)}
								data-testid="play-{track.id}"
							>
								{#if track.hotkey}
									<kbd class="tracks__key" aria-label={t('hotkeys.slot', { key: track.hotkey })}>
										{track.hotkey}
									</kbd>
								{:else}
									<IconPlay size={18} aria-hidden="true" />
								{/if}
								<span class="tracks__title">{track.title}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else}
		<p class="muted">{t('common.loading')}</p>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		align-self: start;
		min-height: var(--tap);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.head__title {
		font-size: 1.2rem;
	}

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

	.now {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.now__title {
		font-size: clamp(1.2rem, 5vw, 1.6rem);
		font-weight: 700;
		text-wrap: balance;
	}

	.now__buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--gap-sm);
	}

	.now__btn {
		min-height: 56px;
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

	.volume__slider {
		flex: 1;
		min-width: 0;
		height: var(--tap);
		accent-color: var(--accent);
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

	.hint {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		color: var(--text-muted);
		font-size: 0.8rem;
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

	.tracks__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
