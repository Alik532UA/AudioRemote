<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconBack,
		IconEye,
		IconEyeOff,
		IconFolder,
		IconKeyboard,
		IconMute,
		IconPlay,
		IconPower,
		IconRefresh,
		IconVolume,
		IconWarning
	} from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';
	import { hotkeyFor } from '$lib/hotkeys/hotkeys';
	import { colorNumber, colorOf, TRACK_COLORS } from '$lib/config/trackColors';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);
	/** Для якого треку відкрита палітра. `null` — для жодного. */
	let paletteFor = $state<string | null>(null);

	const hiddenCount = $derived(
		controller ? Object.values(controller.hidden).filter(Boolean).length : 0
	);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;
		if (!board) {
			void goto(resolve('/'));
			return;
		}

		const instance = new PlayerController(board);
		controller = instance;

		let dispose: (() => void) | null = null;
		instance
			.start()
			.then((stop) => {
				dispose = stop;
			})
			.catch((error: unknown) => {
				// Текст із `error.message` тут був би технічним рядком Firebase.
				fatal = t(describeError(error));
			});

		/*
		 * Гарячі клавіші вішаються на ВІКНО, а не на якийсь елемент: людина біля
		 * комп'ютера тисне цифру, не клікнувши перед тим нікуди, тож фокуса
		 * всередині сторінки може й не бути. Набір у полі вводу від цього не
		 * страждає — `hotkeyFor` сам відмовляється, коли фокус у полі.
		 */
		const onKeydown = (event: KeyboardEvent) => {
			const action = hotkeyFor(event);
			if (!action) return;
			event.preventDefault();
			void instance.handleHotkey(action);
		};
		window.addEventListener('keydown', onKeydown);

		// Знімається ВСЕ: підписки на команди, присутність, приховане, слухач
		// клавіш і сам програвач. Без цього друге відкриття сторінки виконувало б
		// кожну команду двічі.
		return () => {
			window.removeEventListener('keydown', onKeydown);
			dispose?.();
			instance.stop();
		};
	});
</script>

<div class="stack">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	{#if fatal}
		<p class="error" role="alert">{fatal}</p>
	{:else if controller && boardSession.current}
		{@const board = boardSession.current}
		{@const engine = controller.engine}

		<header class="head card">
			<div>
				<h1 class="head__title">{board.name || t('player.title')}</h1>
				<p class="muted mono">{board.id}</p>
			</div>
			<p class="muted">{t('player.listeners', { count: controller.remotes })}</p>
		</header>

		{#if !controller.supported}
			<p class="note note--warn" data-testid="no-support">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('player.noSupport')}</span>
			</p>
		{:else}
			<!--
				ОЗБРОЄННЯ СТОЇТЬ ПЕРШИМ І НАЙБІЛЬШИМ.

				Доки його не натиснули, жодна команда з телефона не пролунає, і
				людина біля комп'ютера не має способу про це здогадатися: сторінка
				виглядає робочою, дошка на зв'язку, список треків на місці. Тому
				кнопка тут не «ще одна опція», а те, повз що не пройти.
			-->
			{#if !engine.armed}
				<section class="arm card" data-testid="arm-block">
					<button
						class="btn btn--primary arm__btn"
						type="button"
						onclick={() => controller?.arm()}
						data-testid="arm"
					>
						<IconPower size={22} aria-hidden="true" />
						{t('player.arm')}
					</button>
					<p class="muted">{t('player.armHint')}</p>
				</section>
			{:else}
				<p class="armed" data-testid="armed">
					<IconPower size={18} aria-hidden="true" />
					{t('player.armed')} · {t('player.keepOpen')}
				</p>
			{/if}

			<!--
					ГУЧНІСТЬ ВИДНА ЗАВЖДИ, а не лише після озброєння.

					Доки вона ховалася в гілці «звук увімкнено», рівень можна було
					виставити ЛИШЕ після першого звуку — тобто перший трек у залі йшов
					на тій гучності, яка випадково лишилася. Плюс гарячі клавіші міняли
					число, якого на екрані не було, і виглядало це як «мінус не працює».

					Цей пристрій і є той, що звучить, тож людині біля нього не треба
					шукати телефон, щоб прибрати звук.
				-->
			<div class="card volume">
				<button
					class="volume__mute"
					class:volume__mute--on={engine.muted}
					type="button"
					aria-pressed={engine.muted}
					title={engine.muted ? t('sound.unmute') : t('sound.mute')}
					aria-label={engine.muted ? t('sound.unmute') : t('sound.mute')}
					onclick={() => engine.toggleMute()}
					data-testid="player-mute"
				>
					{#if engine.muted}
						<IconMute size={20} aria-hidden="true" />
					{:else}
						<IconVolume size={20} aria-hidden="true" />
					{/if}
				</button>

				<label class="volume__slider-wrap">
					<span class="visually-hidden">{t('player.volume')}</span>
					<input
						class="volume__slider"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(engine.volume * 100)}
						data-testid="player-volume"
						oninput={(event) => engine.setVolume(Number(event.currentTarget.value) / 100)}
					/>
				</label>

				<output class="volume__value mono">{Math.round(engine.volume * 100)}</output>
			</div>

			<section class="card stack">
				{#if controller.sourceStatus === 'none'}
					<button
						class="btn btn--primary"
						type="button"
						onclick={() => controller?.pickFolder()}
						data-testid="pick-folder"
					>
						<IconFolder size={18} aria-hidden="true" />
						{t('player.pickFolder')}
					</button>
				{:else if controller.sourceStatus === 'need-permission'}
					<p class="note note--warn">
						<IconWarning size={18} aria-hidden="true" />
						<span>{t('player.folderLost')}</span>
					</p>
					<button
						class="btn btn--primary"
						type="button"
						onclick={() => controller?.restoreFolder()}
						data-testid="restore-folder"
					>
						{t('player.restore')}
					</button>
				{:else}
					<div class="folder">
						<span class="folder__name">{controller.folderName}</span>
						<div class="row">
							<button class="btn" type="button" onclick={() => controller?.rescan()}>
								<IconRefresh size={18} aria-hidden="true" />
								{t('player.rescan')}
							</button>
							<button class="btn" type="button" onclick={() => controller?.pickFolder()}>
								{t('player.changeFolder')}
							</button>
						</div>
					</div>

					{#if controller.scanning}
						<p class="muted">{t('player.scanning')}</p>
					{:else if controller.tracks.length === 0}
						<p class="muted">{t('player.empty')}</p>
					{:else}
						<p class="muted">
							{t('player.found', { count: controller.tracks.length })}
							{#if hiddenCount > 0}
								· {t('player.hiddenCount', { count: hiddenCount })}
							{/if}
						</p>

						<p class="hint">
							<IconKeyboard size={16} aria-hidden="true" />
							<span>{t('hotkeys.hint')}</span>
						</p>

						<ul class="tracks">
							{#each controller.numbered as entry (entry.track.id)}
								{@const hex = colorOf(entry.color)}
								<li
									class="tracks__row"
									class:tracks__row--hidden={entry.hidden}
									style={hex ? `--track-color: ${hex}` : undefined}
								>
									<!--
										Кнопка, а не підпис: трек запускають і звідси теж. Номер
										гарячої клавіші стоїть НА НІЙ — так домовленість «двійка
										грає другий» видно, а не тримається в голові.
									-->
									<button
										class="tracks__play"
										class:tracks__play--tinted={hex !== null}
										class:tracks__play--playing={engine.trackId === entry.track.id}
										type="button"
										disabled={entry.hidden}
										title={t('player.playHere')}
										onclick={() => controller?.playLocal(entry.track.id)}
										data-testid="play-here-{entry.track.id}"
									>
										{#if entry.hotkey}
											<kbd
												class="tracks__key"
												aria-label={t('hotkeys.slot', { key: entry.hotkey })}
											>
												{entry.hotkey}
											</kbd>
										{:else}
											<IconPlay class="tracks__icon" size={16} aria-hidden="true" />
										{/if}
										<span class="tracks__title">{entry.track.title}</span>
									</button>

									<!--
										Колір — це те, за чим трек знаходять оком у темному залі,
										швидше за будь-яку назву. Тому він живе поруч зі списком,
										а не в окремих властивостях, куди ніхто не зайде.
									-->
									<button
										class="tracks__color"
										type="button"
										aria-expanded={paletteFor === entry.track.id}
										title={t('color.pick')}
										aria-label={t('color.pick')}
										onclick={() =>
											(paletteFor = paletteFor === entry.track.id ? null : entry.track.id)}
										data-testid="color-{entry.track.id}"
									>
										<span class="tracks__swatch" aria-hidden="true"></span>
									</button>

									<button
										class="tracks__toggle"
										type="button"
										title={entry.hidden ? t('player.show') : t('player.hide')}
										aria-label={entry.hidden ? t('player.show') : t('player.hide')}
										onclick={() => controller?.toggleHidden(entry.track.id)}
									>
										{#if entry.hidden}
											<IconEyeOff size={18} aria-hidden="true" />
										{:else}
											<IconEye size={18} aria-hidden="true" />
										{/if}
									</button>
								</li>

								{#if paletteFor === entry.track.id}
									<li class="palette" data-testid="palette-{entry.track.id}">
										<button
											class="palette__cell palette__cell--none"
											type="button"
											title={t('color.none')}
											aria-label={t('color.none')}
											aria-pressed={entry.color === null}
											onclick={() => {
												void controller?.setColor(entry.track.id, null);
												paletteFor = null;
											}}
										>
											<IconEyeOff size={14} aria-hidden="true" />
										</button>

										{#each TRACK_COLORS as swatch (swatch.slug)}
											<button
												class="palette__cell"
												type="button"
												style="--swatch: {swatch.hex}"
												title={t('color.label', { n: colorNumber(swatch.slug) })}
												aria-label={t('color.label', { n: colorNumber(swatch.slug) })}
												aria-pressed={entry.color === swatch.slug}
												onclick={() => {
													void controller?.setColor(entry.track.id, swatch.slug);
													paletteFor = null;
												}}
												data-testid="swatch-{swatch.slug}"
											></button>
										{/each}
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			{#if controller.trouble}
				<p class="error" role="alert" data-testid="player-trouble">
					{t(controller.trouble.key as 'error.playback', { name: controller.trouble.name })}
				</p>
			{/if}
		{/if}
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

	.arm {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		border-color: var(--accent);
	}

	.arm__btn {
		min-height: 64px;
		font-size: 1.1rem;
	}

	.armed {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		color: var(--ok);
		font-size: 0.9rem;
	}

	.folder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.folder__name {
		font-weight: 600;
		word-break: break-all;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.note--warn {
		color: var(--warn);
	}

	.tracks {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 50vh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.tracks__row {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-sm);
	}

	.tracks__row:nth-child(odd) {
		background: var(--bg-sunken);
	}

	.tracks__play {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--gap-sm);
		min-width: 0;
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: start;
	}

	.tracks__play:hover:not(:disabled),
	.tracks__play:focus-visible {
		border-color: var(--accent);
	}

	.tracks__play:disabled {
		cursor: default;
		opacity: 0.55;
	}

	/*
	 * Колір ніколи не стає ТЛОМ ПІД ТЕКСТОМ: він смуга збоку плюс підкладка на
	 * 12%. Інакше довелося б добирати пару «текст на кольорі» для кожної з десяти
	 * заготовок і для обох тем — двадцять пар, з яких половина не існує.
	 */
	.tracks__play--tinted {
		border-inline-start: 4px solid var(--track-color);
		background: color-mix(in oklab, var(--track-color) 12%, transparent);
	}

	.tracks__color {
		display: grid;
		place-items: center;
		width: var(--tap);
		min-height: var(--tap);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
	}

	.tracks__swatch {
		width: 16px;
		height: 16px;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
		/* Без кольору кружечок лишається порожнім — це теж відповідь. */
		background: var(--track-color, transparent);
	}

	.tracks__color:hover .tracks__swatch,
	.tracks__color:focus-visible .tracks__swatch {
		border-color: var(--accent);
	}

	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		padding: var(--gap-xs) var(--gap-sm) var(--gap-sm);
	}

	.palette__cell {
		width: 32px;
		height: 32px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
	}

	.palette__cell--none {
		display: grid;
		place-items: center;
		background: var(--bg-sunken);
		border-color: var(--border-strong);
		color: var(--text-secondary);
	}

	.palette__cell:hover,
	.palette__cell:focus-visible {
		border-color: var(--text-primary);
	}

	.palette__cell[aria-pressed='true'] {
		border-color: var(--text-primary);
		box-shadow: 0 0 0 2px var(--bg-surface);
	}

	.tracks__play--playing {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 700;
	}

	/* Номер клавіші — у вигляді клавіші, щоб його не читали як порядковий номер. */
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

	.tracks__play :global(.tracks__icon) {
		flex: none;
		width: 24px;
		color: var(--text-muted);
	}

	.tracks__row--hidden .tracks__title {
		color: var(--text-secondary);
		text-decoration: line-through;
	}

	.tracks__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.volume {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		padding: var(--gap-sm) var(--gap);
	}

	.volume__mute {
		display: grid;
		place-items: center;
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

	.volume__slider-wrap {
		display: flex;
		flex: 1;
		min-width: 0;
	}

	.volume__slider {
		width: 100%;
		height: var(--tap);
		accent-color: var(--accent);
	}

	.volume__value {
		min-width: 3ch;
		text-align: end;
		color: var(--text-secondary);
	}

	.tracks__toggle {
		display: grid;
		place-items: center;
		width: var(--tap);
		min-height: var(--tap);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.tracks__toggle:hover,
	.tracks__toggle:focus-visible {
		color: var(--accent);
	}
</style>
