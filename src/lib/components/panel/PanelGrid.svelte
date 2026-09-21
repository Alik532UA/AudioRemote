<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { DEFAULT_LEVEL, type Panel, type PanelCommandType } from '$lib/net/panelTypes';
	import { layoutPanel, type Placed } from '$lib/panel/layout';
	import { colorOf } from '$lib/config/trackColors';

	/**
	 * СІТКА 3×5 — ОДНА НА ОБИДВА ЕКРАНИ.
	 *
	 * Помічник тисне, звукорежисер дивиться на те саме. Дві розмітки на одну
	 * панель означали б, що людина в залі й людина за пультом обговорюють різні
	 * картинки — а вся вигадка саме в тому, щоб не обговорювати.
	 *
	 * ## Чому сітка фіксована й чому без прокрутки
	 *
	 * Бо тиснуть тут НАОСЛІП. У темному залі рука йде до місця, яке пам'ятає, а
	 * не до кнопки, яку спершу треба знайти очима. Перетікання ставило б ту
	 * саму кнопку то в другий, то в третій рядок — тобто знищувало б єдину
	 * властивість, заради якої це й будується. З тієї ж причини немає
	 * прокрутки: те, що з'їхало за край, для наосліп не існує.
	 *
	 * Ціна названа: підпис мусить бути коротким, і кнопок у комірці не більше
	 * чотирьох. Це записано в правилах бази числами, а не проханням.
	 *
	 * ## Порожні комірки МАЛЮЮТЬСЯ
	 *
	 * Інакше сітка з двома елементами читалася б як сітка 1×2, і місця на ній
	 * не було б видно взагалі — ні господареві, який складає, ні помічникові,
	 * який запам'ятовує розташування.
	 */
	/**
	 * ТИСНЕТЬСЯ ВСЕ Й ОБОМА — і прапорця «кому що можна» тут більше немає.
	 *
	 * Спершу господареві лишили самі лише повзунки й перемикачі: мовляв,
	 * «гучніше» — це прохання, а просити самого себе нема сенсу. На практиці це
	 * вийшло розумуванням за людину. Звукорежисер тисне ту саму кнопку не щоб
	 * попросити себе, а щоб ПОЗНАЧИТИ дію: рядок у журналі — це те, що потім
	 * читають обидва, і зроблене руками за пультом має лишати такий самий слід,
	 * як прохання із зали.
	 *
	 * Тому сітка тепер одна на обох, і єдине, що вимикає кнопки, — це `busy`:
	 * доки прохання летить, другого не приймаємо.
	 */
	interface Props {
		panel: Panel;
		levels: Record<string, number>;
		flags: Record<string, boolean>;
		/** Доки прохання летить, другого не приймаємо. */
		busy?: boolean;
		/** Комірка, яку щойно чіпали. Підсвічується на обох екранах. */
		recent?: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let { panel, levels, flags, busy = false, recent = null, press }: Props = $props();

	/**
	 * ДЕ ЩО СТОЇТЬ — рахується один раз на панель, а не вгадується розміткою.
	 *
	 * Віджет займає стільки клітинок, скільки в ньому органів, тож сітка більше
	 * не «п'ятнадцять однакових квадратів»: кожен елемент дістає своє місце
	 * явним `grid-area`. Порожні клітинки теж: без явного місця вони поповзли б
	 * у діри між віджетами.
	 */
	const board = $derived(layoutPanel(panel));

	/** `grid-area` рядком: рядок / стовпець / скільки рядів / скільки стовпців. */
	const spot = (at: Placed) => `${at.row + 1} / ${at.col + 1} / span ${at.rows} / span ${at.cols}`;

	const hole = (key: string) => {
		const index = Number(key);
		return `${Math.floor(index / 3) + 1} / ${(index % 3) + 1} / span 1 / span 1`;
	};
</script>

<div class="grid" data-testid="panel-list">
	<!--
		ПОРОЖНІ МІСЦЯ МАЛЮЮТЬСЯ, і саме вони тримають сітку сталою: без них панель
		із двох віджетів читалася б як панель на два місця, і рука в темряві не
		мала б за що чіплятися.
	-->
	{#each board.free as key (key)}
		<div
			class="cell cell--empty"
			style="grid-area: {hole(key)}"
			data-testid="panel-cell-{key}"
		></div>
	{/each}

	{#each board.placed as at (at.cell)}
		{@const key = at.cell}
		{@const cell = panel.cells[key]}
		{#if cell}
			{@const hex = colorOf(cell.color)}
			<!--
				КОЛІР — СМУГА ЗБОКУ Й ЛЕДЬ ПОМІТНА ПІДКЛАДКА, а не тло під текстом.
				Те саме рішення, що й у треків: інакше довелося б добирати читабельну
				пару до кожної з десяти заготовок у кожній темі. Колір тут для того,
				щоб віджет ЗНАХОДИЛИ оком, а не читали.
			-->
			<div
				class="cell"
				class:cell--recent={recent === key}
				class:cell--wide={!at.vertical}
				class:cell--tinted={hex !== null}
				style="grid-area: {spot(at)}{hex ? `; --widget-color: ${hex}` : ''}"
				data-testid="panel-cell-{key}"
			>
				{#if cell.caption || cell.icon}
					<span class="cell__caption">
						{#if cell.icon}<span class="cell__icon" aria-hidden="true">{cell.icon}</span>{/if}
						{cell.caption}
					</span>
				{/if}

				{#if cell.kind === 'buttons'}
					<div class="cell__stack">
						{#each cell.buttons ?? [] as button, index (index)}
							<button
								class="key"
								type="button"
								disabled={busy}
								onclick={() => press(key, 'press', index)}
								data-testid="panel-press-{key}-{index}-btn"
							>
								{button.label}
							</button>
						{/each}
					</div>
				{:else if cell.kind === 'slider'}
					{@const level = levels[key] ?? DEFAULT_LEVEL}
					<!--
						Дві кнопки замість справжнього повзунка, і це не спрощення.
						Тягнути повзунок у комірці завширшки з палець неможливо наосліп, а
						головне — помічник просить НАПРЯМОК («гучніше»), а не число:
						скільки саме це буде, вирішує крок, який поставив господар.
					-->
					<div class="cell__stack">
						<button
							class="key"
							type="button"
							disabled={busy}
							aria-label="{cell.caption}: {t('panel.up')}"
							onclick={() => press(key, 'bump', cell.step ?? 10)}
							data-testid="panel-up-{key}-btn"
						>
							{t('panel.up')}
						</button>
						<output class="cell__value mono" data-testid="panel-level-{key}-value">
							{level}
						</output>
						<button
							class="key"
							type="button"
							disabled={busy}
							aria-label="{cell.caption}: {t('panel.down')}"
							onclick={() => press(key, 'bump', -(cell.step ?? 10))}
							data-testid="panel-down-{key}-btn"
						>
							{t('panel.down')}
						</button>
					</div>
				{:else}
					{@const on = flags[key] === true}
					<div class="cell__stack">
						<button
							class="key key--check"
							class:key--on={on}
							type="button"
							disabled={busy}
							aria-pressed={on}
							onclick={() => press(key, 'toggle')}
							data-testid="panel-toggle-{key}-btn"
						>
							{on ? t('panel.on') : t('panel.off')}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	/*
	 * СІТКА ЗАЙМАЄ ТЕ, ЩО ЇЙ ДАЛИ, — а скільки дати, вирішує сторінка.
	 *
	 * Спершу тут стояло `aspect-ratio: 9 / 16` і межа висоти у `dvh`. Заміряно
	 * на 375×812: сітка виходила 343×610 при вільних 660 — тобто відношення
	 * з'їдало п'ятдесят точок висоти, а на них із трьох кнопок у комірці
	 * виходило 102×30 замість 102×44. Ціна відношення виявилася рівно тією, яку
	 * платити не можна: розміром кнопки, у яку тиснуть наосліп.
	 *
	 * Тепер висоту дає батьківський блок (у залі — уся вільна, на таблі —
	 * стільки, скільки не заважає журналу), а сітка лише ділить її на п'ять
	 * рядів. Ширина обмежена, щоб на моніторі сітка не розповзлася на пів
	 * екрана; на телефоні межа не спрацьовує ніколи.
	 *
	 * УМОВА ДО БАТЬКА: він мусить бути flex-колонкою з визначеною висотою.
	 * `block-size: 100%` тут НЕ працює й пробувалося: відсоток міряється від
	 * ОГОЛОШЕНОЇ висоти батька, а вона `auto` навіть тоді, коли flex уже дав
	 * йому 671 точку. Заміряно: сітка згорталася до 444 при вільних 671, і
	 * виглядало це як «чомусь маленька», без жодної помилки.
	 */
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		grid-template-rows: repeat(5, minmax(0, 1fr));
		gap: var(--gap-xs);
		flex: 1;
		min-block-size: 0;
		inline-size: 100%;
		max-inline-size: 26rem;
		margin-inline: auto;
	}

	.cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-inline-size: 0;
		min-block-size: 0;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
	}

	/*
	 * Порожня комірка — пунктир, а не суцільна рамка: вона мусить читатися як
	 * місце, куди щось стане, а не як орган, що не працює.
	 */
	.cell--empty {
		border-style: dashed;
		background: none;
	}

	/*
	 * КОЛІР — ОБВОДКА НАВКОЛО ВІДЖЕТА, а не смуга з одного боку.
	 *
	 * Смуга була позичена в треків, і там вона доречна: рядок списку має лише
	 * лівий край, за який око чіпляється. Віджет — прямокутник серед інших
	 * прямокутників, і смуга збоку в нього читалася як край сусіда. Гірше того,
	 * у повернутого віджета вона мусила переїжджати нагору, тобто той самий
	 * колір позначав різні сторони залежно від повороту.
	 *
	 * Обводка не має цієї вади: вона однакова в будь-якому повороті й окреслює
	 * саме ВІДЖЕТ. Підкладка лишається: сам лише контур на проєкторі в залі
	 * зливається з рамкою сусіда.
	 */
	.cell--tinted {
		border: 4px solid var(--widget-color);
		background: color-mix(in oklab, var(--widget-color) 12%, var(--bg-surface-raised));
	}

	.cell__icon {
		font-size: 0.85rem;
		line-height: 1;
	}

	/* Що щойно попросили — видно обом, і по тому самому місцю. */
	.cell--recent {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}

	.cell__caption {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 0.7rem;
		line-height: 1.1;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cell__stack {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-block-size: 0;
		min-inline-size: 0;
	}

	/* Повернутий віджет: органи стають у ряд, а не стовпчиком. */
	.cell--wide .cell__stack {
		flex-direction: row;
	}

	.cell__value {
		display: grid;
		flex: none;
		place-items: center;
		font-size: 0.8rem;
		line-height: 1;
	}

	/*
	 * Кнопки ДІЛЯТЬ висоту комірки порівну, а не мають свою.
	 *
	 * `min-height` тут був би гіршим за відсутній: чотири кнопки по 44 px не
	 * влазять у рядок сітки без прокрутки, тож межа або розсунула б сітку, або
	 * дала б прокрутку — обидва наслідки ламають те, заради чого сітка й
	 * фіксована. Замір і межі цього рішення названі в PROJECT-CONTEXT § 4б-7.
	 */
	.key {
		display: grid;
		flex: 1;
		place-items: center;
		min-block-size: 0;
		min-inline-size: 0;
		padding: 2px;
		overflow: hidden;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: inherit;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.05;
		text-align: center;
	}

	.key:disabled {
		cursor: default;
		opacity: 0.75;
	}

	@media (hover: hover) {
		.key:not(:disabled):hover {
			border-color: var(--accent);
		}
	}

	.key:focus-visible {
		border-color: var(--accent);
	}

	/* Відгук на палець: `:hover` на дотику не буває, а знати про натискання треба. */
	.key:not(:disabled):active {
		box-shadow: inset 0 0 0 999px var(--press-veil);
	}

	.key--check {
		font-weight: 600;
	}

	.key--on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>
