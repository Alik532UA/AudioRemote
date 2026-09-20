<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconDown,
		IconFolder,
		IconMute,
		IconNext,
		IconPause,
		IconEyeOff,
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
	import { plural, t, type TranslationKey } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { rememberBoard } from '$lib/board/myBoards';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';
	import { colorOf } from '$lib/config/trackColors';
	import { folderOf, titleLines } from '$lib/audio/source';
	import TrackDialog from '$lib/components/player/TrackDialog.svelte';
	import HiddenDialog from '$lib/components/player/HiddenDialog.svelte';
	import LeaveDialog from '$lib/components/player/LeaveDialog.svelte';
	import RemoteDialog from '$lib/components/player/RemoteDialog.svelte';
	import ArmDialog from '$lib/components/player/ArmDialog.svelte';
	import Equalizer from '$lib/components/ui/Equalizer.svelte';
	import { releaseAfterTap } from '$lib/services/focus';
	import HotkeyTips from '$lib/components/ui/HotkeyTips.svelte';
	import { boardPanel } from '$lib/services/boardPanel.svelte';
	import { narrow } from '$lib/services/narrow.svelte';
	import { settings } from '$lib/settings/settings.svelte';
	import { runningInTauri } from '$lib/audio/tauriSource';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);
	/** Для якого треку відкрите вікно налаштувань. `null` — для жодного. */
	let openFor = $state<string | null>(null);
	let hiddenOpen = $state(false);

	/**
	 * ВИХІД ЗІ СТОРІНКИ КОШТУЄ ТЕКИ — але лише в браузері.
	 *
	 * Дозвіл на папку живе рівно доти, доки живе ця сторінка: пішли — і
	 * повернення означає «оберіть папку заново», хоч людина нічого не міняла.
	 * У застосунку на комп'ютері шлях пам'ятається, тож попереджати нема про що.
	 *
	 * Перехід скасовується й повторюється після відповіді: `beforeNavigate` не
	 * вміє чекати на людину, а питати її треба саме тут — після виходу
	 * пояснення вже нічого не змінює.
	 */
	let leaveTo = $state<string | null>(null);
	let leaveConfirmed = false;

	/**
	 * Повторити перехід, який щойно скасували.
	 *
	 * Адреса приходить від самого SvelteKit (`navigation.to.url`), тобто вже
	 * зібрана з базовим шляхом. Проганяти її крізь `resolve()` вдруге не можна:
	 * той чекає маршрут, а не готове посилання, і додав би базу ще раз.
	 */
	function leaveNow() {
		leaveConfirmed = true;
		const target = leaveTo;
		leaveTo = null;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (target) void goto(target);
	}

	beforeNavigate((navigation) => {
		if (leaveConfirmed || runningInTauri()) return;
		if (controller?.sourceStatus !== 'ready') return;
		// Закриття вкладки сюди не входить: своє вікно там показати неможливо, а
		// системне «ви впевнені?» на кожне закриття — це вже причіпка.
		if (!navigation.to) return;

		navigation.cancel();
		leaveTo = navigation.to.url.href;
	});
	/**
	 * Увімкнути або вимкнути адміністратора.
	 *
	 * Пароль зберігається ПОРУЧ ІЗ ДОШКОЮ, а не в сеансі вкладки: канал мусить
	 * підніматися сам на кожному відкритті плеєра, інакше дозвіл, даний раз,
	 * доводилося б давати щоранку. Сама дошка в сеансі теж оновлюється — інакше
	 * вікно показувало б старий пароль до перезавантаження.
	 */
	async function setAdmin(password: string | null): Promise<void> {
		const board = boardSession.current;
		if (!board || !controller) return;

		if (password === null) await controller.disableAdmin();
		else await controller.enableAdmin(password);

		const next = { ...board, adminPassword: password ?? undefined };
		boardSession.open(next);
		rememberBoard({
			key: next.key,
			id: next.id,
			name: next.name,
			role: next.role,
			password: next.password,
			adminPassword: next.adminPassword
		});
	}

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
									aria-label={t('player.seek')}
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
					<!--
						НАД УСІМ, а не в гілці «папку обрано»: до бази папка стосунку не
						має. Без бази сторінка виглядає бездоганно — SDK тримає запис у
						локальній черзі, помилок немає, — і мовчання тут відправляє
						людину шукати причину в телефоні.
					-->
					{#if controller.dbOffline}
						<p class="note note--warn" data-testid="db-offline">
							<IconWarning size={18} aria-hidden="true" />
							<span>{t('player.dbOffline')}</span>
						</p>
					{/if}

					<!--
						ВІДМОВА БАЗИ В ЗАПИСІ СПИСКУ — тут, а не в консолі.
						
						Доти вона зникала мовчки, і єдиним її слідом був напис на ЧУЖОМУ
						екрані: «на плеєрі ще не обрано папку». Причину тричі шукали в
						папці, хоч папка обрана й список на місці.
					-->
					{#if controller.libraryTrouble}
						<p class="note note--warn" role="alert" data-testid="library-denied">
							<IconWarning size={18} aria-hidden="true" />
							<span>{t(controller.libraryTrouble as TranslationKey)}</span>
						</p>
					{/if}

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
											·
											<!--
												Лічильник І Є входом. Трек, прихований від усіх, зникає
												зі списку повністю, тож іншого шляху повернути його не
												існує — а стан, з якого немає виходу, це не стан.
											-->
											<button
												class="folder__hidden"
												type="button"
												title={t('player.hiddenOpen')}
												onclick={() => (hiddenOpen = true)}
												data-testid="open-hidden"
											>
												{t('player.hiddenCount', { count: controller.hiddenCount })}
											</button>
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
					{#if controller.visible.length > 0}
						<ul class="tracks">
							{#each controller.visible as entry, index (entry.id)}
								{@const hex = colorOf(entry.color)}
								{@const folder = folderOf(entry.path)}
								<!--
									ПІДПАПКА ПОКАЗУЄТЬСЯ ЛИШЕ ТАМ, ДЕ ВОНА ЗМІНИЛАСЯ.
									
									Порядок треків — рішення людини, і перегруповувати список за
									папками не можна: вона розклала його так, як він має звучати.
									Тому папка не збирає треки докупи, а лише називає межу там, де
									список переходить з однієї в іншу. Якщо папок немає взагалі,
									немає й жодного зайвого рядка.
								-->
								{#if index === 0 ? folder !== '' : folder !== folderOf(controller.visible[index - 1].path)}
									<li class="tracks__folder" data-testid="folder-mark-{entry.id}">
										<span class="tracks__folder-name">{folder || t('player.rootFolder')}</span>
									</li>
								{/if}
								<li
									class="tracks__row"
									class:tracks__row--odd={index % 2 === 0}
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
										{#if engine.trackId === entry.id && engine.playing}
											<!--
												Поки трек звучить, на місці клавіші стоять смужки. Клавіша
												при цьому нікуди не дінеться: рядок і так під рукою, а
												питання «що зараз грає» з відстані важить більше за підказку
												про кнопку, яку вже натиснули.
											-->
											<span class="tracks__key tracks__key--live">
												<Equalizer size={16} />
											</span>
										{:else if !narrow.matches}
											<kbd class="tracks__key" data-testid="key-{entry.id}">
												{controller.keyLabels[entry.id] ?? '·'}
											</kbd>
										{/if}

										{#if entry.icon}
											<span class="tracks__icon" aria-hidden="true">{entry.icon}</span>
										{/if}

										<button
											class="tracks__title"
											type="button"
											title={t('player.playHere')}
											onclick={(event) => {
												releaseAfterTap(event);
												void controller?.toggleLocal(entry.id);
											}}
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

										{#if entry.visibility === 'player'}
											<!--
												Значок відповідає на «чому цього треку немає на телефоні».
												Без нього різниця між двома списками виглядала б як збій
												зв'язку, а не як рішення людини.
											-->
											<span
												class="tracks__zap"
												title={t('visibility.playerMark')}
												aria-label={t('visibility.playerMark')}
												data-testid="player-only-{entry.id}"
											>
												<IconEyeOff size={14} aria-hidden="true" />
											</span>
										{/if}

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
												disabled={index === controller.visible.length - 1}
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
		{#if leaveTo}
			<LeaveDialog onleave={leaveNow} onstay={() => (leaveTo = null)} />
		{/if}

		{#if hiddenOpen && controller}
			<HiddenDialog {controller} onclose={() => (hiddenOpen = false)} />
		{/if}

		<!--
			`armKnown` — щоб вікно не блимало. Доки браузер не відповів на
			беззвучну пробу, невідомо нічого, і показувати прохання ввімкнути те,
			що вже ввімкнено, не можна: у застосунку воно встигало з'явитися й
			зникнути за пів секунди.
		-->
		{#if engine.armKnown && !engine.armed && !armDismissed}
			<ArmDialog
				onarm={() => controller?.arm() ?? Promise.resolve(false)}
				ondismiss={() => (armDismissed = true)}
			/>
		{/if}

		{#if remoteOpen && board.password}
			<RemoteDialog
				id={board.id}
				password={board.password}
				boardKey={board.key}
				adminOn={controller.adminOn}
				admin={board.adminPassword}
				onadmin={setAdmin}
				onclose={() => (remoteOpen = false)}
			/>
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
		max-height: 60dvh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	/*
	 * НА ТЕЛЕФОНІ ПРОКРУЧУЄТЬСЯ СТОРІНКА, А НЕ СПИСОК УСЕРЕДИНІ СЕБЕ.
	 *
	 * `max-height: 60vh` має сенс на широкому екрані: там список стоїть колонкою
	 * поруч із керуванням, і без стелі він розтягнув би сторінку так, що
	 * керування поїхало б угору й зникло. На телефоні колонка одна — і та сама
	 * стеля робить із неї вікно у вікні: треки обриваються на власному краї
	 * списку, а не заїжджають під смугу застосунку. Саме той «край», об який
	 * вони впиралися, і читався як темна лінія.
	 *
	 * Заразом зникає друга смуга прокрутки й залипання пальця між нею та
	 * прокруткою сторінки.
	 */
	@media (max-width: 899px) {
		.tracks {
			max-height: none;
			overflow: visible;
		}
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
		/* Та сама висота, що й на пульті: один список — одна міра. */
		.tracks__main {
			min-height: calc(var(--tap) * 1.5);
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
	 * Колір ніколи не стає тлом ПІД ТЕКСТОМ: він смуга збоку плюс підкладка на
	 * 12%. Інакше довелося б добирати пару «текст на кольорі» для кожної з
	 * десяти заготовок і для обох тем.
	 */
	.tracks__main--tinted {
		border-inline-start-color: var(--track-color);
		background: color-mix(in oklab, var(--track-color) 12%, transparent);
	}

	/*
	 * Смугастість рахується ЗА НОМЕРОМ ТРЕКУ, а не за позицією в розмітці.
	 *
	 * `:nth-child(odd)` збивався б від рядків-роздільників між підпапками: вони
	 * теж діти списку, і після кожного смуги мінялися б місцями — тобто виглядало
	 * б це як випадковий візерунок, а не як чергування.
	 */
	.tracks__row--odd .tracks__main:not(.tracks__main--tinted) {
		background: var(--bg-sunken);
	}

	/*
	 * МЕЖА МІЖ ПІДПАПКАМИ.
	 *
	 * На широкому екрані вона підписана назвою папки; на телефоні лишається сама
	 * лінія — там рядок коштує дорого, а межу видно й без слів.
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

	/* Лінія добирає решту ширини — і лишається єдиним, що є на телефоні. */
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

	/*
	 * Лічильник прихованих — кнопка, яка не виглядає кнопкою.
	 *
	 * Вона стоїть усередині рядка з назвою папки й кількістю треків, тобто
	 * серед тексту. Рамка й тло зробили б із неї дію, рівноцінну «перечитати» й
	 * «змінити папку», хоч це радше виноска: більшість дощок прихованих не має
	 * взагалі. Тому підкреслення — і повний вигляд кнопки на наведенні.
	 */
	.folder__hidden {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}

	.folder__hidden:hover,
	.folder__hidden:focus-visible {
		color: var(--text-primary);
		text-decoration-style: solid;
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

	/* Місце під смужки — те саме, що й під клавішу: рядок не мусить смикатися. */
	.tracks__key--live {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid transparent;
		background: none;
		color: var(--accent);
	}

	/*
	 * Наведення й фокус теж малюються на рядку — там, де тепер і стан. Наведення
	 * при цьому лише для пристроїв із вказівником: Android лишає `:hover` після
	 * дотику, і рядок світився б рамкою ще довго після того, як відзвучав.
	 */
	@media (hover: hover) {
		.tracks__main:has(.tracks__title:hover:not(:disabled)) {
			border-color: var(--accent);
		}
	}

	.tracks__main:has(.tracks__title:focus-visible) {
		border-color: var(--accent);
	}

	/*
	 * Натиск — теж на рядку. Підсвітку браузера прибрано в `base.css`, а на
	 * телефоні вона була тут єдиним відгуком: `:hover` пальцем не викликається.
	 *
	 * Рамку тут НЕ чіпаємо: у кольорового треку вона несе смугу його кольору, і
	 * спільне `border-color` гасило б її на час натиску.
	 */
	.tracks__main:has(.tracks__title:active:not(:disabled)) {
		box-shadow: inset 0 0 0 999px var(--press-veil);
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

	/*
	 * Значок — на всю висоту рядка, окремо від назви: на телефоні назва бере два
	 * рядки, і символ усередині тексту з'їдав би місце в першому з них.
	 */
	.tracks__icon {
		display: grid;
		flex: none;
		place-items: center;
		align-self: stretch;
		min-width: 1.75rem;
		font-size: 1.25rem;
		line-height: 1;
		/* Вище за накладку назви — інакше натискання по значку не запускало б трек. */
		position: relative;
		z-index: 1;
		pointer-events: none;
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
