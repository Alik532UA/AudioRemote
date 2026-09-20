<script lang="ts">
	import { untrack } from 'svelte';
	import { IconCheck, IconTrash, IconWarning } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
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

<div class="stack">
	<p class="muted">{t('trigger.lead')}</p>

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
			</span>
		{:else}
			<span>{t('trigger.never')}</span>
		{/if}
	</p>

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
</div>

<style>
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

	/* Той самий перемикач списком, що й у налаштуваннях: один вибір — одна рамка. */
	.picker {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
	}

	.picker__item {
		min-height: var(--tap);
		padding: 0 var(--gap);
		border: 0;
		border-top: 1px solid var(--border);
		background: none;
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		text-align: start;
	}

	.picker__item:first-child {
		border-top: 0;
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
