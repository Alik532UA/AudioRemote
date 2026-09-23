<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IconBoard, IconGrid, IconPhone, IconTrash } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { forgetBoard, kindOf, listBoards, type SavedBoard } from '$lib/board/myBoards';
	import { boardSession, toActive } from '$lib/board/session.svelte';
	import { sweepOwnExpiredBoards } from '$lib/board/sweepBoards';
	import { settings } from '$lib/settings/settings.svelte';
	import { startNotice, type StartNotice } from '$lib/settings/startPage.svelte';
	import { IconWarning } from '$lib/config/icons';

	let saved = $state<SavedBoard[]>([]);
	/**
	 * Чому меню замість обіцяної сторінки.
	 *
	 * Читається ОДИН раз: мовчазне меню людина читає як «налаштування не
	 * зберігається», а те саме пояснення на кожному наступному заході — як
	 * поламану сторінку.
	 */
	let notice = $state<StartNotice | null>(null);
	/** Ключ дошки, яку не вдалося знести. Порожньо — помилки немає. */
	let deleteError = $state<string | null>(null);

	onMount(() => {
		settings.load();
		saved = listBoards();
		notice = startNotice.take();

		/*
		 * ПРИБИРАННЯ СВОЇХ ПРОСТРОЧЕНИХ ДОШОК — у фоні й мовчки.
		 *
		 * Без `await`: список мусить з'явитися одразу, а прибирання ходить у
		 * мережу по одному запиту на дошку. Людина відкрила меню, щоб вибрати
		 * дошку, а не щоб чекати на прибиральника.
		 *
		 * Перемальовуємо список лише якщо щось справді знеслося: зайвий
		 * `listBoards()` під час вибору смикав би розмітку без причини.
		 */
		void sweepOwnExpiredBoards().then((result) => {
			if (result.removed > 0) saved = listBoards();
		});
	});

	/**
	 * ЕКРАН ДОШКИ — це пара (вид, роль), а не одна роль.
	 *
	 * Роль каже, хто з двох; вид каже, чим вони обмінюються. Чотири екрани —
	 * чотири різні речі, і жоден із них не вміє показати чужі дані: табло на
	 * сторінці плеєра було б порожнім списком треків, яких немає.
	 */
	const screenOf = (board: SavedBoard) => {
		const host = board.role === 'player';
		if (kindOf(board) === 'info') return host ? '/info' : '/info-remote';
		return host ? '/player' : '/remote';
	};

	/** Як зветься ця роль у цьому виді дошки. Див. докблок до `BoardKind`. */
	const roleName = (board: SavedBoard) => {
		const host = board.role === 'player';
		if (kindOf(board) === 'info') return host ? t('info.boardTitle') : t('info.remoteTitle');
		return host ? t('player.title') : t('remote.title');
	};

	function reopen(board: SavedBoard) {
		boardSession.open(toActive(board));
		goto(resolve(screenOf(board)));
	}

	/**
	 * ДВІ РІЗНІ ДІЇ ЗА ОДНІЄЮ КНОПКОЮ, і різниця тут не в тоні.
	 *
	 * «Прибрати зі списку» прибирає лише місцевий запис. Доти це була ЄДИНА
	 * дія, і назва кнопки чесно про це казала — а наслідок був такий, що жодна
	 * створена дошка не видалялася з бази НІКОЛИ. Прибрати її було нічим:
	 * `boards` не перелічується за побудовою (саме на цьому тримається
	 * пароль), тож покинуту дошку не знайде ні людина в консолі, ні скрипт.
	 * Адресу знає лише той, хто зберіг пароль, — і лише доки зберіг.
	 *
	 * Тому для СВОЇХ дощок кнопка тепер зносить дошку з бази. «Своя» — це та,
	 * для якої збережений пароль, тобто створена в цьому браузері; правило
	 * бази перевіряє те саме через `ownerUid`, і чужу дошку воно не віддасть.
	 *
	 * Для підключених (пульт) дія лишилася колишньою: там немає ні пароля, ні
	 * права, та й видаляти чужу дошку пульт не мусить.
	 */
	const isMine = (board: SavedBoard) => Boolean(board.password);

	async function remove(board: SavedBoard) {
		if (!isMine(board)) {
			forgetBoard(board.key);
			saved = listBoards();
			return;
		}

		if (!confirm(t('entry.deleteConfirm', { name: board.name || board.id }))) return;

		try {
			/*
			 * Спершу адмінський канал, потім дошка. Порядок важить: канал
			 * живе в окремій гілці й із видаленням дошки НЕ зникає, а знайти
			 * його потім буде нічим — адміністраторський пароль лежав у тому
			 * самому місцевому записі, який ми зараз зітремо.
			 */
			if (board.adminPassword) {
				const { deriveAdminKey } = await import('$lib/board/boardPath');
				const { closeChannel } = await import('$lib/net/admin');
				// Саме `key`, а не `id`: канал виведений з АДРЕСИ дошки.
				await closeChannel(await deriveAdminKey(board.key, board.adminPassword));
			}

			const { deleteBoard } = await import('$lib/net/board');
			await deleteBoard(board.key);
		} catch {
			/*
			 * Відмова НЕ мовчазна. Мовчазна читалася б як «видалив», а дошка
			 * лишалася б жити — причому знайти її після зникнення місцевого
			 * запису було б уже нічим.
			 */
			deleteError = board.key;
			return;
		}

		deleteError = null;
		forgetBoard(board.key);
		saved = listBoards();
	}
</script>

<div class="stack">
	<!--
		Заголовок сторінки, а не підпис. Він переїхав сюди з шапки й виріс: на
		цьому екрані він єдиний текст, який людина читає перед вибором, і
		зменшувати його нема заради чого.
	-->
	{#if notice}
		<p class="note note--warn card" role="status" data-testid="start-notice">
			<IconWarning size={18} aria-hidden="true" />
			<span>{t(`start.${notice}`)}</span>
		</p>
	{/if}

	{#if saved.length > 0}
		<section data-testid="my-boards">
			<h2 class="menu__title">{t('entry.mine')}</h2>
			<ul class="mine">
				{#each saved as board (board.key)}
					<li class="mine__row">
						<!--
							ІДЕНТИФІКАТОР ПИШЕТЬСЯ ОДИН РАЗ.
							
							Доти рядок мав і назву, і ідентифікатор окремо — а назви в дошки
							зазвичай немає, і тоді замість неї підставлявся той самий
							ідентифікатор. Виходило «YWYQW YWYQW Плеєр»: два однакові слова
							поспіль, у яких читач шукає різницю, якої немає.
						-->
						<button class="mine__open" type="button" onclick={() => reopen(board)}>
							<!--
								РОЛЬ ПЕРША, і це відповідає на питання, з яким сюди й
								приходять: «а це та дошка, де я граю, чи та, де я керую».
								Ідентифікатор без цього читається однаково в обох випадках.
							-->
							<span class="mine__role" class:mine__role--player={board.role === 'player'}>
								{roleName(board)}
							</span>
							{#if board.name}
								<span class="mine__name">{board.name}</span>
								<span class="mine__id mono">{board.id}</span>
							{:else}
								<span class="mine__name mono">{board.id}</span>
							{/if}
						</button>
						<button
							class="mine__forget"
							type="button"
							title={isMine(board) ? t('entry.delete') : t('entry.forget')}
							aria-label={isMine(board) ? t('entry.delete') : t('entry.forget')}
							onclick={() => remove(board)}
						>
							<IconTrash size={18} aria-hidden="true" />
						</button>
					</li>
					{#if deleteError === board.key}
						<li class="note note--warn" role="alert" data-testid="board-delete-error">
							<IconWarning size={18} aria-hidden="true" />
							<span>{t('entry.deleteFailed')}</span>
						</li>
					{/if}
				{/each}
			</ul>
		</section>

		<hr class="divider" />
	{/if}

	<section>
		<h1 class="menu__title">{t('entry.lead')}</h1>

		<!--
			ДВІ КНОПКИ, І БІЛЬШЕ НІЧОГО НА ПЕРШОМУ ЕКРАНІ.

			Людина, яка вперше відкрила застосунок, стоїть перед одним питанням: вона
			біля комп'ютера, що гратиме, чи біля пристрою, з якого керуватимуть. Усе
			інше — назва дошки, пароль, тека — має сенс лише після відповіді на це,
			і на першому екрані воно тільки заважає.
		-->
		<div class="choice">
			<a class="choice__card" href={resolve('/create')} data-testid="go-create">
				<IconBoard size={40} aria-hidden="true" />
				<span class="choice__title">{t('entry.create')}</span>
				<span class="choice__hint">{t('entry.createHint')}</span>
			</a>

			<a class="choice__card" href={resolve('/connect')} data-testid="go-connect">
				<IconPhone size={40} aria-hidden="true" />
				<span class="choice__title">{t('entry.connect')}</span>
				<span class="choice__hint">{t('entry.connectHint')}</span>
			</a>
		</div>
	</section>

	<!--
		ДРУГИЙ ВИД ДОШКИ — ЗА ПЕРЕМИКАЧЕМ У НАЛАШТУВАННЯХ.

		Ховається саме ВХІД, а не сторінки: маршрути існують завжди, і відкрити їх
		адресою можна й без галочки. Прапорець складання зробив би інше — дошку,
		якої в бойовій збірці немає взагалі, тобто перевіряти її довелося б лише
		вдома, а показати колезі не вийшло б ніяк.

		Розділ стоїть НИЖЧЕ двох кнопок і має власний заголовок. Четверта картка
		в тому ж ряду читалася б як четвертий спосіб зробити те саме, а це інша
		дошка: у неї немає ні звуку, ні папки, і підключаються до неї окремо.
	-->
	{#if settings.showInfoBoards}
		<hr class="divider" />

		<section data-testid="info-section">
			<h2 class="menu__title">{t('info.lead')}</h2>

			<div class="choice">
				<a
					class="choice__card"
					href="{resolve('/create')}?kind=info"
					data-testid="info-create-link"
				>
					<IconGrid size={40} aria-hidden="true" />
					<span class="choice__title">{t('info.create')}</span>
					<span class="choice__hint">{t('info.createHint')}</span>
				</a>

				<a
					class="choice__card"
					href="{resolve('/connect')}?kind=info"
					data-testid="info-connect-link"
				>
					<IconPhone size={40} aria-hidden="true" />
					<span class="choice__title">{t('info.connect')}</span>
					<span class="choice__hint">{t('info.connectHint')}</span>
				</a>
			</div>
		</section>
	{/if}
</div>

<style>
	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		font-size: 0.9rem;
	}

	.note--warn {
		border-color: var(--warn);
		color: var(--warn);
	}

	.menu__title {
		margin-block: 0 var(--gap);
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.2;
		text-align: center;
		text-wrap: balance;
	}

	.divider {
		margin: var(--gap-sm) 0;
		border: 0;
		border-top: 1px solid var(--border);
	}

	.choice {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
		gap: var(--gap);
	}

	.choice__card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--gap-sm);
		min-height: 180px;
		padding: var(--gap-lg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		box-shadow: 0 1px 2px var(--shadow-weak);
		color: inherit;
		text-align: center;
		text-decoration: none;
		transition:
			border-color 120ms ease,
			transform 120ms ease;
	}

	.choice__card:hover,
	.choice__card:focus-visible {
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.choice__card {
			transition: none;
		}
		.choice__card:hover,
		.choice__card:focus-visible {
			transform: none;
		}
	}

	.choice__title {
		font-size: 1.15rem;
		font-weight: 600;
	}

	.choice__hint {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.mine {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.mine__row {
		display: flex;
		gap: var(--gap-xs);
	}

	.mine__open {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		cursor: pointer;
		text-align: start;
	}

	.mine__open:hover,
	.mine__open:focus-visible {
		border-color: var(--accent);
	}

	.mine__name {
		font-weight: 600;
	}

	/* Ідентифікатор поруч із назвою — тихіший: назву шукають очима першою. */
	.mine__id {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	/*
	 * Роль — значком праворуч, а не третім словом у рядку.
	 *
	 * Словом вона читалася як частина назви дошки («Плеєр» після
	 * ідентифікатора виглядало як її ім'я). Значок відокремлює «що це за
	 * запис» від «як ця дошка зветься», і робить це без жодного додаткового
	 * слова.
	 */
	.mine__role {
		flex: none;
		width: 4.5rem;
		padding: 4px var(--gap-sm);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 600;
		text-align: center;
		white-space: nowrap;
	}

	/* Плеєр і пульт — різні ролі, і на око вони теж різні. */
	.mine__role--player {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.mine__forget {
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

	.mine__forget:hover,
	.mine__forget:focus-visible {
		border-color: var(--danger);
		color: var(--danger);
	}
</style>
