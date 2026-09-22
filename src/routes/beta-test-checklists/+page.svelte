<script lang="ts">
	import { resolve } from '$app/paths';
	import { IconCheck, IconClose, IconCopy } from '$lib/config/icons';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import { BETA_TABS, LEVELS, tidOf, type BetaTab, type Coverage } from '$lib/beta/checks';
	import { betaMarks, byLevel, reportText, VERSION, type Vote } from '$lib/beta/marks.svelte';

	/**
	 * СТОРІНКА ЧЕКЛИСТА БЕТА-ТЕСТУ (BETA-CHECKLIST-v9 § 8).
	 *
	 * Її дають посиланням тому, хто згодився потикати застосунок. У меню її
	 * немає й не буде: це службова сторінка, а не розділ. Прихованість тут саме
	 * така — «не трапляється випадково», а не «неможливо знайти»: сайт
	 * статичний і з відкритого репозиторію, і будувати з довгої адреси секрет
	 * означало б себе обманювати. `noindex` уже стоїть на всіх сторінках
	 * (`app.html`), canonical і sitemap у проєкті немає взагалі — SEO тут
	 * вимкнено цілком (PROJECT-CONTEXT § 4).
	 *
	 * ## Чому немає власного перемикача мови
	 *
	 * Канон просить його там, де мов інтерфейсу БІЛЬШЕ, ніж мов чеклиста:
	 * інакше людина з нідерландським інтерфейсом побачила б англійський чеклист
	 * і не мала б чим перемкнути його на другу мову. Тут мов інтерфейсу рівно
	 * дві й вони ті самі, що в даних, тож чеклист іде за мовою сторінки, а
	 * другий перемикач був би другим способом зробити те саме.
	 */

	let tab = $state<BetaTab>(BETA_TABS[0]);
	let armed = $state(false);
	let copied = $state(false);
	/** Звіт у полі — запасний шлях, коли буфер обміну відмовив. */
	let fallback = $state('');

	const lang = $derived(i18n.locale);
	const say = (uk: string, en: string) => (lang === 'uk' ? uk : en);

	/**
	 * Читання зі сховища — ПІСЛЯ монтування, а не в оголошенні.
	 *
	 * Під передрендером `localStorage` існує (node 22+ кладе його в глобальну
	 * область) і НЕ порожній: читання дало б позначки машини збірки, запечені в
	 * HTML, який поїде всім.
	 */
	$effect(() => {
		betaMarks.load();
	});

	/**
	 * Таймери знімаються при виході зі сторінки.
	 *
	 * Піти звідси одразу після копіювання — не рідкість, а звичайний шлях:
	 * людина натиснула кнопку й пішла вставляти звіт. Таймер без цього лишився
	 * б жити й вистрелив у стан розмонтованої сторінки.
	 */
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let armTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => () => {
		if (copyTimer) clearTimeout(copyTimer);
		if (armTimer) clearTimeout(armTimer);
	});

	/**
	 * Номер пункта — НАСКРІЗНИЙ по вкладці, а не по рівню.
	 *
	 * Рівнів на вкладці три, і нумерація з одиниці в кожному дала б на одному
	 * екрані три пункти «№ 1». Людина каже не «`player_7`», а «зламалося на
	 * сьомому» — і в цю мить номер мусить означати рівно один рядок.
	 */
	const offsetOf = (level: Coverage) =>
		LEVELS.slice(0, LEVELS.indexOf(level)).reduce(
			(sum, before) => sum + byLevel(tab, before).length,
			0
		);

	const levelName = (level: Coverage) =>
		({
			manual: say('Тільки людина', 'Human only'),
			testable: say('Можна покрити тестом', 'Could be tested'),
			covered: say('Покрито тестом', 'Covered by a test')
		})[level];

	const voteName = (vote: Vote) =>
		({
			fail: say('Не працює', 'Broken'),
			weird: say('Дивно', 'Odd'),
			ok: say('Працює', 'Works')
		})[vote];

	async function copyReport() {
		const text = reportText(betaMarks.marks, lang, [navigator.userAgent, lang]);
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			fallback = '';
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 3000);
		} catch {
			// Буфер відмовляє буденно: вкладка не у фокусі, немає дозволу, http.
			// Мовчазна відмова знищила б усю роботу тестувальника на останньому
			// кроці, тому звіт зʼявляється текстом поруч.
			fallback = text;
		}
	}

	/**
	 * Стирання — у два кроки, і кнопка сама стає підтвердженням.
	 *
	 * Це єдина незворотна дія сторінки, і стоїть вона поруч зі звітом, до якого
	 * тягнуться щоразу: ціна помилки несиметрична — година роботи проти одного
	 * зайвого кліка. Не `confirm()`: нативне вікно блокує потік, не
	 * перекладається й не піддається жодній перевірці стилю.
	 */
	function clearMarks() {
		if (!armed) {
			armed = true;
			if (armTimer) clearTimeout(armTimer);
			// Зведена кнопка з минулого відвідування — та сама пастка з іншого боку.
			armTimer = setTimeout(() => (armed = false), 5000);
			return;
		}
		betaMarks.clear();
		armed = false;
	}
</script>

<div class="beta stack">
	<header class="beta__head card stack">
		<h1>{say('Чеклист бета-тесту', 'Beta test checklist')}</h1>
		<p class="muted">
			{say(
				'Позначте те, що встигли перевірити, і надішліть звіт. Позначка памʼятає версію: на новій збірці її треба поставити наново.',
				'Mark what you managed to check and send the report. A mark remembers the build version: on a new build it has to be set again.'
			)}
		</p>
		<p class="beta__meta">
			<span data-testid="beta-progress-value"
				>{say('Зроблено', 'Done')}: {betaMarks.done}/{betaMarks.total}</span
			>
			<span class="mono" data-testid="beta-version-text">{VERSION}</span>
			<a class="beta__link" href={resolve('/menu')} data-testid="beta-home-link"
				>{say('На головну', 'Home')}</a
			>
		</p>
	</header>

	<nav class="beta__tabs" aria-label={say('Розділи', 'Sections')}>
		{#each BETA_TABS as item (item.id)}
			<button
				type="button"
				class="beta__tab"
				class:beta__tab--on={item.id === tab.id}
				aria-pressed={item.id === tab.id}
				onclick={() => (tab = item)}
				data-testid="beta-tab-{item.id}-btn"
			>
				{item.title[lang]}
				<span class="beta__count" data-testid="beta-tab-{item.id}-progress-text"
					>{betaMarks.doneIn(item)}/{item.checks.length}</span
				>
			</button>
		{/each}
	</nav>

	<p class="beta__screens">
		<span class="muted">{say('Де це дивитися:', 'Where to look:')}</span>
		{#each tab.routes as route (route)}
			<a
				class="beta__link mono"
				href={resolve(route)}
				data-testid="beta-screen-{tidOf(route.slice(1) || 'root')}-link">{route}</a
			>
		{/each}
	</p>

	{#each LEVELS as level (level)}
		{@const checks = byLevel(tab, level)}
		{#if checks.length > 0}
			<section class="card stack" data-testid="beta-level-{level}-section">
				<h2 class="subtitle">{levelName(level)} · {checks.length}</h2>

				<ul class="beta__list">
					{#each checks as check, index (check.id)}
						{@const tid = tidOf(check.id)}
						{@const mark = betaMarks.fresh(check.id)}
						<li
							class="beta__item"
							class:beta__item--marked={mark !== null}
							data-testid="beta-check-{tid}-item"
						>
							<p class="beta__text" data-testid="beta-check-{tid}-text">
								<span class="beta__no">{offsetOf(level) + index + 1}.</span>
								<span class="beta__cat" data-testid="beta-check-{tid}-category-text"
									>{check.category[lang]}</span
								>
								{check.text[lang]}
							</p>

							{#if check.test}
								<p class="beta__test mono">{check.test}</p>
							{/if}
							{#if betaMarks.stale(check.id)}
								<p class="beta__stale" data-testid="beta-check-{tid}-stale-hint">
									{say('Позначено на іншій версії', 'Marked on another version')}
								</p>
							{/if}

							<div class="beta__votes">
								{#each ['fail', 'weird', 'ok'] as const as vote (vote)}
									<button
										type="button"
										class="beta__vote beta__vote--{vote}"
										class:beta__vote--on={mark?.vote === vote}
										aria-pressed={mark?.vote === vote}
										onclick={() => betaMarks.vote(check.id, vote)}
										data-testid="beta-vote-{tid}-{vote}-btn"
									>
										{voteName(vote)}
									</button>
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}

	<section class="card stack">
		<div class="beta__actions">
			<button
				class="btn btn--primary"
				type="button"
				onclick={copyReport}
				data-testid="beta-report-btn"
			>
				<IconCopy size={18} aria-hidden="true" />
				{say('Скопіювати звіт', 'Copy the report')}
			</button>
			<button
				class="btn btn--danger"
				type="button"
				onclick={clearMarks}
				data-testid="beta-clear-btn"
			>
				{#if armed}<IconCheck size={18} aria-hidden="true" />{:else}<IconClose
						size={18}
						aria-hidden="true"
					/>{/if}
				{armed
					? say('Точно стерти все?', 'Really erase everything?')
					: say('Стерти позначки', 'Erase marks')}
			</button>
		</div>

		{#if copied}
			<p class="beta__ok" data-testid="beta-report-hint">{say('Скопійовано', 'Copied')}</p>
		{/if}
		{#if fallback}
			<p class="muted">
				{say(
					'Буфер обміну відмовив — звіт нижче, скопіюйте його вручну.',
					'The clipboard refused: the report is below, copy it by hand.'
				)}
			</p>
			<textarea
				class="input beta__report"
				readonly
				rows="10"
				aria-label={say('Звіт для копіювання', 'The report to copy')}
				data-testid="beta-report-input">{fallback}</textarea
			>
		{/if}
	</section>
</div>

<style>
	.beta {
		max-width: 62rem;
		margin-inline: auto;
	}

	.beta__meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap);
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.beta__tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	/*
	 * ТЕКСТ ПОСЕРЕДИНІ, А НЕ ПРИТИСНУТИЙ ДО ВЕРХУ.
	 *
	 * Доти тут стояло `align-items: baseline` — щоб число «0/11» сиділо на
	 * спільній лінії з назвою. Разом із `min-height` це дало інше: рядок у 24
	 * точки притиснувся до верху коробки в 44, і під ним лишилося 20 порожніх.
	 * Заміряно: текст 4 зверху й 20 знизу, тоді як у сусідніх органів на тій
	 * самій сторінці — 13 і 15. Тобто вкладки не просто негарні, вони єдині
	 * такі, і око чіпляється саме за різницю.
	 *
	 * Базова лінія програла центруванню свідомо: різниця в базовій лінії між
	 * 16 і 13.6 точки — це один-два пікселі, а різниця у вертикальному
	 * положенні була шістнадцять.
	 */
	.beta__tab {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		background: var(--bg-surface);
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
	}

	.beta__tab--on {
		border-color: var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}

	.beta__count {
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.beta__screens {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
		margin: 0;
	}

	/*
	 * Посилання тут — ЦІЛЬ ДЛЯ ПАЛЬЦЯ, а не текст у рядку.
	 *
	 * Сторінку відкривають із телефона так само, як і решту застосунку, а
	 * підкреслений рядок заввишки 22 точки пальцем не влучається. Стандарт
	 * проєкту — 44×44 (`--tap`), і `a11y-layout.spec.ts` міряє це щоразу: перший
	 * же прогін цієї сторінки впав саме на цих п'яти посиланнях.
	 */
	.beta__link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* Корінь застосунку підписаний однією скісною — без межі по ширині ця
		   ціль виходила 29 точок при потрібних 44. */
		min-inline-size: var(--tap);
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		text-decoration: none;
	}

	.beta__link:hover,
	.beta__link:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
	}

	.beta__list {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/*
	 * Позначений пункт видно З ВІДСТАНІ, і не самим лише кольором кнопки:
	 * повернувшись до списку, людина шукає, де зупинилася, а не перечитує.
	 */
	.beta__item {
		padding: var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
	}

	.beta__item--marked {
		border-color: var(--accent);
		border-inline-start-width: 4px;
	}

	.beta__text {
		margin: 0 0 var(--gap-xs);
	}

	.beta__no {
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.beta__cat {
		margin-inline-end: var(--gap-xs);
		font-weight: 600;
	}

	.beta__test,
	.beta__stale {
		margin: 0 0 var(--gap-xs);
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.beta__votes,
	.beta__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	/*
	 * Стан несе не лише колір: рамка, товщина й накреслення. Інакше він
	 * недоступний тому, хто кольори не розрізняє.
	 */
	.beta__vote {
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: var(--text-secondary);
		cursor: pointer;
		font: inherit;
	}

	.beta__vote--on {
		border-width: 2px;
		font-weight: 700;
	}

	.beta__vote--fail.beta__vote--on {
		border-color: var(--danger);
		color: var(--danger);
	}

	.beta__vote--weird.beta__vote--on {
		border-color: var(--warn);
		color: var(--warn);
	}

	.beta__vote--ok.beta__vote--on {
		border-color: var(--ok);
		color: var(--ok);
	}

	.beta__ok {
		margin: 0;
		color: var(--ok);
		font-weight: 600;
	}

	.beta__report {
		font-family: var(--font-mono);
		white-space: pre;
	}
</style>
