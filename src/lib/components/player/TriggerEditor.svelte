<script lang="ts">
	import { untrack } from 'svelte';
	import { IconCheck, IconTrash, IconWarning } from '$lib/config/icons';
	import { plural, t } from '$lib/i18n/i18n.svelte';
	import {
		emptyTrigger,
		MIN_INTERVAL_SEC,
		TRIGGER_TESTS,
		type TrackTrigger
	} from '$lib/triggers/trigger';
	import { triggerWatcher } from '$lib/triggers/watcher.svelte';
	import type { PlayerController } from '$lib/player/controller.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';

	interface Props {
		trackId: string;
		controller: PlayerController;
	}

	let { trackId, controller }: Props = $props();

	/**
	 * ЗАПУСК ТРЕКУ ЗА ЧУЖИМ API — ПОЛЯ, А НЕ ВСТАВЛЕНИЙ СКРИПТ.
	 *
	 * Причина в `trigger.ts` і коротко тут: політика безпеки цього застосунку не
	 * має `unsafe-eval`, і саме вона тримає весь клас «чужий код виконався на
	 * сторінці». Знімати її заради зручності одного налаштування означало б
	 * зняти захист і з дошки, і з пароля.
	 *
	 * Тому людина описує, ЗВІДКИ брати і ЯК порівняти. Цього досить для
	 * будь-якого JSON API — і саме тому джерело може бути яким завгодно, а не
	 * лише тим, під яке ми написали б окрему кнопку.
	 */
	/*
	 * Чернетка знімається ОДИН раз, на відкритті: далі її править людина, і
	 * перечитувати збережене під її руками означало б затирати набране.
	 * `untrack` каже це прямо, а не лишає здогадуватися.
	 */
	let draft = $state<TrackTrigger>(
		untrack(() => ({ ...emptyTrigger(), ...controller.triggerFor(trackId) }))
	);
	let saved = $state(false);

	/**
	 * Заголовки редагуються текстом, а не таблицею полів.
	 *
	 * Ключ доступу зазвичай приходить одним рядком із документації чужого API —
	 * його вставляють, а не набирають по частинах.
	 */
	let headersText = $state(
		untrack(() =>
			Object.entries(controller.triggerFor(trackId).headers)
				.map(([name, value]) => `${name}: ${value}`)
				.join(String.fromCharCode(10))
		)
	);

	const parseHeaders = (text: string): Record<string, string> => {
		const headers: Record<string, string> = {};
		for (const line of text.split(String.fromCharCode(10))) {
			const at = line.indexOf(':');
			if (at < 1) continue;
			const name = line.slice(0, at).trim();
			const value = line.slice(at + 1).trim();
			if (name && value) headers[name] = value;
		}
		return headers;
	};

	const health = $derived(triggerWatcher.health[trackId] ?? null);

	function save() {
		controller.setTrigger(trackId, {
			...draft,
			url: draft.url.trim(),
			everySec: Math.max(MIN_INTERVAL_SEC, Math.round(draft.everySec) || MIN_INTERVAL_SEC),
			headers: parseHeaders(headersText)
		});
		saved = true;
		setTimeout(() => (saved = false), 2000);
	}
</script>

<!--
	ДВІ ПАНЕЛІ Й СПІЛЬНИЙ НИЗ, а не один довгий список.

	`display: contents` на обгортці: панелі стають комірками сітки ВІКНА, поруч
	з панеллю самого треку. Власна сітка тут дала б колонки всередині колонки —
	поля розʼїхалися б із сусідніми, і вікно читалося б як два різні вікна.
-->
<div class="trigger">
	<section class="pane">
		<h3 class="pane__title">{t('trigger.paneSource')}</h3>

		<!--
			Пояснення стоїть у коротшій колонці, і це не випадковість: у спільному
			низі воно розтягувало вікно вниз рівно тоді, коли сусідня колонка вже
			була найвищою. Тут воно займає порожнє місце, якого й так вистачало.
		-->
		<p class="muted">{t('trigger.lead')}</p>

		<div class="field">
			<label class="field__label" for="trigger-url">{t('trigger.url')}</label>
			<input
				id="trigger-url"
				class="input mono"
				type="url"
				inputmode="url"
				placeholder="https://"
				bind:value={draft.url}
				data-testid="trigger-url"
			/>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-every">{t('trigger.every')}</label>
			<input
				id="trigger-every"
				class="input mono"
				type="number"
				min={MIN_INTERVAL_SEC}
				max="3600"
				bind:value={draft.everySec}
				data-testid="trigger-every"
			/>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-headers">{t('trigger.headers')}</label>
			<textarea
				id="trigger-headers"
				class="input mono area"
				rows="2"
				spellcheck="false"
				placeholder="Authorization: Bearer …"
				bind:value={headersText}
				data-testid="trigger-headers"
			></textarea>
			<p class="muted">{t('trigger.headersHint')}</p>
		</div>
	</section>

	<section class="pane">
		<h3 class="pane__title">{t('trigger.paneWhen')}</h3>

		<Switch
			checked={draft.on}
			label={t('trigger.on')}
			testid="trigger-on"
			onchange={(next) => (draft.on = next)}
		/>

		<div class="field">
			<Switch
				checked={draft.onChange}
				label={t('trigger.onChange')}
				testid="trigger-onchange"
				onchange={(next) => (draft.onChange = next)}
			/>
			<p class="muted">{t('trigger.onChangeHint')}</p>
		</div>

		<div class="field">
			<label class="field__label" for="trigger-path">{t('trigger.path')}</label>
			<input
				id="trigger-path"
				class="input mono"
				type="text"
				spellcheck="false"
				bind:value={draft.path}
				data-testid="trigger-path"
			/>
			<p class="muted">{t('trigger.pathHint')}</p>
		</div>

		<div class="field">
			<span class="field__label" id="trigger-test-label">{t('trigger.test')}</span>
			<div class="picker" role="radiogroup" aria-labelledby="trigger-test-label">
				{#each TRIGGER_TESTS as test (test)}
					<button
						class="picker__item"
						type="button"
						role="radio"
						aria-checked={draft.test === test}
						onclick={() => (draft.test = test)}
						data-testid="trigger-test-{test}"
					>
						{t(`trigger.${test}`)}
					</button>
				{/each}
			</div>
		</div>

		{#if draft.test !== 'truthy'}
			<div class="field">
				<label class="field__label" for="trigger-value">{t('trigger.value')}</label>
				<input
					id="trigger-value"
					class="input"
					type="text"
					bind:value={draft.value}
					data-testid="trigger-value"
				/>
			</div>
		{/if}
	</section>

	<!--
		Пояснення, стан і кнопки — на всю ширину під колонками.

		Вони стосуються ОБОХ панелей: пояснення однакове для адреси й умови, стан
		останнього опитування залежить від них разом, а «Зберегти» зберігає все.
		У колонці вони виглядали б як власність тієї колонки.
	-->
	<footer class="foot">
		<div class="foot__text">
			<!--
				Стан останнього опитування видно тут, бо найчастіша причина «не працює» —
				не наш код, а заборона чужого сервера пускати браузер. Мовчання в цьому
				місці виглядало б як зламаний застосунок.
			-->
			<p class="note" class:note--warn={health?.error} data-testid="trigger-health">
				{#if health?.error}
					<IconWarning size={18} aria-hidden="true" />
					<!--
						Текст добирається ТУТ, а не в опитувачі: там він застиг би мовою, яка
						була на момент помилки, і не змінився б від перемикання мови.
					-->
					<span>
						{#if health.error.code === 'http'}
							{t('trigger.errHttp', { detail: health.error.detail })}
						{:else if health.error.code === 'policy'}
							{t('trigger.errPolicy')}
						{:else}
							{t('trigger.errNetwork')}
						{/if}
					</span>
				{:else if health}
					<span>
						{t('trigger.lastOk', { value: health.value })}
						· {t('trigger.fires', { count: health.fires })}
						<!--
							Коли адресу слухає не один трек, це варто сказати: «опитано щойно»
							на треку, який сам нічого не питав, інакше виглядало б помилкою.
						-->
						{#if health.shared > 1}
							·
							{plural(
								{ one: 'trigger.sharedOne', few: 'trigger.sharedFew', other: 'trigger.sharedMany' },
								health.shared
							)}
						{/if}
					</span>
				{:else}
					<span>{t('trigger.never')}</span>
				{/if}
			</p>
		</div>

		<div class="row">
			<button class="btn btn--primary" type="button" onclick={save} data-testid="trigger-save">
				{#if saved}
					<IconCheck size={18} aria-hidden="true" />
					{t('settings.saved')}
				{:else}
					{t('trigger.save')}
				{/if}
			</button>

			{#if controller.triggerFor(trackId).url}
				<button
					class="btn btn--danger"
					type="button"
					onclick={() => {
						controller.setTrigger(trackId, null);
						draft = emptyTrigger();
						headersText = '';
					}}
					data-testid="trigger-clear"
				>
					<IconTrash size={18} aria-hidden="true" />
					{t('trigger.clear')}
				</button>
			{/if}
		</div>
	</footer>
</div>

<style>
	/*
	 * Обгортки для сітки не існує: її панелі — прямі комірки сітки вікна.
	 * Інакше редактор був би однією коміркою, і три колонки перетворилися б на
	 * дві з вкладеним стовпцем усередині другої.
	 */
	.trigger {
		display: contents;
	}

	/* Низ іде під усіма колонками, скільки б їх не було. */
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: var(--gap);
		grid-column: 1 / -1;
	}

	.foot__text {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		/* Текст займає рядок, але не витісняє кнопки на власний. */
		flex: 1 1 22rem;
		min-width: 0;
	}

	.area {
		min-height: calc(var(--tap) * 1.4);
		resize: vertical;
		font-size: 0.8rem;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.8rem;
		word-break: break-word;
	}

	.note--warn {
		color: var(--warn);
	}

	/*
	 * Умови ПО ДВІ В РЯД, а не стовпчиком.
	 *
	 * Шість пунктів стовпчиком — це 264px, і рівно на них колонка переростала
	 * вікно: зʼявлялася прокрутка там, де поруч стояли дві порожні третини
	 * панелі. Пари ще й чесніші за зміст: кожна умова стоїть поруч зі своїм
	 * запереченням.
	 *
	 * Проміжок в один піксель на тлі рамки — це і є лінії між пунктами: власні
	 * рамки комірок подвоювалися б на стиках.
	 */
	.picker {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--border);
	}

	.picker__item {
		min-height: var(--tap);
		padding: var(--gap-sm) var(--gap);
		border: 0;
		background: var(--bg-surface-raised);
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker__item:hover,
	.picker__item:focus-visible {
		background: var(--bg-sunken);
	}

	.picker__item[aria-checked='true'] {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--accent-soft);
		font-weight: 600;
	}
</style>
