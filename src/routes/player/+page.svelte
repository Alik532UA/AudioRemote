<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconBack,
		IconCheck,
		IconCopy,
		IconDown,
		IconEye,
		IconEyeOff,
		IconFolder,
		IconKeyboard,
		IconMute,
		IconNext,
		IconPause,
		IconPlay,
		IconPower,
		IconRefresh,
		IconStop,
		IconUp,
		IconVolume,
		IconWarning
	} from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';
	import { hotkeyFor, HOTKEY_SLOTS } from '$lib/hotkeys/hotkeys';
	import { colorNumber, colorOf, TRACK_COLORS } from '$lib/config/trackColors';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);
	/** Для якого треку відкрита панель призначень. `null` — для жодного. */
	let openFor = $state<string | null>(null);
	let copied = $state(false);
	/** Палець на повзунку перемотки: доти позиція з плеєра його не смикає. */
	let seeking = $state(false);
	let seekValue = $state(0);

	const slots = Array.from({ length: HOTKEY_SLOTS }, (_, index) => index + 1);

	const clock = (ms: number) => {
		const total = Math.max(0, Math.round(ms / 1000));
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	};

	async function copySecret() {
		const board = boardSession.current;
		if (!board?.password) return;
		try {
			await navigator.clipboard.writeText(
				[
					`${t('create.idLabel')}: ${board.id}`,
					`${t('create.passwordLabel')}: ${board.password}`
				].join(String.fromCharCode(10))
			);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Буфер заборонений політикою — обидва рядки й так на екрані.
		}
	}

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
		 * комп'ютера тисне цифру, не клікнувши перед тим нікуди. Набір у полі
		 * вводу від цього не страждає — `hotkeyFor` сам відмовляється, коли фокус
		 * у полі.
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
</script>

<div class="stack stack--wide">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	{#if fatal}
		<p class="error" role="alert">{fatal}</p>
	{:else if controller && boardSession.current}
		{@const board = boardSession.current}
		{@const engine = controller.engine}
		{@const current = controller.entries.find((entry) => entry.id === engine.trackId) ?? null}

		<!--
			ТРИ КОЛОНКИ НА ШИРОКОМУ ЕКРАНІ.

			Доти все стояло одним стовпцем на 760px: на моніторі це смуга
			посередині, порожньо з боків і прокрутка там, де прокручувати нема чого.
			Тепер ліворуч дошка, посередині керування, праворуч список — і всі три
			видно одночасно, бо в залі дивляться на всі три.

			Колонки згортаються самі: на телефоні один стовпець, на планшеті два.
		-->
		<div class="board">
			<div class="board__col">
				<header class="head card">
					<div>
						<h1 class="head__title">{board.name || t('player.title')}</h1>
						<p class="muted mono">{board.id}</p>
					</div>
					<p class="muted">{t('player.listeners', { count: controller.remotes })}</p>
				</header>

				{#if board.password}
					<!--
						Пароль видно й тут, а не лише в мить створення: відновити його з
						адреси неможливо за побудовою. Блок згорнутий і поле замасковане —
						пароль на екрані в залі бачить не лише той, хто його спитав.
					-->
					<details class="fold card" data-testid="board-secret">
						<summary class="fold__toggle">{t('player.showSecret')}</summary>
						<div class="fold__body">
							<div class="field">
								<span class="field__label">{t('create.idLabel')}</span>
								<output class="secret__id mono">{board.id}</output>
							</div>
							<PasswordField
								id="player-password"
								label={t('create.passwordLabel')}
								value={board.password}
								autocomplete="off"
								readonly
							/>
							<button class="btn" type="button" onclick={copySecret} data-testid="copy-secret">
								{#if copied}
									<IconCheck size={18} aria-hidden="true" />
									{t('common.copied')}
								{:else}
									<IconCopy size={18} aria-hidden="true" />
									{t('common.copy')}
								{/if}
							</button>
						</div>
					</details>
				{/if}

				<section class="card stack">
					{#if !controller.supported}
						<p class="note note--warn" data-testid="no-support">
							<IconWarning size={18} aria-hidden="true" />
							<span>{t('player.noSupport')}</span>
						</p>
					{:else if controller.sourceStatus === 'none'}
						<button
							class="btn btn--primary"
							type="button"
							onclick={() => controller?.pickFolder()}
							data-testid="pick-folder"
						>
							<IconFolder size={18} aria-hidden="true" />
							{t('player.pickFolder')}
						</button>
						<p class="muted">{t('player.pickAgain')}</p>
					{:else}
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
						{#if !controller.configWritable}
							<p class="note note--warn" data-testid="config-readonly">
								<IconWarning size={18} aria-hidden="true" />
								<span>{t('player.configReadonly')}</span>
							</p>
						{/if}
					{/if}
				</section>
			</div>

			<!-- ─── Керування ─────────────────────────────────────────────── -->
			<div class="board__col">
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
				{/if}

				<section class="deck card">
					<p class="deck__now" data-testid="now-playing">
						{current?.title ?? t('remote.nothing')}
					</p>

					<!--
						Смуга перемотки. Поки палець на ній, позиція з плеєра її не смикає:
						інакше кожне оновлення відкидало б повзунок назад під пальцем.
					-->
					<div class="bar">
						<span class="bar__time mono">{clock(seeking ? seekValue : engine.positionMs)}</span>
						<input
							class="bar__range"
							type="range"
							min="0"
							max={Math.max(1000, engine.durationMs)}
							step="250"
							disabled={!engine.trackId}
							value={seeking ? seekValue : engine.positionMs}
							data-testid="player-seek"
							onpointerdown={() => (seeking = true)}
							onpointerup={() => {
								seeking = false;
								engine.seek(seekValue);
							}}
							oninput={(event) => (seekValue = Number(event.currentTarget.value))}
						/>
						<span class="bar__time mono">{clock(engine.durationMs)}</span>
					</div>

					<div class="deck__buttons">
						{#if engine.playing}
							<button
								class="btn btn--primary deck__btn"
								type="button"
								onclick={() => engine.pause()}
								data-testid="player-pause"
							>
								<IconPause size={22} aria-hidden="true" />
								{t('remote.pause')}
							</button>
						{:else}
							<button
								class="btn btn--primary deck__btn"
								type="button"
								disabled={!engine.trackId}
								onclick={() => engine.resume()}
								data-testid="player-resume"
							>
								<IconPlay size={22} aria-hidden="true" />
								{t('remote.resume')}
							</button>
						{/if}

						<button
							class="btn deck__btn"
							type="button"
							disabled={!engine.trackId}
							onclick={() => engine.stop()}
							data-testid="player-stop"
						>
							<IconStop size={22} aria-hidden="true" />
							{t('remote.stop')}
						</button>

						<button
							class="btn deck__btn"
							type="button"
							disabled={controller.visible.length === 0}
							onclick={() => {
								const next = engine.nextTrackId();
								if (next) void controller?.playLocal(next);
							}}
							data-testid="player-next"
						>
							<IconNext size={22} aria-hidden="true" />
							{t('remote.next')}
						</button>
					</div>

					<div class="bar">
						<button
							class="mute"
							class:mute--on={engine.muted}
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

						<label class="bar__wrap">
							<span class="visually-hidden">{t('player.volume')}</span>
							<input
								class="bar__range"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(engine.volume * 100)}
								data-testid="player-volume"
								oninput={(event) => engine.setVolume(Number(event.currentTarget.value) / 100)}
							/>
						</label>

						<output class="bar__time mono">{Math.round(engine.volume * 100)}</output>
					</div>

					<p class="hint">
						<IconKeyboard size={16} aria-hidden="true" />
						<span>{t('hotkeys.hint')}</span>
					</p>

					{#if engine.armed}
						<p class="armed" data-testid="armed">
							<IconPower size={16} aria-hidden="true" />
							{t('player.keepOpen')}
						</p>
					{/if}
				</section>

				{#if controller.trouble}
					<p class="error" role="alert" data-testid="player-trouble">
						{t(controller.trouble.key as 'error.playback', { name: controller.trouble.name })}
					</p>
				{/if}
			</div>

			<!-- ─── Список ────────────────────────────────────────────────── -->
			<div class="board__col">
				<section class="card stack">
					{#if controller.scanning}
						<p class="muted">{t('player.scanning')}</p>
					{:else if controller.entries.length === 0}
						<p class="muted">{t('player.empty')}</p>
					{:else}
						<p class="muted">
							{t('player.found', { count: controller.entries.length })}
							{#if controller.hiddenCount > 0}
								· {t('player.hiddenCount', { count: controller.hiddenCount })}
							{/if}
						</p>

						<ul class="tracks">
							{#each controller.entries as entry, index (entry.id)}
								{@const hex = colorOf(entry.color)}
								<li
									class="tracks__row"
									class:tracks__row--hidden={entry.hidden}
									style={hex ? `--track-color: ${hex}` : undefined}
								>
									<div class="tracks__main" class:tracks__main--tinted={hex !== null}>
										<button
											class="tracks__key"
											type="button"
											aria-expanded={openFor === entry.id}
											title={t('hotkeys.assign')}
											aria-label={t('hotkeys.assign')}
											onclick={() => (openFor = openFor === entry.id ? null : entry.id)}
											data-testid="key-{entry.id}"
										>
											{entry.hotkey ?? '·'}
										</button>

										<button
											class="tracks__title"
											class:tracks__title--playing={engine.trackId === entry.id}
											type="button"
											disabled={entry.hidden}
											title={t('player.playHere')}
											onclick={() => controller?.playLocal(entry.id)}
											data-testid="play-here-{entry.id}"
										>
											{entry.title}
										</button>

										<div class="tracks__tools">
											<button
												class="icon-btn"
												type="button"
												disabled={index === 0}
												title={t('player.moveUp')}
												aria-label={t('player.moveUp')}
												onclick={() => controller?.move(entry.id, -1)}
												data-testid="up-{entry.id}"
											>
												<IconUp size={16} aria-hidden="true" />
											</button>
											<button
												class="icon-btn"
												type="button"
												disabled={index === controller.entries.length - 1}
												title={t('player.moveDown')}
												aria-label={t('player.moveDown')}
												onclick={() => controller?.move(entry.id, 1)}
												data-testid="down-{entry.id}"
											>
												<IconDown size={16} aria-hidden="true" />
											</button>
											<button
												class="icon-btn"
												type="button"
												title={entry.hidden ? t('player.show') : t('player.hide')}
												aria-label={entry.hidden ? t('player.show') : t('player.hide')}
												onclick={() => controller?.toggleHidden(entry.id)}
											>
												{#if entry.hidden}
													<IconEyeOff size={16} aria-hidden="true" />
												{:else}
													<IconEye size={16} aria-hidden="true" />
												{/if}
											</button>
										</div>
									</div>

									{#if openFor === entry.id}
										<div class="picker" data-testid="picker-{entry.id}">
											<div class="picker__row">
												<span class="picker__label">{t('hotkeys.assign')}</span>
												<button
													class="picker__key"
													type="button"
													aria-pressed={entry.hotkey === null}
													onclick={() => controller?.setHotkey(entry.id, null)}
												>
													·
												</button>
												{#each slots as slot (slot)}
													<button
														class="picker__key"
														type="button"
														aria-pressed={entry.hotkey === slot}
														onclick={() => controller?.setHotkey(entry.id, slot)}
														data-testid="assign-{entry.id}-{slot}"
													>
														{slot}
													</button>
												{/each}
											</div>

											<div class="picker__row">
												<span class="picker__label">{t('color.pick')}</span>
												<button
													class="picker__cell picker__cell--none"
													type="button"
													title={t('color.none')}
													aria-label={t('color.none')}
													aria-pressed={entry.color === null}
													onclick={() => controller?.setColor(entry.id, null)}
												>
												</button>
												{#each TRACK_COLORS as swatch (swatch.slug)}
													<button
														class="picker__cell"
														type="button"
														style="--swatch: {swatch.hex}"
														title={t('color.label', { n: colorNumber(swatch.slug) })}
														aria-label={t('color.label', { n: colorNumber(swatch.slug) })}
														aria-pressed={entry.color === swatch.slug}
														onclick={() => controller?.setColor(entry.id, swatch.slug)}
														data-testid="swatch-{swatch.slug}"
													></button>
												{/each}
											</div>
										</div>
									{/if}
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
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		align-self: start;
		min-height: var(--tap);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.board {
		display: grid;
		gap: var(--gap);
		grid-template-columns: 1fr;
		align-items: start;
	}

	@media (min-width: 900px) {
		.board {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (min-width: 1280px) {
		.board {
			grid-template-columns: 320px minmax(300px, 1fr) minmax(340px, 1.2fr);
		}
	}

	.board__col {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		min-width: 0;
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

	.fold {
		padding: 0;
	}

	.fold__toggle {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 0.9rem;
		list-style-position: inside;
	}

	.fold__toggle:hover {
		color: var(--accent);
	}

	.fold__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: 0 var(--gap) var(--gap);
	}

	.secret__id {
		font-size: 1.4rem;
		font-weight: 700;
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
		gap: var(--gap-xs);
		color: var(--ok);
		font-size: 0.8rem;
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

	.hint {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	/* --- Керування --------------------------------------------------------- */

	.deck {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.deck__now {
		font-size: clamp(1.1rem, 3vw, 1.5rem);
		font-weight: 700;
		text-wrap: balance;
	}

	.deck__buttons {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: var(--gap-sm);
	}

	.deck__btn {
		min-height: 56px;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	.bar__wrap {
		display: flex;
		flex: 1;
		min-width: 0;
	}

	.bar__range {
		flex: 1;
		width: 100%;
		min-width: 0;
		height: var(--tap);
		accent-color: var(--accent);
	}

	.bar__time {
		min-width: 4ch;
		color: var(--text-secondary);
		font-size: 0.8rem;
		text-align: center;
	}

	.mute {
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

	.mute:hover,
	.mute:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.mute--on {
		border-color: var(--warn);
		color: var(--warn);
	}

	/* --- Список ------------------------------------------------------------ */

	.tracks {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 60vh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.tracks__main {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		padding: 2px var(--gap-xs);
		border-inline-start: 4px solid transparent;
		border-radius: var(--radius-sm);
	}

	/*
	 * Колір ніколи не стає тлом ПІД ТЕКСТОМ: він смуга збоку плюс підкладка на
	 * 12%. Інакше довелося б добирати пару «текст на кольорі» для кожної з
	 * десяти заготовок і для обох тем.
	 */
	.tracks__main--tinted {
		border-inline-start-color: var(--track-color);
		background: color-mix(in oklab, var(--track-color) 12%, transparent);
	}

	.tracks__row:nth-child(odd) .tracks__main:not(.tracks__main--tinted) {
		background: var(--bg-sunken);
	}

	.tracks__row--hidden .tracks__title {
		color: var(--text-secondary);
		text-decoration: line-through;
	}

	/* Клавіша — у вигляді клавіші, щоб не читалася як порядковий номер. */
	.tracks__key {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1;
	}

	.tracks__key:hover,
	.tracks__key:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.tracks__title {
		flex: 1;
		min-width: 0;
		min-height: var(--tap);
		padding: 0 var(--gap-xs);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		cursor: pointer;
		overflow: hidden;
		text-align: start;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tracks__title:hover:not(:disabled),
	.tracks__title:focus-visible {
		border-color: var(--accent);
	}

	.tracks__title--playing {
		color: var(--accent);
		font-weight: 700;
	}

	.tracks__tools {
		display: flex;
		flex: none;
		gap: 2px;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover:not(:disabled),
	.icon-btn:focus-visible {
		color: var(--accent);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	/* --- Панель призначень -------------------------------------------------- */

	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		padding: var(--gap-xs) var(--gap-sm) var(--gap-sm) calc(var(--gap-sm) + 4px);
	}

	.picker__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-xs);
	}

	.picker__label {
		min-width: 9ch;
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.picker__key {
		width: 28px;
		height: 28px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.picker__cell {
		width: 28px;
		height: 28px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
	}

	.picker__cell--none {
		border-color: var(--border-strong);
		background: var(--bg-sunken);
	}

	.picker__key:hover,
	.picker__key:focus-visible,
	.picker__cell:hover,
	.picker__cell:focus-visible {
		border-color: var(--accent);
	}

	.picker__key[aria-pressed='true'],
	.picker__cell[aria-pressed='true'] {
		border-color: var(--text-primary);
		color: var(--text-primary);
	}
</style>
