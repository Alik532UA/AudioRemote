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
		IconSettings,
		IconSliders,
		IconRefresh,
		IconStop,
		IconVolume,
		IconWarning,
		IconZap
	} from '$lib/config/icons';
	import { plural, t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { RemoteController } from '$lib/remote/controller.svelte';
	import { RemoteEditor } from '$lib/remote/editor.svelte';
	import { deriveAdminKey } from '$lib/board/boardPath';
	import { channelExists } from '$lib/net/admin';
	import AdminDialog from '$lib/components/remote/AdminDialog.svelte';
	import TrackDialog from '$lib/components/player/TrackDialog.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { folderOf, titleLines } from '$lib/audio/source';
	import Equalizer from '$lib/components/ui/Equalizer.svelte';
	import { releaseAfterTap } from '$lib/services/focus';
	import HotkeyTips from '$lib/components/ui/HotkeyTips.svelte';
	import { boardPanel } from '$lib/services/boardPanel.svelte';
	import { narrow } from '$lib/services/narrow.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import { createLatch, SEEK_HOLD_MS, SEEK_TOLERANCE_MS, VOLUME_HOLD_MS } from '$lib/remote/latch';

	let controller = $state<RemoteController | null>(null);

	/**
	 * РЕЖИМ АДМІНІСТРАТОРА — другий контролер поруч, а не прапорець.
	 *
	 * `null` означає «звичайний пульт»: списком керує бібліотека, і міняти в ній
	 * нічого не можна. Щойно пароль підійшов, поруч оживає редактор — із власною
	 * підпискою на повні налаштування й власним каналом команд.
	 */
	let editor = $state<RemoteEditor | null>(null);
	let adminOpen = $state(false);
	/** Для якого треку відкрите вікно налаштувань. */
	let openFor = $state<string | null>(null);
	/** Прибирання підписки редактора — окремо від підписок пульта. */
	let stopEditor: (() => void) | null = null;

	/**
	 * Підняти редактор за відомою адресою каналу.
	 *
	 * Адреса могла прийти двома шляхами: щойно введеним паролем або сеансом
	 * вкладки, що пережив перезавантаження. Різниці тут немає — обидва рази це
	 * та сама адреса, і саме її існування в базі й було перевіркою пароля.
	 */
	async function openEditor(adminKey: string): Promise<void> {
		stopEditor?.();
		const instance = new RemoteEditor(adminKey);
		editor = instance;
		stopEditor = await instance.start();
	}

	/** Перевірити пароль і зайти. `false` — не підійшов. */
	async function enterAdmin(password: string): Promise<boolean> {
		const board = boardSession.current;
		if (!board) return false;

		const adminKey = await deriveAdminKey(board.key, password);
		// Питає БАЗА: канал або є за цією адресою, або його немає.
		if (!(await channelExists(adminKey))) return false;

		boardSession.open({ ...board, adminKey });
		await openEditor(adminKey);
		adminOpen = false;
		// На телефоні вхід відкривають з-під шестірні, а працює він зі списком
		// треків — тобто рівно з тим, що аркуш і затуляє.
		boardPanel.close();
		return true;
	}

	/** Вийти з режиму. Пароль при цьому нікуди не дівається — його просто забули. */
	function leaveAdmin(): void {
		stopEditor?.();
		stopEditor = null;
		editor = null;
		openFor = null;
		const board = boardSession.current;
		if (board) boardSession.open({ ...board, adminKey: undefined });
	}
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

		// Режим, у якому були до перезавантаження вкладки, піднімається сам.
		if (board.adminKey) void openEditor(board.adminKey);

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
			stopEditor?.();
			instance.stop();
		};
	});

	/*
	 * ДВІ ЗАСУВКИ — і без них повзунки стрибали туди-сюди після кожного руху.
	 *
	 * Захисту «не чіпати, поки палець на повзунку» замало: він знімається на
	 * відпусканні, тобто ДО того, як команда дійде до приймача й той оголосить
	 * новий стан. У цю щілину прилітає старе значення. Пояснення й межі часу —
	 * у `latch.ts`, там же на це тести.
	 */
	const volumeLatch = createLatch<number>((mine, incoming) => mine === incoming, VOLUME_HOLD_MS);
	const seekLatch = createLatch<number>(
		(mine, incoming) => Math.abs(mine - incoming) <= SEEK_TOLERANCE_MS,
		SEEK_HOLD_MS
	);

	/** Позиція, яку показувати: своя після перемотки, інакше з приймача. */
	let shownPosition = $state(0);

	$effect(() => {
		const fromPlayer = controller?.state?.volume;
		if (fromPlayer === undefined || draggingVolume) return;
		volume = volumeLatch.show(Math.round(fromPlayer * 100), Date.now());
	});

	$effect(() => {
		const live = controller?.positionMs ?? 0;
		if (seeking) return;
		shownPosition = seekLatch.show(live, Date.now());
	});

	/** Наказати нову позицію: засувка тримає її до підтвердження приймачем. */
	function commitSeek(value: number) {
		seeking = false;
		seekValue = value;
		shownPosition = value;
		seekLatch.set(value, Date.now());
		void controller?.seek(value);
	}

	/**
	 * Чи розгорнуте керування на телефоні. `null` — «як само вийде».
	 *
	 * Те саме правило, що й у приймача: доки трек не обрано, від смуги
	 * перемотки й чотирьох кнопок користі нема, а висоту вони забирають у
	 * списку. Гучність лишається завжди — її крутять і в тиші.
	 */
	let deckOpen = $state<boolean | null>(null);

	/**
	 * ЩО ПОКАЗУЄ СПИСОК.
	 *
	 * Звичайний пульт бере бібліотеку — там лише дозволене до показу. У режимі
	 * адміністратора джерело інше: повний перелік із каналу, включно з
	 * прихованими треками, бо повертати сховане теж треба звідкись.
	 */
	const rows = $derived(editor ? editor.entries : (controller?.tracks ?? []));

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
			<!-- Роль окремим рядком, а не замість назви — як і в плеєра. -->
			<div class="head__who">
				<h1 class="head__role" data-testid="board-role-title">{t('remote.title')}</h1>
				{#if controller.info?.name}
					<p class="head__title">{controller.info.name}</p>
				{/if}
				<p class="muted mono">{board.id}</p>
			</div>
			<div class="head__side">
				<p class="link" class:link--on={controller.playerOnline} data-testid="link-state">
					<span class="link__dot" aria-hidden="true"></span>
					{controller.playerOnline ? t('remote.online') : t('remote.offline')}
				</p>

				<!--
					ВХІД стоїть у шапці дошки, а не серед кнопок керування: це не дія
					над звуком, а зміна того, що взагалі можна робити з цією дошкою.
					ВИХІД — у смузі режиму, поруч із написом «Режим адміністратора»:
					там його й шукають, і там він видимий на телефоні завжди, тоді як
					шапка на вузькому екрані живе за шестірнею.
				-->
				{#if !editor}
					<button
						class="btn btn--sm"
						type="button"
						onclick={() => (adminOpen = true)}
						data-testid="admin-open"
					>
						<IconSettings size={18} aria-hidden="true" />
						{t('admin.title')}
					</button>
				{/if}
			</div>
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

				<!--
					`presenceKnown` — щоб не лякати завчасно. Доки перший знімок
					присутності не приїхав, «офлайн» означає лише «ще не знаємо».
				-->
				{#if controller.presenceKnown && !controller.playerOnline}
					<p class="note note--warn card" data-testid="offline-hint">
						<IconWarning size={18} aria-hidden="true" />
						<span>{t('remote.offlineHint')}</span>
					</p>
				{:else if controller.state !== null && !armed}
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
									{clock(seeking ? seekValue : shownPosition)}
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
									aria-label={t('remote.seek')}
									min="0"
									max={Math.max(1000, controller.durationMs)}
									step="250"
									disabled={!controller.state?.trackId || controller.durationMs === 0}
									value={seeking ? seekValue : shownPosition}
									data-testid="remote-seek"
									onpointerdown={(event) => {
										seeking = true;
										seekValue = Number(event.currentTarget.value);
									}}
									oninput={(event) => (seekValue = Number(event.currentTarget.value))}
									onpointerup={(event) => commitSeek(Number(event.currentTarget.value))}
									onpointercancel={() => (seeking = false)}
									onkeydown={() => (seeking = true)}
									onkeyup={(event) => commitSeek(Number(event.currentTarget.value))}
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
								onpointerup={() => {
									draggingVolume = false;
									// Засувка ставиться саме тут, а не в `oninput`: доки палець
									// тягне, показується своє й так, а підтверджувати треба
									// останнє значення, а не кожне проміжне.
									volumeLatch.set(volume, Date.now());
								}}
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
					{#if editor}
						<!--
							У режимі адміністратора список інший — і це не косметика.
							
							Звичайний пульт бачить бібліотеку: лише те, що дозволено
							показувати, і без жодних налаштувань. Адміністратор бачить усе,
							що є в папці, включно з прихованим, — інакше повернути сховане
							було б нікуди.
						-->
						<div class="adminbar" data-testid="admin-bar">
							<div class="adminbar__text">
								<strong>{t('admin.mode')}</strong>
								<span class="muted">{t('admin.modeHint')}</span>
							</div>
							<div class="adminbar__acts">
								<button
									class="btn btn--sm"
									type="button"
									onclick={() => void editor?.rescan()}
									data-testid="admin-rescan"
								>
									<IconRefresh size={18} aria-hidden="true" />
									{t('admin.rescan')}
								</button>
								<button
									class="btn btn--sm"
									type="button"
									onclick={leaveAdmin}
									data-testid="admin-leave"
								>
									{t('admin.leave')}
								</button>
							</div>
						</div>

						{#if editor.trouble}
							<p class="error" role="alert" data-testid="admin-trouble">
								{t(editor.trouble as TranslationKey)}
							</p>
						{/if}

						{#if !editor.known}
							<p class="muted">{t('admin.waiting')}</p>
						{:else if rows.length === 0}
							<!--
								Про папку кажемо лише тоді, коли треків немає, — тобто коли
								питання «а де їх узяти» справді виникло. Постійний рядок над
								списком був би відповіддю на незадане питання, і на телефоні
								з'їдав би рядок у того, що справді потрібне.
							-->
							<p class="muted">{t('admin.noFolder')}</p>
						{/if}
					{/if}

					{#if !controller.libraryKnown && !editor}
						<!-- Ще не знаємо. Тиха фраза замість висновку, якого нема з чого зробити. -->
						<p class="muted">{t('remote.connecting')}</p>
					{:else if rows.length === 0}
						<!--
							Це не помилка й не збій, а очікування: людина з пультом нічого
							вдіяти не може, доки за компʼютером не оберуть папку. Тому текст
							посеред порожнього місця й другим рядком каже, чого саме чекати.
						-->
						<p class="empty" data-testid="empty-library">
							<span>{t('remote.emptyLibrary')}</span>
							<span class="muted">{t('remote.emptyLibraryWait')}</span>
						</p>
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
									rows.length
								)}
							</span>
						</div>

						<ul class="tracks">
							{#each rows as track, index (track.id)}
								{@const hex = colorOf(track.color)}
								{@const folder = folderOf(track.path)}
								<!--
									Межа між підпапками — та сама, що й на плеєрі: два екрани
									однієї дошки не мусять по-різному показувати той самий список.
									Підпис зникає на телефоні, лінія лишається.
								-->
								{#if index === 0 ? folder !== '' : folder !== folderOf(rows[index - 1].path)}
									<li class="tracks__folder" data-testid="folder-mark-{track.id}">
										<span class="tracks__folder-name">{folder || t('player.rootFolder')}</span>
									</li>
								{/if}
								{@const key = (editor ?? controller).keyLabels[track.id]}
								{@const current = controller.state?.trackId === track.id}
								{@const sounding = current && playing}
								<!--
									Трек, схований від пульта, звідси не запускається — його немає
									в бібліотеці, і команда «грати» на нього не дійшла б. Тому
									кнопка вимкнена, а не мовчки безсила.
								-->
								{@const shy = 'visibility' in track && track.visibility !== 'all'}
								<li class="row">
									<button
										class="tracks__btn"
										class:tracks__btn--tinted={hex !== null}
										class:tracks__btn--playing={controller.state?.trackId === track.id}
										style={hex ? `--track-color: ${hex}` : undefined}
										type="button"
										disabled={controller.sending || shy}
										onclick={(event) => {
											releaseAfterTap(event);
											void (current
												? controller?.send(sounding ? 'pause' : 'resume')
												: controller?.send('play', track.id));
										}}
										data-testid="play-{track.id}"
									>
										<!--
											На телефоні клавіш немає: клавіатури там нема, а місце потрібне назві.
										
											Значок каже, що станеться від натискання: у того, що звучить, — пауза.
											Доти скрізь стояв трикутник «грати», і рядок обіцяв запустити те, що
											вже грає.
										-->
										<span class="tracks__mark">
											{#if sounding}
												<!--
													Смужки, а не значок паузи: значок каже, ЩО СТАНЕТЬСЯ від
													натискання, а тут потрібне інше — щоб було видно з
													відстані, що саме цей трек зараз звучить.
												-->
												<Equalizer size={18} />
											{:else if key && !narrow.matches}
												<kbd class="tracks__key" aria-label={t('hotkeys.slot', { key })}>
													{key}
												</kbd>
											{:else}
												<IconPlay size={18} aria-hidden="true" />
											{/if}
										</span>
										{#if track.icon}
											<!--
												Значок стоїть ОКРЕМО від назви й на всю її висоту: на
												телефоні назва займає два рядки, і символ, вклеєний у
												текст, з'їдав би місце в першому з них.
											-->
											<span class="tracks__icon" aria-hidden="true">{track.icon}</span>
										{/if}

										<span class="tracks__title">
											{#if narrow.matches}
												{#each titleLines(track.title) as line (line)}
													<span class="tracks__line">{line}</span>
												{/each}
											{:else}
												{track.title}
											{/if}
										</span>

										{#if settings.showTrigger && 'auto' in track && track.auto}
											<!--
												Блискавка відповідає на «чому воно заграло саме́». Доти її
												бачив лише той, хто стоїть за комп'ютером, — а питання це
												виникає саме в того, хто з телефоном у залі.
											-->
											<span
												class="tracks__zap"
												title={t('track.trigger')}
												aria-label={t('track.trigger')}
												data-testid="trigger-mark-{track.id}"
											>
												<IconZap size={14} aria-hidden="true" />
											</span>
										{/if}
									</button>

									{#if editor}
										<div class="row__tools">
											<button
												class="tool"
												type="button"
												title={t('player.moveUp')}
												aria-label={t('player.moveUp')}
												onclick={() => editor?.move(track.id, -1)}
												data-testid="admin-up-{track.id}"
											>
												<IconUp size={18} aria-hidden="true" />
											</button>
											<button
												class="tool"
												type="button"
												title={t('player.moveDown')}
												aria-label={t('player.moveDown')}
												onclick={() => editor?.move(track.id, 1)}
												data-testid="admin-down-{track.id}"
											>
												<IconDown size={18} aria-hidden="true" />
											</button>
											<button
												class="tool"
												type="button"
												title={t('track.open')}
												aria-label={t('track.open')}
												onclick={() => (openFor = track.id)}
												data-testid="admin-settings-{track.id}"
											>
												<IconSliders size={18} aria-hidden="true" />
											</button>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>

		{#if adminOpen}
			<AdminDialog onenter={enterAdmin} onclose={() => (adminOpen = false)} />
		{/if}

		{#if openFor && editor}
			{@const chosen = editor.entries.find((entry) => entry.id === openFor)}
			{#if chosen}
				<!--
					ТЕ САМЕ ВІКНО, ЩО Й НА ПЛЕЄРІ, і в цьому вся суть третьої ролі:
					адміністратор має бачити не «спрощену версію налаштувань», а рівно
					те, що бачить людина за комп'ютером. Різне вікно розійшлося б із
					плеєровим на першому ж новому полі.
				-->
				<TrackDialog track={chosen} controller={editor} onclose={() => (openFor = null)} />
			{/if}
		{/if}
	{:else}
		<p class="muted">{t('common.loading')}</p>
	{/if}
</div>

<style>
	/* Шапка дошки: стан зв'язку й вхід в адміністратори стоять стовпчиком. */
	.head__side {
		display: flex;
		flex-direction: column;
		align-items: end;
		gap: var(--gap-xs);
	}

	/*
	 * Смуга режиму — помітна, але не тривожна. Це не помилка й не попередження:
	 * це відповідь на питання «чому в мене тут зʼявилися стрілки й шестірні».
	 */
	.adminbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
		padding: var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
	}

	.adminbar__text {
		display: flex;
		flex-direction: column;
	}

	.adminbar__acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	/*
	 * МЕЖА МІЖ ПІДПАПКАМИ — те саме, що на плеєрі: підпис на широкому екрані,
	 * сама лінія на телефоні.
	 */
	.tracks__folder {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		margin-block: var(--gap-xs) 2px;
		color: var(--text-muted);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.tracks__folder::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	@media (max-width: 899px) {
		.tracks__folder {
			margin-block: var(--gap-sm);
		}

		.tracks__folder-name {
			display: none;
		}

		/*
	 * ВЕРХНІЙ РОЗДІЛЮВАЧ НЕ РОЗДІЛЯЄ НІЧОГО.
	 *
	 * На телефоні від позначки папки лишається сама лінія, а лінія над першим
	 * треком стоїть там, де список і так починається: вона не каже нічого, лише
	 * забирає рядок і читається як обірваний край.
	 */
		.tracks__folder:first-child {
			display: none;
		}
	}

	/* Очікування — посеред порожнього місця, а не притиснуте до лівого краю. */
	.empty {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		padding-block: var(--gap-lg);
		text-align: center;
	}

	/* Рядок треку в режимі адміністратора: кнопка на всю ширину плюс інструменти. */
	.row {
		display: flex;
		align-items: stretch;
		gap: var(--gap-xs);
	}

	.row .tracks__btn {
		flex: 1;
		min-width: 0;
	}

	.row__tools {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.tool {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--tap);
		min-height: var(--tap);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
	}

	@media (hover: hover) {
		.tool:hover {
			border-color: var(--border);
			color: var(--text-primary);
		}
	}

	.tool:focus-visible {
		border-color: var(--border);
		color: var(--text-primary);
	}

	.tool:active {
		box-shadow: inset 0 0 0 999px var(--press-veil);
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
		/*
		 * НАЗВА БЕЗ ЖОДНОГО ПРОБІЛУ ТЕЖ ПЕРЕНОСИТЬСЯ.
		 *
		 * Типове перенесення шукає пробіли й дефіси, а імена файлів їх часто не
		 * мають: `Ave_Maria_Schubert_final_MASTER.mp3` — це одне «слово», і воно
		 * виїжджало за край картки, тягнучи за собою горизонтальну прокрутку
		 * всієї сторінки.
		 *
		 * `anywhere`, а не `break-word`: обидва ріжуть слово, але лише `anywhere`
		 * враховується при обчисленні мінімальної ширини — тобто саме він не дає
		 * картці роздутися під незламне слово ще до перенесення.
		 */
		overflow-wrap: anywhere;
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
		/*
		 * Півтори висоти дотику, а не дві. Дві заводилися під три рядки тексту,
		 * а там їх щонайбільше два — тобто чверть висоти списку йшла в порожнечу,
		 * і на екран уміщалося на трек менше.
		 */
		.tracks__btn {
			min-height: calc(var(--tap) * 1.5);
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

		/*
		 * Назва без поділу «виконавець — пісня» бере ДВА рядки, а не один.
		 *
		 * Доти вона обрізалася на середині першого ж речення: «Увага,
		 * невідкладно пройдіть д…» — і всі оголошення, що починаються однаково,
		 * ставали на телефоні нерозрізненними. Два рядки покривають майже все, а
		 * те, що не влізло й у них, обрізається так само трикрапкою.
		 *
		 * `:only-child` — бо коли рядків уже два (`titleLines` поділив), кожен
		 * мусить лишитися одним: інакше «виконавець» забирав би обидва рядки.
		 */
		.tracks__line:only-child {
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			white-space: normal;
		}
	}

	/*
	 * НАВЕДЕННЯ — ЛИШЕ ТАМ, ДЕ Є ЧИМ НАВОДИТИ.
	 *
	 * Android лишає `:hover` на елементі ПІСЛЯ дотику — доки не торкнешся чогось
	 * іншого. Тобто рамка навколо треку стояла й тоді, коли він уже відзвучав, і
	 * читалася як «оцей зараз обраний». Фокус тут ні до чого: його ми знімаємо
	 * окремо, а це залишок наведення, якого на пальці не буває.
	 */
	@media (hover: hover) {
		.tracks__btn:hover:not(:disabled) {
			border-color: var(--accent);
		}
	}

	.tracks__btn:focus-visible {
		border-color: var(--accent);
	}

	/*
	 * Головне натискання пульта мусить бути відчутним саме на пальці, а `:hover`
	 * там не спрацьовує. Доти замість відгуку був сірий прямокутник від Android,
	 * який ми прибрали в `base.css`, — це його заміна, і вона знає наш радіус.
	 */
	.tracks__btn:active:not(:disabled) {
		box-shadow: inset 0 0 0 999px var(--press-veil);
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

	/*
	 * Значок — на всю висоту рядка, а не в потоці тексту. Саме тому він і став
	 * окремим полем: усередині назви його не можна ні вирівняти, ні збільшити.
	 */
	.tracks__icon {
		display: grid;
		flex: none;
		place-items: center;
		align-self: stretch;
		min-width: 1.75rem;
		font-size: 1.25rem;
		line-height: 1;
	}

	/* Позначка «запускається за API» — тиха, як і на плеєрі. */
	.tracks__zap {
		display: grid;
		flex: none;
		place-items: center;
		color: var(--text-secondary);
	}
</style>
