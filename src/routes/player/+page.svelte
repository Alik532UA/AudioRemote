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
		IconPhone,
		IconPlay,
		IconPrev,
		IconRefresh,
		IconSliders,
		IconStop,
		IconUp,
		IconVolume,
		IconWarning,
		IconZap
	} from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { titleLines } from '$lib/audio/source';
	import TrackDialog from '$lib/components/player/TrackDialog.svelte';
	import RemoteDialog from '$lib/components/player/RemoteDialog.svelte';
	import ArmDialog from '$lib/components/player/ArmDialog.svelte';
	import HotkeyTips from '$lib/components/ui/HotkeyTips.svelte';
	import { boardPanel } from '$lib/services/boardPanel.svelte';
	import { narrow } from '$lib/services/narrow.svelte';
	import { settings } from '$lib/settings/settings.svelte';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);
	/** Для якого треку відкрите вікно налаштувань. `null` — для жодного. */
	let openFor = $state<string | null>(null);
	/** Чи відкрите вікно «як підключити пульт». */
	let remoteOpen = $state(false);
	/** Вікно «увімкнути звук» закрили, не вмикаючи. Більше не питаємо. */
	let armDismissed = $state(false);
	/**
	 * Чи розгорнута дека на телефоні. `null` — «як само вийде».
	 *
	 * Саме по собі керування там потрібне лише тоді, коли є що ним керувати:
	 * доки трек не обрано, від смуги перемотки й чотирьох кнопок користі нема, а
	 * висоту вони забирають у списку — тобто в того, чим у цю мить і зайняті.
	 * Гучність лишається завжди: її крутять і в тиші.
	 *
	 * Натискання на стрілку перебиває це рішення в обидва боки.
	 */
	let deckOpen = $state<boolean | null>(null);
	/** Палець на повзунку перемотки: доти позиція з плеєра його не смикає. */
	let seeking = $state(false);
	let seekValue = $state(0);

	const clock = (ms: number) => {
		const total = Math.max(0, Math.round(ms / 1000));
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	};

	onMount(() => {
		// Потрібні тут заради `showTrigger`: сторінку відкривають і прямим
		// посиланням, минаючи корінь, який їх читає.
		settings.load();
		boardSession.restore();
		const board = boardSession.current;
		if (!board) {
			// У МЕНЮ, а не в корінь: корінь — стрілочник, і за налаштуванням
			// «відкривати приймач» він відправив би сюди знову, по колу.
			void goto(resolve('/menu'));
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

<!--
	Шапка дошки живе окремим фрагментом, бо місце їй різне: на широкому екрані
	картка в лівій колонці, на телефоні — рядок у смузі застосунку. Вузол при
	цьому ОДИН.
-->
{#snippet boardHead()}
	{#if controller && boardSession.current}
		{@const board = boardSession.current}
		<header class="head" class:card={!narrow.matches} data-testid="board-head">
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
	{/if}
{/snippet}

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
			<div class="board__col board__col--side">
				{#if !narrow.matches}
					{@render boardHead()}
				{/if}
			</div>

			<!-- ─── Керування ─────────────────────────────────────────────── -->
			<!--
				На телефоні керування зʼявляється разом із папкою: доки її не обрано,
				керувати нема чим, а екран потрібен кнопці «обрати папку». Умова стоїть
				НАД колонкою, а не всередині: порожня колонка лишала по собі проміжок і
				заважала короткій дошці стати посеред екрана.
			-->
			{#if !narrow.matches || controller.folderName !== null}
				{@const full = !narrow.matches || (deckOpen ?? engine.trackId !== null)}
				<div class="board__col board__col--deck">
					<section class="deck card" class:deck--short={!full} data-testid="deck">
						{#if !narrow.matches}
							<HotkeyTips keepOpen={engine.armed} id="deck-tips" />
						{:else if full}
							<!--
								На місці значка підказки — «згорнути». Підказка там про гарячі
								клавіші, а в телефона клавіатури немає; місце ж у правому
								верхньому куті потрібне саме тут.
							-->
							<button
								class="deck__fold"
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
							<p class="deck__now" data-testid="now-playing">
								{current?.title ?? t('remote.nothing')}
							</p>

							<!--
								Смуга перемотки. Поки палець на ній, позиція з плеєра її не смикає:
								інакше кожне оновлення відкидало б повзунок назад під пальцем.
							-->
							<div class="bar">
								<span class="bar__time mono">{clock(seeking ? seekValue : engine.positionMs)}</span>
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
									max={Math.max(1000, engine.durationMs)}
									step="250"
									disabled={!engine.trackId}
									value={seeking ? seekValue : engine.positionMs}
									data-testid="player-seek"
									onpointerdown={(event) => {
										seeking = true;
										seekValue = Number(event.currentTarget.value);
									}}
									oninput={(event) => (seekValue = Number(event.currentTarget.value))}
									onpointerup={(event) => {
										seeking = false;
										void controller?.seekLocal(Number(event.currentTarget.value));
									}}
									onpointercancel={() => (seeking = false)}
									onkeydown={() => (seeking = true)}
									onkeyup={(event) => {
										seeking = false;
										void controller?.seekLocal(Number(event.currentTarget.value));
									}}
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
						{/if}

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

							{#if !full}
								<!--
									У згорнутому вигляді стрілка стоїть у самому рядку гучності:
									верхнього кута тут просто немає — картка заввишки в один рядок.
								-->
								<button
									class="mute"
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

					{#if controller.trouble}
						<p class="error" role="alert" data-testid="player-trouble">
							{t(controller.trouble.key as 'error.playback', { name: controller.trouble.name })}
						</p>
					{/if}
				</div>
			{/if}

			<!-- ─── Список ────────────────────────────────────────────────── -->
			<div class="board__col board__col--list">
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
									<!--
										Стан треку показує ВЕСЬ РЯДОК, а не підпис усередині нього. Обвідка
										навколо самих літер виглядала як поле вводу, у яке потрапив курсор, а
										не як «оцей трек зараз грає». На пульті вона з самого початку була на
										рядку — два екрани однієї дошки показували те саме по-різному.
									-->
									<div
										class="tracks__main"
										class:tracks__main--tinted={hex !== null}
										class:tracks__main--current={engine.trackId === entry.id}
										class:tracks__main--playing={engine.trackId === entry.id && engine.playing}
									>
										<!--
											Клавіша тут ПІДПИС, а не кнопка: натискають її на клавіатурі, а
											мінять у вікні налаштувань. Кнопка, що відкриває вікно, стоїть
											окремо — там, де раніше було «приховати».
										
											На телефоні її немає зовсім: клавіатури там нема, а місце в рядку
											потрібне назві.
										-->
										{#if !narrow.matches}
											<kbd class="tracks__key" data-testid="key-{entry.id}">
												{controller.keyLabels[entry.id] ?? '·'}
											</kbd>
										{/if}

										<button
											class="tracks__title"
											type="button"
											disabled={entry.hidden}
											title={t('player.playHere')}
											onclick={() => controller?.toggleLocal(entry.id)}
											data-testid="play-here-{entry.id}"
										>
											{#if narrow.matches}
												{#each titleLines(entry.title) as line (line)}
													<span class="tracks__line">{line}</span>
												{/each}
											{:else}
												{entry.title}
											{/if}
										</button>

										{#if settings.showTrigger && entry.trigger?.on}
											<!--
												Значок відповідає на «чому воно заграло саме́». Без нього про запуск
												за API знав би лише той, хто відкрив налаштування саме цього треку.
											-->
											<span
												class="tracks__zap"
												title={t('track.trigger')}
												aria-label={t('track.trigger')}
												data-testid="trigger-mark-{entry.id}"
											>
												<IconZap size={14} aria-hidden="true" />
											</span>
										{/if}

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
												data-testid="track-settings-{entry.id}"
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
		{#if !engine.armed && !armDismissed}
			<ArmDialog
				onarm={() => controller?.arm() ?? Promise.resolve(false)}
				ondismiss={() => (armDismissed = true)}
			/>
		{/if}

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
	/* Значок, підпис і назва теки — один рядок картки, а не три сусіди. */

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

	/* Згорнута — це один рядок: падінг картки на весь зріст тут зайвий. */
	.deck--short {
		padding-block: var(--gap-sm);
	}

	/*
	 * Стоїть там само, де на широкому екрані значок підказки, і виглядає так
	 * само: у правому верхньому куті картки живе рівно один дрібний орган.
	 */
	.deck__fold {
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

	.deck__fold:hover,
	.deck__fold:focus-visible {
		color: var(--accent);
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
		border: 1px solid transparent;
		border-inline-start: 4px solid transparent;
		border-radius: var(--radius-sm);
	}

	/*
	 * На телефоні рядок удвічі вищий. Це єдина ціль у списку, у яку цілять
	 * пальцем не дивлячись — під час заняття, збоку, однією рукою. Мінімальні
	 * 44px тут замало: вони про «можна влучити», а не про «важко промазати».
	 */
	@media (max-width: 899px) {
		.tracks__main {
			min-height: calc(var(--tap) * 2);
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

	/* Наведення й фокус теж малюються на рядку — там, де тепер і стан. */
	.tracks__main:has(.tracks__title:hover:not(:disabled)),
	.tracks__main:has(.tracks__title:focus-visible) {
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
	.tracks__main--current {
		border-color: var(--border-strong);
		font-weight: 700;
	}

	.tracks__main--playing {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Позначка живе поруч із інструментами й теж не ловить натискання назви. */
	.tracks__zap {
		display: grid;
		place-items: center;
		flex: none;
		color: var(--text-secondary);
	}

	/* Вище за накладку назви — інакше «вгору» теж запускало б трек. */
	.tracks__zap,
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
