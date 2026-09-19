<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconDown,
		IconFolder,
		IconInfo,
		IconKeyboard,
		IconMute,
		IconNext,
		IconPause,
		IconPhone,
		IconPlay,
		IconPower,
		IconPrev,
		IconRefresh,
		IconSliders,
		IconStop,
		IconUp,
		IconVolume,
		IconWarning
	} from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import TrackDialog from '$lib/components/player/TrackDialog.svelte';
	import RemoteDialog from '$lib/components/player/RemoteDialog.svelte';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);
	/** Для якого треку відкрите вікно налаштувань. `null` — для жодного. */
	let openFor = $state<string | null>(null);
	/** Чи відкрите вікно «як підключити пульт». */
	let remoteOpen = $state(false);
	/** Чи розгорнуті підказки під керуванням. Згорнуті — типово. */
	let tipsOpen = $state(false);
	/** Палець на повзунку перемотки: доти позиція з плеєра його не смикає. */
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
		 * вводу від цього не страждає — `resolveKey` сам відмовляється, коли фокус
		 * у полі.
		 */
		const onKeydown = (event: KeyboardEvent) => {
			// Поки відкрите вікно треку, клавіші належать ЙОМУ: там ловлять ту, яку
			// саме призначають, і запускати нею трек посеред призначення безглуздо.
			if (openFor !== null) return;

			// `resolveKey` синхронна навмисно: `preventDefault()` мусить статися до
			// будь-якого `await`, інакше пробіл устигне прокрутити сторінку.
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
</script>

<div class="stack stack--wide">
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
				<!--
					УСЕ ПРО ДОШКУ В ОДНІЙ КАРТЦІ. Пароль доти лежав у згорнутому блоці під
					нею — окрема картка заради рядка, який читають раз на день. Тепер там
					кнопка, а за нею інструкція разом із паролем: одне місце на одне
					питання «як підключити телефон».
				-->
				<header class="head card">
					<div class="head__who">
						<h1 class="head__title">{board.name || t('player.title')}</h1>
						<p class="muted mono">{board.id}</p>
					</div>
					<div class="head__side">
						<p class="muted">{t('player.listeners', { count: controller.remotes })}</p>
						{#if board.password}
							<button
								class="btn btn--sm"
								type="button"
								onclick={() => (remoteOpen = true)}
								data-testid="open-remote"
							>
								<IconPhone size={18} aria-hidden="true" />
								{t('player.connect')}
							</button>
						{/if}
					</div>
				</header>

				<!--
					Прохання ввімкнути звук стоїть біля самої дошки, а не над керуванням:
					це крок налаштування дошки, як і вибір папки, а не орган плеєра. У
					середній колонці воно ще й зсувало все керування вниз рівно тоді, коли
					до нього тягнуться вперше.
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
				{/if}
			</div>

			<!-- ─── Керування ─────────────────────────────────────────────── -->
			<div class="board__col">
				<section class="deck card">
					<!--
						ПІДКАЗКА — ТУЛТІП, А НЕ БЛОК У КАРТЦІ.

						Перелік клавіш читають один раз, а місце під кнопками він займав
						завжди. Коли підказка розкривалася всередині картки, вона ще й
						зсувала все нижче — тобто рухала те, на що людина щойно дивилася.
						Тултіп лежить НАД вмістом і не рухає нічого.

						Показ і на наведення, і на натискання: на дотиковому екрані наведення
						не буває, і сама лише `:hover` лишила б підказку недосяжною з
						телефона. Клавіатуру додає `:focus-visible` — див. стилі нижче.
					-->
					<div class="tip" class:tip--open={tipsOpen}>
						<button
							class="tip__btn"
							type="button"
							aria-expanded={tipsOpen}
							aria-describedby="deck-tips"
							aria-label={t('player.tips')}
							onclick={() => (tipsOpen = !tipsOpen)}
							data-testid="toggle-tips"
						>
							<IconInfo size={18} aria-hidden="true" />
						</button>

						<div class="tip__panel" id="deck-tips" role="tooltip" data-testid="tips">
							<p class="tip__title">
								<IconKeyboard size={16} aria-hidden="true" />
								{t('hotkeys.tipTitle')}
							</p>

							<!--
								РЯДОК НА ДІЮ, а не суцільне речення.

								Перелік клавіш читають не так, як текст: шукають очима свою
								клавішу й зупиняються. У рядок через кому шукати нема за що —
								доводиться прочитати все, щоб знайти одне.
							-->
							<dl class="keys">
								<dt><kbd>Space</kbd></dt>
								<dd>{t('hotkeys.actPlayPause')}</dd>

								<dt><kbd>0</kbd></dt>
								<dd>{t('hotkeys.actStop')}</dd>

								<dt><kbd>1</kbd>–<kbd>9</kbd></dt>
								<dd>{t('hotkeys.actTrack')}</dd>

								<dt><kbd>←</kbd><kbd>→</kbd></dt>
								<dd>{t('hotkeys.actSeek')}</dd>

								<dt><kbd>↑</kbd><kbd>↓</kbd></dt>
								<dd>{t('hotkeys.actVolume')}</dd>

								<dt><kbd>M</kbd></dt>
								<dd>{t('hotkeys.actMute')}</dd>
							</dl>

							<p class="tip__foot">{t('hotkeys.tipFoot')}</p>

							{#if engine.armed}
								<p class="armed" data-testid="armed">
									<IconPower size={16} aria-hidden="true" />
									{t('player.keepOpen')}
								</p>
							{/if}
						</div>
					</div>

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

					<!--
						САМІ ЗНАЧКИ, БЕЗ ПІДПИСІВ. Чотири кнопки з підписами в колонку не
						вміщалися й переносилися, а самі підписи нічого не додавали: значки
						плеєра людина читає швидше за слово й однаково в будь-якій мові.
						Назва лишається в `title` та `aria-label` — для миші, що зависла, і
						для читача екрана.
					-->
					<div class="deck__buttons">
						<button
							class="btn deck__btn"
							type="button"
							disabled={controller.visible.length === 0}
							title={t('remote.prev')}
							aria-label={t('remote.prev')}
							onclick={() => {
								const prev = engine.prevTrackId();
								if (prev) void controller?.playLocal(prev);
							}}
							data-testid="player-prev"
						>
							<IconPrev size={22} aria-hidden="true" />
						</button>

						{#if engine.playing}
							<button
								class="btn btn--primary deck__btn"
								type="button"
								title={t('remote.pause')}
								aria-label={t('remote.pause')}
								onclick={() => engine.pause()}
								data-testid="player-pause"
							>
								<IconPause size={22} aria-hidden="true" />
							</button>
						{:else}
							<button
								class="btn btn--primary deck__btn"
								type="button"
								disabled={!engine.trackId}
								title={t('remote.resume')}
								aria-label={t('remote.resume')}
								onclick={() => engine.resume()}
								data-testid="player-resume"
							>
								<IconPlay size={22} aria-hidden="true" />
							</button>
						{/if}

						<button
							class="btn deck__btn"
							type="button"
							disabled={!engine.trackId}
							title={t('remote.stop')}
							aria-label={t('remote.stop')}
							onclick={() => engine.stop()}
							data-testid="player-stop"
						>
							<IconStop size={22} aria-hidden="true" />
						</button>

						<button
							class="btn deck__btn"
							type="button"
							disabled={controller.visible.length === 0}
							title={t('remote.next')}
							aria-label={t('remote.next')}
							onclick={() => {
								const next = engine.nextTrackId();
								if (next) void controller?.playLocal(next);
							}}
							data-testid="player-next"
						>
							<IconNext size={22} aria-hidden="true" />
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
				</section>

				{#if controller.trouble}
					<p class="error" role="alert" data-testid="player-trouble">
						{t(controller.trouble.key as 'error.playback', { name: controller.trouble.name })}
					</p>
				{/if}
			</div>

			<!-- ─── Список ────────────────────────────────────────────────── -->
			<div class="board__col">
				<!--
					ПАПКА Й ЇЇ ТРЕКИ — ОДНА КАРТКА.

					Доти назва папки жила у власній картці в іншій колонці, а список — у
					цій. Це дві половини одного: список і є вмістом тієї папки, і читати
					його доводилося, тримаючи в голові, звідки він узявся. Тепер назва —
					шапка цієї ж картки, а перечитати й змінити папку можна звідти ж.
				-->
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
						<!--
							Назва — смуга на всю ширину картки: відʼємні відступи рівно на її
							падінг плюс лінія знизу. Звичайним написом вона відділялася від
							списку тим самим проміжком, що й будь-які два сусіди, і читалася як
							ще один вміст, а не як заголовок того, що під нею.
						-->
						<div class="folder">
							<IconFolder size={18} aria-hidden="true" />
							<!--
								ОДИН РЯДОК: назва папки, поруч меншим — скільки в ній треків.

								Два рядки давали шапці вагу, якої вона не варта: назва папки й
								лічильник — це одна відповідь на одне питання «що це за список».
								Назва стоїть першою, бо саме її шукають очима; лічильник —
								уточнення, тому й менший.
							-->
							<div class="folder__text">
								<span class="folder__name">{controller.folderName}</span>
								<span class="folder__count">
									{#if controller.scanning}
										{t('player.scanning')}
									{:else}
										{plural(
											{
												one: 'player.tracksOne',
												few: 'player.tracksFew',
												other: 'player.tracksMany'
											},
											controller.entries.length
										)}
										{#if controller.hiddenCount > 0}
											· {t('player.hiddenCount', { count: controller.hiddenCount })}
										{/if}
									{/if}
								</span>
							</div>
							<div class="folder__tools">
								<button
									class="icon-btn"
									type="button"
									title={t('player.rescan')}
									aria-label={t('player.rescan')}
									onclick={() => controller?.rescan()}
									data-testid="rescan"
								>
									<IconRefresh size={16} aria-hidden="true" />
								</button>
								<button
									class="icon-btn"
									type="button"
									title={t('player.changeFolder')}
									aria-label={t('player.changeFolder')}
									onclick={() => controller?.pickFolder()}
									data-testid="change-folder"
								>
									<IconFolder size={16} aria-hidden="true" />
								</button>
							</div>
						</div>
						{#if !controller.configWritable}
							<p class="note note--warn" data-testid="config-readonly">
								<IconWarning size={18} aria-hidden="true" />
								<span>{t('player.configReadonly')}</span>
							</p>
						{/if}
					{/if}
					<!--
						Тут лишився САМ список. Скільки треків і звідки вони — сказано в
						шапці картки вище, і повторювати це окремим рядком означало б
						відсунути список від його ж заголовка.
					-->
					{#if controller.entries.length > 0}
						<ul class="tracks">
							{#each controller.entries as entry, index (entry.id)}
								{@const hex = colorOf(entry.color)}
								<li
									class="tracks__row"
									class:tracks__row--hidden={entry.hidden}
									style={hex ? `--track-color: ${hex}` : undefined}
								>
									<div class="tracks__main" class:tracks__main--tinted={hex !== null}>
										<!--
											Клавіша тут ПІДПИС, а не кнопка: натискають її на клавіатурі, а
											мінять у вікні налаштувань. Кнопка, що відкриває вікно, стоїть
											окремо — там, де раніше було «приховати».
										-->
										<kbd class="tracks__key" data-testid="key-{entry.id}">
											{controller.keyLabels[entry.id] ?? '·'}
										</kbd>

										<button
											class="tracks__title"
											class:tracks__title--current={engine.trackId === entry.id}
											class:tracks__title--playing={engine.trackId === entry.id && engine.playing}
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
												title={t('track.open')}
												aria-label={t('track.open')}
												onclick={() => (openFor = entry.id)}
												data-testid="open-{entry.id}"
											>
												<IconSliders size={16} aria-hidden="true" />
											</button>
										</div>
									</div>
								</li>
							{/each}
						</ul>
					{:else if controller.folderName !== null && !controller.scanning}
						<p class="muted">{t('player.empty')}</p>
					{/if}
				</section>
			</div>
		</div>
		{#if remoteOpen && board.password}
			<RemoteDialog id={board.id} password={board.password} onclose={() => (remoteOpen = false)} />
		{/if}

		{#if openFor}
			{@const chosen = controller.entries.find((entry) => entry.id === openFor)}
			{#if chosen}
				<TrackDialog track={chosen} {controller} onclose={() => (openFor = null)} />
			{/if}
		{/if}
	{:else}
		<p class="muted">{t('common.loading')}</p>
	{/if}
</div>

<style>
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
			/*
			 * Ліва колонка вузька: там лишилися тільки дошка й озброєння. Папка
			 * переїхала до свого списку, і саме йому тепер потрібна ширина.
			 */
			grid-template-columns: 280px minmax(340px, 1fr) minmax(400px, 1.4fr);
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

	.head__who {
		min-width: 0;
	}

	/* Лічильник пультів і кнопка — один стовпчик праворуч від назви дошки. */
	.head__side {
		display: flex;
		flex-direction: column;
		align-items: end;
		gap: var(--gap-xs);
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
		/*
		 * Підпис переноситься. `.btn` тримає `nowrap`, і в колонці 320px довгий
		 * напис просто обрізало по краю кнопки — половини слова не було видно.
		 */
		white-space: normal;
	}

	.armed {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--ok);
		font-size: 0.8rem;
	}

	/* Значок, підпис і назва теки — один рядок картки, а не три сусіди. */
	/*
	 * Відʼємні відступи рівно на падінг картки — смуга доходить до її країв.
	 * Без цього будь-яке тло чи лінія обривалися б, не діставши краю, і шапка
	 * читалася б як ще один вміст усередині.
	 */
	.folder {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		margin: calc(var(--gap-lg) * -1) calc(var(--gap-lg) * -1) 0;
		padding: var(--gap-sm) var(--gap-lg);
		border-bottom: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		background: var(--bg-sunken);
		color: var(--text-secondary);
	}

	@media (max-width: 480px) {
		/* На вузькому екрані картка бере менший падінг — смуга йде за ним. */
		.folder {
			margin: calc(var(--gap) * -1) calc(var(--gap) * -1) 0;
			padding: var(--gap-sm) var(--gap);
			border-radius: var(--radius) var(--radius) 0 0;
		}
	}

	.folder__text {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: var(--gap-xs);
		min-width: 0;
	}

	/* Лічильник не стискається: різати треба довгу назву, а не число. */
	.folder__count {
		flex: none;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.folder__tools {
		display: flex;
		gap: var(--gap-xs);
	}

	.folder__name {
		overflow: hidden;
		color: var(--text-primary);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	/* --- Керування --------------------------------------------------------- */

	.deck {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.tip {
		position: absolute;
		top: var(--gap-sm);
		right: var(--gap-sm);
	}

	/*
	 * Значок без кнопки навколо: рамка тут читалася б як ще один орган
	 * керування поруч із транспортом, хоч це підпис, а не дія над звуком.
	 * Сенсорна зона все одно повні 44px — вона просто не намальована.
	 */
	.tip__btn {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: color var(--transition-fast);
	}

	.tip__btn:hover,
	.tip__btn:focus-visible {
		color: var(--accent);
	}

	.tip__panel {
		position: absolute;
		top: calc(100% + var(--gap-xs));
		right: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		width: max-content;
		max-width: min(300px, calc(100vw - 48px));
		padding: var(--gap) var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
		box-shadow: 0 8px 20px var(--shadow-strong);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--transition-fast),
			visibility var(--transition-fast);
	}

	/*
	 * `:focus-visible`, а не `:focus-within`.
	 *
	 * Натискання лишає фокус на кнопці, тож із `:focus-within` підказка вже не
	 * закривалася повторним натисканням: стан перемикався, а фокус тримав її
	 * відкритою. Клавіатурі це не шкодить — Tab дає саме `:focus-visible`.
	 */
	.tip:hover .tip__panel,
	.tip:has(.tip__btn:focus-visible) .tip__panel,
	.tip--open .tip__panel {
		opacity: 1;
		visibility: visible;
	}

	@media (prefers-reduced-motion: reduce) {
		.tip__btn,
		.tip__panel {
			transition: none;
		}
	}

	.tip__title {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/*
	 * Клавіші рівним стовпчиком праворуч, дії — лівим краєм ліворуч. Око
	 * проходить по одній вертикалі, а не шукає початок кожного рядка заново.
	 */
	.keys {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--gap-xs) var(--gap-sm);
		margin: 0;
	}

	.keys dt {
		display: flex;
		gap: 2px;
		justify-content: end;
		white-space: nowrap;
	}

	.keys dd {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.keys kbd {
		display: inline-grid;
		place-items: center;
		min-width: 1.65rem;
		padding: 0.1rem 0.3rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.tip__foot {
		padding-top: var(--gap-xs);
		border-top: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	.deck__now {
		padding-right: var(--tap);
		font-size: clamp(1.1rem, 3vw, 1.5rem);
		font-weight: 700;
		text-wrap: balance;
	}

	/*
	 * Мінімум 10rem на кнопку, а не 110px.
	 *
	 * «Зупинити» з іконкою займає близько 9rem, і на 110px кнопка ставала
	 * вужчою за власний вміст. Тепер, коли три поруч не влазять, `auto-fit`
	 * переносить їх у наступний ряд — замість того щоб чавити кожну.
	 */
	/*
	 * Чотири рівні кнопки в один ряд.
	 *
	 * Без підписів вони вміщаються навіть у колонку 320px, тож переносити нема
	 * чого: керування плеєром читається як один орган, а не як два ряди.
	 */
	.deck__buttons {
		display: flex;
		gap: var(--gap-sm);
	}

	.deck__btn {
		flex: 1 1 0;
		min-width: 0;
		min-height: 56px;
		padding-inline: var(--gap-xs);
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
		position: relative;
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

	/*
	 * УВЕСЬ РЯДОК ЗАПУСКАЄ ТРЕК, а не самі літери назви.
	 *
	 * Ціль у 24 пікселі заввишки посеред рядка на 44 — це промах пальцем, і
	 * промах тут означає «нічого не сталося» на очах у залу. Кнопка лишається
	 * одна (вкладати кнопки не можна), а її поле розтягується накладкою на весь
	 * рядок. Клавіша й інструменти лежать вище за неї й ловлять свої натискання
	 * самі.
	 */
	.tracks__title::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	/*
	 * «Обраний» і «звучить» — різні стани, відколи «стоп» не скидає трек.
	 *
	 * Зупинений трек лишається обраним: із нього почне «Грати». Але малювати
	 * його так само зеленим, як той, що грає, означало б показувати звук там,
	 * де тиша.
	 */
	.tracks__title--current {
		font-weight: 700;
	}

	.tracks__title--playing {
		color: var(--accent);
	}

	/* Вище за накладку назви — інакше «вгору» теж запускало б трек. */
	.tracks__key,
	.tracks__tools {
		position: relative;
		z-index: 1;
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
</style>
