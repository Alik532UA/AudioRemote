<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import { DEFAULT_LEVEL, type Panel, type PanelCommandType } from '$lib/net/panelTypes';
	import { controlOf, layoutPanel, type Placed } from '$lib/panel/layout';
	import { fitKeys } from '$lib/panel/fitKeys';
	import { colorOf } from '$lib/config/trackColors';
	import { attentionState } from '$lib/services/attention.svelte';

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
		/**
		 * ЩО САМЕ щойно натиснули: `controlOf(...)` плюс `#` і номер натискання.
		 *
		 * Не просто комірка: у віджеті органів кілька, і спалахнути мусить той,
		 * якого торкнулися, а не всі його сусіди. Номер у хвості потрібен для
		 * повторів — двічі підряд та сама кнопка дає той самий орган, і без
		 * номера друге натискання не відрізнити від першого взагалі.
		 */
		hot?: string | null;
		/**
		 * ЧИЙ ПУЛЬТ ПОКАЗУВАТИ. `null` — усе, що є на панелі.
		 *
		 * У залі помічників буває кілька, і роботи в них різні. Віджети без
		 * назви пульта бачать усі — див. `panelTypes.ts`.
		 */
		sheet?: string | null;
		press: (cell: string, type: PanelCommandType, value?: number) => void;
	}

	let {
		panel,
		levels,
		flags,
		busy = false,
		recent = null,
		hot = null,
		sheet = null,
		press
	}: Props = $props();

	/**
	 * ДЕ ЩО СТОЇТЬ — рахується один раз на панель, а не вгадується розміткою.
	 *
	 * Віджет займає стільки клітинок, скільки в ньому органів, тож сітка більше
	 * не «п'ятнадцять однакових квадратів»: кожен елемент дістає своє місце
	 * явним `grid-area`. Порожні клітинки теж: без явного місця вони поповзли б
	 * у діри між віджетами.
	 */
	const board = $derived(layoutPanel(panel, sheet));

	/** `grid-area` рядком: рядок / стовпець / скільки рядів / скільки стовпців. */
	const spot = (at: Placed) => `${at.row + 1} / ${at.col + 1} / span ${at.rows} / span ${at.cols}`;

	const hole = (key: string) =>
		`${Math.floor(Number(key) / board.grid.cols) + 1} / ${(Number(key) % board.grid.cols) + 1} / span 1 / span 1`;

	/** Колір змінною, а не класом: назв кольорів десять, а правило одне. */
	const paint = (hex: string | null) => (hex ? `; --widget-color: ${hex}` : '');

	/** Стиль для кнопки: власний колір та колір світіння за каскадом. */
	const keyStyle = (own: string | null, glow: string | null, hidden?: boolean) =>
		hidden
			? 'visibility: hidden; pointer-events: none;'
			: (own ? `--widget-color: ${own}` : '') + (glow ? `; --key-glow: ${glow}` : '') || undefined;

	/**
	 * Чи цей орган щойно натиснули — і яким саме натисканням.
	 *
	 * Порівняння з `#` на кінці, а не голим початком рядка: без роздільника
	 * `3|press|1` збігався б із `3|press|11`, і спалахувала б чужа кнопка.
	 */
	const fire = (control: string) => (hot?.startsWith(`${control}#`) ? hot : '');

	/**
	 * СПАЛАХ НА НАТИСНУТІЙ КНОПЦІ — і чому його перезапускає JavaScript.
	 *
	 * Сам спалах — це CSS: клас `key--hot` вмикає такт, який за п'ять секунд
	 * гасне до власного кольору кнопки. Але клас НЕ ПЕРЕЗАПУСКАЄ такт: та сама
	 * кнопка двічі поспіль лишає його ввімкненим, браузер не бачить зміни, і
	 * друге натискання не показує нічого. Тому тут класичний прийом: інлайновий
	 * `animation: none`, змушене перемальовування, зняття інлайну — після цього
	 * такт починається спочатку.
	 *
	 * Ім'я такту звідси НЕ називається навмисно: Svelte перейменовує `@keyframes`
	 * під хеш компонента, і будь-яке ім'я в JS розійшлося б зі стилями на
	 * першій же збірці.
	 */
	function glow(node: HTMLElement, mark: string) {
		let seen = mark;
		return {
			update(next: string) {
				if (next === seen) return;
				seen = next;
				if (!next) return;

				node.style.animation = 'none';
				void node.offsetWidth;
				node.style.animation = '';
			}
		};
	}
</script>

<!--
	РОЗМІР СІТКИ ПРИЇЖДЖАЄ З ПАНЕЛІ, а не стоїть у стилях числом: складальник
	міняє його на дошці, і обидва екрани мусять побачити те саме.
-->
<div
	class="grid"
	style="--grid-cols: {board.grid.cols}; --grid-rows: {board.grid.rows}"
	data-testid="panel-list"
>
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
			{@const attentionHex = attentionState.color ? colorOf(attentionState.color) : null}
			<!--
				Підписи, за якими `fitKeys` знає, що пора перерахувати розмір. Дія
				висить на `.cell__stack`, а не на самій комірці: `style` комірки
				належить Svelte, і перше ж оновлення переписувало його цілком — разом
				із розміром, який поставила дія. Заміряно: після перезавантаження
				змінної на комірці не лишалося зовсім.
			-->
			{@const words = `${cell.kind}|${(cell.buttons ?? []).map((one) => one.label).join('|')}`}
			<div
				class="cell"
				class:cell--recent={recent === key}
				class:cell--tinted={hex !== null}
				style="grid-area: {spot(at)}; --cols: {at.cols}{paint(hex)}"
				data-testid="panel-cell-{key}"
			>
				{#if cell.caption || cell.icon}
					<span class="cell__caption">
						{#if cell.icon}<span class="cell__icon" aria-hidden="true">{cell.icon}</span>{/if}
						{cell.caption}
					</span>
				{/if}

				{#if cell.kind === 'buttons'}
					<!--
						ОРГАНИ СТАЮТЬ ПО ФОРМІ ВІДЖЕТА: стільки стовпців, скільки клітинок
						він займає вшир. Чотири кнопки у віджеті 2×2 стануть квадратом, ті
						самі чотири в 1×4 — рядком, і окремого правила для кожної форми не
						треба жодного.
					-->
					<div class="cell__stack cell__stack--grid" use:fitKeys={words}>
						{#each cell.buttons ?? [] as button, index (index)}
							{@const own = colorOf(button.color)}
							{@const glowHex = own ?? hex ?? attentionHex}
							{@const mark = fire(controlOf(key, 'press', index))}
							<button
								class="key"
								class:key--tinted={own !== null}
								class:key--hot={mark !== ''}
								type="button"
								disabled={busy || button.hidden}
								style={keyStyle(own, glowHex, button.hidden)}
								use:glow={mark}
								onclick={() => press(key, 'press', index)}
								data-testid="panel-press-{key}-{index}-btn">{button.label}</button
							>
						{/each}
					</div>
				{:else if cell.kind === 'slider'}
					{@const level = levels[key] ?? DEFAULT_LEVEL}
					{@const step = cell.step ?? 10}
					{@const glowHex = hex ?? attentionHex}
					{@const up = fire(controlOf(key, 'bump', step))}
					{@const down = fire(controlOf(key, 'bump', -step))}
					<!--
						Дві кнопки замість справжнього повзунка, і це не спрощення.
						Тягнути повзунок у комірці завширшки з палець неможливо наосліп, а
						головне — помічник просить НАПРЯМОК («гучніше»), а не число:
						скільки саме це буде, вирішує крок, який поставив господар.
					-->
					<div class="cell__stack" class:cell__stack--row={at.cols > at.rows} use:fitKeys={words}>
						<button
							class="key"
							class:key--hot={up !== ''}
							type="button"
							disabled={busy}
							aria-label="{cell.caption}: {t('panel.up')}"
							style={keyStyle(null, glowHex)}
							use:glow={up}
							onclick={() => press(key, 'bump', step)}
							data-testid="panel-up-{key}-btn">{t('panel.up')}</button
						>
						<output class="cell__value mono" data-testid="panel-level-{key}-value">{level}</output>
						<button
							class="key"
							class:key--hot={down !== ''}
							type="button"
							disabled={busy}
							aria-label="{cell.caption}: {t('panel.down')}"
							style={keyStyle(null, glowHex)}
							use:glow={down}
							onclick={() => press(key, 'bump', -step)}
							data-testid="panel-down-{key}-btn">{t('panel.down')}</button
						>
					</div>
				{:else}
					{@const on = flags[key] === true}
					{@const glowHex = hex ?? attentionHex}
					{@const mark = fire(controlOf(key, 'toggle'))}
					<div class="cell__stack" use:fitKeys={words}>
						<button
							class="key key--check"
							class:key--on={on}
							class:key--hot={mark !== ''}
							type="button"
							disabled={busy}
							aria-pressed={on}
							style={keyStyle(null, glowHex)}
							use:glow={mark}
							onclick={() => press(key, 'toggle')}
							data-testid="panel-toggle-{key}-btn">{on ? t('panel.on') : t('panel.off')}</button
						>
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
	 * Спершу тут стояло `aspect-ratio: 9 / 16` і межа висоти в `dvh`. Заміряно
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
		grid-template-columns: repeat(var(--grid-cols, 3), minmax(0, 1fr));
		grid-template-rows: repeat(var(--grid-rows, 5), minmax(0, 1fr));
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

	/*
	 * СТОС ОРГАНІВ — СІТКА, А НЕ КОЛОНКА, і рахує вона клітинки віджета.
	 *
	 * Доти органи завжди стояли в один ряд або в один стовпчик, бо й віджет був
	 * смужкою завширшки в клітинку. Відколи віджетові можна задати свій
	 * прямокутник, «стовпчик» перестав бути відповіддю: чотири кнопки у віджеті
	 * 2×2 мусять стати квадратом. `--cols` приходить із розкладки й каже,
	 * скільки клітинок завширшки віджет узяв; решта — робота сітки.
	 */
	.cell__stack {
		display: grid;
		flex: 1;
		gap: 2px;
		grid-auto-rows: minmax(0, 1fr);
		grid-auto-columns: minmax(0, 1fr);
		min-block-size: 0;
		min-inline-size: 0;
	}

	.cell__stack--grid {
		grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
	}

	/* Повзунок у широкому віджеті: «більше», число й «менше» стають у ряд. */
	.cell__stack--row {
		grid-auto-flow: column;
	}

	/*
	 * ЧИСЛО ПОВЗУНКА — ТАКОГО Ж ЗРОСТУ, ЯК КНОПКИ НАД НИМ І ПІД НИМ.
	 *
	 * Доти воно було дрібним написом посеред двох великих кнопок: ряд сітки під
	 * нього виділявся такий самий, а займало воно з нього хіба чверть. Виходив
	 * віджет із дірою посередині — і саме в тій дірі стоїть єдине, заради чого
	 * повзунок і дивляться, ПОЛОЖЕННЯ.
	 *
	 * Тому ті самі 80% місця, що й у кнопки, і шрифт, який читається з тієї ж
	 * відстані. Рамки немає навмисно: число не тиснеться, і рамка обіцяла б
	 * третю кнопку.
	 */
	.cell__value {
		display: grid;
		place-items: center;
		place-self: center;
		inline-size: 80%;
		block-size: 80%;
		min-block-size: 0;
		min-inline-size: 0;
		font-size: 1.3rem;
		font-weight: 600;
		line-height: 1;
	}

	/*
	 * КНОПКА ЗАЙМАЄ 80% СВОГО МІСЦЯ, а не все до країв.
	 *
	 * Доти органи впиралися один в одного: між ними лишалося дві точки, і група
	 * з трьох кнопок читалася як один довгий прямокутник, поділений рисками. Те,
	 * що це ТРИ окремі цілі, доводилося з'ясовувати пальцем.
	 *
	 * Повітря навколо кнопки — і є та відповідь. Вісімдесят відсотків у кожному
	 * напрямку лишають зазор приблизно в п'яту частину клітинки, і за ним кнопки
	 * видно як окремі. Розміру це коштує небагато: клітинка на телефоні —
	 * 102×122, тобто кнопка лишається 82×98 при стандарті 44×44
	 * (PROJECT-CONTEXT § 4б-7).
	 */
	.key {
		display: grid;
		place-items: center;
		place-self: center;
		inline-size: 80%;
		block-size: 80%;
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
		/*
		 * РОЗМІР ПІДБИРАЄ `fitKeys` — найбільший, що вміщається, один на віджет.
		 * Сталий 0.78rem хибив в обидва боки: у широкій кнопці підпис був
		 * дрібний, у вузькій — «трохи гучніше» зрізало краєм. Запасне значення
		 * — на мить до першого заміру.
		 */
		font-size: var(--key-size);
		line-height: 1.1;
		text-align: center;
	}

	/*
	 * СВІЙ КОЛІР У КНОПКИ — і він сильніший за колір віджета, навмисно.
	 *
	 * Колір віджета обводить усю групу; колір кнопки має виділити ОДНУ з них
	 * серед сусідок («стоп» червоним серед білих). Тому тут не обводка, а
	 * помітніша підкладка: обводка всередині обводки читалася б як друга рамка
	 * того самого віджета.
	 */
	.key--tinted {
		border-color: var(--widget-color);
		background: color-mix(in oklab, var(--widget-color) 22%, var(--bg-surface));
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

	/*
	 * НАТИСНУТА КНОПКА СВІТИТЬСЯ Й ГАСНЕ П'ЯТЬ СЕКУНД.
	 *
	 * Доти натискання було видно лише в журналі — тобто в іншому кінці екрана, а
	 * на самій панелі не лишалося нічого. Людина, яка щойно натиснула, не бачила,
	 * ЩО саме вона натиснула, і звіряла це очима по журналу.
	 *
	 * Світиться `box-shadow`, а не тло: вставлена тінь лягає ПОВЕРХ будь-якого
	 * тла й ПІД текстом, тож те саме правило працює і для білої кнопки, і для
	 * тієї, якій дали власний колір, — і гасне вона до власного кольору, хай
	 * який він. Тло довелося б гасити в десять різних кінцевих значень.
	 *
	 * П'ять секунд — це довго навмисно: звукорежисер дивиться на пульт, а не на
	 * екран, і підіймає очі вже після того, як прохання прозвучало.
	 */
	.key--hot {
		animation: press-glow 5s ease-out;
	}

	@keyframes press-glow {
		from {
			box-shadow:
				inset 0 0 0 999px color-mix(in oklab, var(--key-glow, var(--accent)) 35%, transparent),
				0 0 0 3px var(--key-glow, var(--accent));
		}
		to {
			box-shadow:
				inset 0 0 0 999px transparent,
				0 0 0 3px transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.key--hot {
			animation: none;
		}
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
