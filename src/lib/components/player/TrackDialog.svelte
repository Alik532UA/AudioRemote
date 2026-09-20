<script lang="ts">
	import { untrack } from 'svelte';
	import { IconClose, IconKeyboard, IconZap } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { colorNumber, TRACK_COLORS } from '$lib/config/trackColors';
	import { MAX_GAP_SEC, MAX_PLAYS } from '$lib/audio/boardConfig';
	import { isAssignable, labelForCode } from '$lib/hotkeys/hotkeys';
	import type { BoardTrack } from '$lib/player/controller.svelte';
	import type { PlayerController } from '$lib/player/controller.svelte';
	import TriggerEditor from './TriggerEditor.svelte';
	import VisibilityPicker from './VisibilityPicker.svelte';

	interface Props {
		track: BoardTrack;
		controller: PlayerController;
		onclose: () => void;
	}

	let { track, controller, onclose }: Props = $props();

	/**
	 * Цифра, яка діє за порядком, доки клавіші нікому не призначені.
	 *
	 * Без цього вікно казало б «Не призначено» про трек, біля якого в списку
	 * стоїть `3` і який справді запускається трійкою.
	 */
	const byOrder = $derived(track.hotkey ? null : (controller.keyLabels[track.id] ?? null));

	/**
	 * НАЛАШТУВАННЯ ТРЕКУ — ОКРЕМЕ ВІКНО, а не панель під рядком.
	 *
	 * Панель під рядком розсовувала список: усе нижче зʼїжджало, а на довгому
	 * списку відкритий трек ще й виїжджав за межу видимого. Вікно посеред екрана
	 * не рухає нічого й не залежить від того, де саме стоїть рядок.
	 *
	 * `<dialog>` із `showModal()`, а не свій `div`: браузер сам дає затемнення,
	 * закриття по Escape, повернення фокуса туди, звідки прийшли, і пастку
	 * фокуса всередині. Усе це довелося б писати руками — і, як завжди буває,
	 * зробити гірше.
	 */
	let node = $state<HTMLDialogElement | null>(null);
	/** Чекаємо натискання клавіші, щоб призначити її треку. */
	let capturing = $state(false);
	let rejected = $state<string | null>(null);
	/**
	 * Чи розгорнутий запуск за API.
	 *
	 * Згорнутий типово: цим користується одиниця з десяти. Розгортається сам,
	 * якщо тригер уже налаштований, — інакше його не було б видно взагалі.
	 *
	 * Від цього ж залежить ширина вікна: три колонки потрібні тільки тоді, коли
	 * є чим їх заповнити. Порожні дві третини поруч із підписом і палітрою — це
	 * та сама марна порожнеча, тільки з іншого боку.
	 */
	let triggerOpen = $state(untrack(() => controller.triggerFor(track.id).url.length > 0));

	$effect(() => {
		node?.showModal();
	});

	/**
	 * Захоплення клавіші.
	 *
	 * Слухач ставиться на ВІКНО й ловить подію на стадії перехоплення: інакше її
	 * першим побачив би `<dialog>` і закрився б на Escape саме тоді, коли Escape
	 * означає «скасувати захоплення».
	 */
	$effect(() => {
		if (!capturing) return;

		const onKey = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			capturing = false;

			if (event.code === 'Escape') return;
			if (!isAssignable(event.code)) {
				rejected = event.code;
				return;
			}
			rejected = null;
			controller.setHotkey(track.id, event.code);
		};

		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	class:dialog--wide={triggerOpen}
	data-testid="track-dialog"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<!--
			Шапка — сітка з іменованими місцями, а не два вкладені ряди.

			На телефоні ряди мусять перебудуватися: назва з хрестиком, під ними
			шлях на всю ширину, ще нижче кнопка розділу. Вкладеними рядами цього
			не зробити — довелося б переносити елементи між контейнерами, а від
			цього кнопка закриття щоразу опинялася б у новому місці.
		-->
		<header class="dialog__head">
			<h2 class="dialog__title">{t('track.settings')}</h2>

			<!-- Ім'я файлу лишається тим самим: застосунок нічого не перейменовує. -->
			<p class="muted mono dialog__file">{track.path}</p>

			<!--
				Перемикач розділу стоїть у шапці, а не внизу списку полів: саме він
				вирішує, наскільки велике це вікно, і шукати його під формою, яку
				він же й відкриває, довелося б згори вниз і назад.
			-->
			<button
				class="btn dialog__api"
				class:btn--primary={triggerOpen}
				type="button"
				aria-expanded={triggerOpen}
				onclick={() => (triggerOpen = !triggerOpen)}
				data-testid="open-trigger"
			>
				<IconZap size={18} aria-hidden="true" />
				{t('track.trigger')}
			</button>

			<!-- Круглий вигляд кнопці закриття дає канонний локатор, не цей клас. -->
			<button
				class="dialog__close"
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="track-dialog-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<!--
			ТРИ КОЛОНКИ, А НЕ ОДИН СТОВПЕЦЬ.

			Одним стовпцем вікно з відкритим запуском за API виростало вище за
			екран: зʼявлялася прокрутка, а обабіч лишалося порожнє місце, якого
			саме й бракувало. Колонки не додають нічого нового — вони кладуть те
			саме туди, де воно вміщається.

			Редактор тригера — `display: contents`: його панелі стають комірками
			ЦІЄЇ сітки. Інакше він був би однією коміркою з власним стовпцем
			усередині, і вирівняти його поля з рештою вікна не вийшло б.
		-->
		<div class="grid" class:grid--wide={triggerOpen}>
			<section class="pane">
				<h3 class="pane__title">{t('track.paneMain')}</h3>

				<div class="field">
					<label class="field__label" for="track-title">{t('track.displayName')}</label>
					<input
						id="track-title"
						class="input"
						type="text"
						maxlength="200"
						value={track.title}
						placeholder={track.fileName}
						data-testid="track-title"
						oninput={(event) => controller.setTitle(track.id, event.currentTarget.value)}
					/>
				</div>

				<div class="field">
					<span class="field__label">{t('hotkeys.assign')}</span>
					<div class="row">
						<button
							class="btn"
							class:btn--primary={capturing}
							type="button"
							onclick={() => {
								capturing = true;
								rejected = null;
							}}
							data-testid="capture-key"
						>
							<IconKeyboard size={18} aria-hidden="true" />
							{#if capturing}
								{t('hotkeys.pressAny')}
							{:else if track.hotkey}
								{labelForCode(track.hotkey)}
							{:else if byOrder}
								{t('hotkeys.byOrder', { key: byOrder })}
							{:else}
								{t('hotkeys.none')}
							{/if}
						</button>

						{#if track.hotkey}
							<button
								class="btn"
								type="button"
								onclick={() => controller.setHotkey(track.id, null)}
								data-testid="clear-key"
							>
								{t('hotkeys.clear')}
							</button>
						{/if}
					</div>

					{#if rejected}
						<p class="error" data-testid="key-rejected">
							{t('hotkeys.reserved', { key: labelForCode(rejected) })}
						</p>
					{/if}
				</div>

				<!--
					ПОВТОРИ — кількість ВІДТВОРЕНЬ, а не повторів понад одне.
					«Повторів: 3» читалося б як чотири рази рівно в половини людей.

					Пауза з'являється лише тоді, коли повтори справді є: поле «пауза
					між відтвореннями» біля одноразового треку не означає нічого.
				-->
				<div class="field">
					<label class="field__label" for="track-plays">{t('track.plays')}</label>
					<input
						id="track-plays"
						class="input mono"
						type="number"
						min="1"
						max={MAX_PLAYS}
						value={track.plays}
						data-testid="track-plays"
						oninput={(event) =>
							controller.setRepeat(track.id, Number(event.currentTarget.value), track.gapSec)}
					/>
				</div>

				{#if track.plays > 1}
					<div class="field">
						<label class="field__label" for="track-gap">{t('track.gap')}</label>
						<input
							id="track-gap"
							class="input mono"
							type="number"
							min="0"
							max={MAX_GAP_SEC}
							value={track.gapSec}
							data-testid="track-gap"
							oninput={(event) =>
								controller.setRepeat(track.id, track.plays, Number(event.currentTarget.value))}
						/>
						<p class="muted">{t('track.gapHint')}</p>
					</div>
				{/if}

				<div class="field">
					<span class="field__label">{t('color.pick')}</span>
					<div class="palette">
						<button
							class="palette__cell palette__cell--none"
							type="button"
							title={t('color.none')}
							aria-label={t('color.none')}
							aria-pressed={track.color === null}
							onclick={() => controller.setColor(track.id, null)}
						></button>
						{#each TRACK_COLORS as swatch (swatch.slug)}
							<button
								class="palette__cell"
								type="button"
								style="--swatch: {swatch.hex}"
								title={t('color.label', { n: colorNumber(swatch.slug) })}
								aria-label={t('color.label', { n: colorNumber(swatch.slug) })}
								aria-pressed={track.color === swatch.slug}
								onclick={() => controller.setColor(track.id, swatch.slug)}
								data-testid="swatch-{swatch.slug}"
							></button>
						{/each}
					</div>
				</div>

				<VisibilityPicker
					value={track.visibility}
					trackId={track.id}
					onchange={(next) => controller.setVisibility(track.id, next)}
				/>
			</section>

			{#if triggerOpen}
				<TriggerEditor trackId={track.id} {controller} />
			{/if}
		</div>
	</div>
</dialog>

<style>
	.dialog {
		width: min(520px, calc(100vw - 32px));
		/*
		 * Вікно не буває вищим за екран: коли полів забагато навіть у трьох
		 * колонках, прокручується ВМІСТ, а не сторінка під затемненням.
		 */
		max-height: calc(100dvh - 48px);
		/*
		 * Прокручується ВМІСТ, а не саме вікно. Без цього рядка смуг дві: у
		 * `__body` своя (він і має прокручуватися), а в самого вікна ще одна —
		 * бо падінг тіла додається до його ж `max-height`, і тіло на кілька
		 * десятків пікселів переростає вікно.
		 */
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog--wide {
		width: min(1080px, calc(100vw - 32px));
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		max-height: inherit;
		overflow: auto;
		padding: var(--gap-lg);
	}

	.dialog__head {
		display: grid;
		grid-template-areas:
			'title api close'
			'file  api close';
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: var(--gap-xs) var(--gap-sm);
	}

	.dialog__title {
		grid-area: title;
		align-self: end;
		font-size: 1.1rem;
	}

	.dialog__file {
		grid-area: file;
		align-self: start;
		/* Довгий шлях переноситься по буквах, а не відсуває кнопки за край. */
		word-break: break-all;
		min-width: 0;
	}

	.dialog__api {
		grid-area: api;
	}

	.dialog__close {
		grid-area: close;
	}

	/*
	 * На телефоні шапка стає трьома рядами.
	 *
	 * В один ряд назва й кнопка розділу лишали шляху файлу смужку завширшки з
	 * три букви, і «Відбій.mp3» розсипався на три рядки. Ширини тут не
	 * вистачає ні на що, крім хрестика, — отже, решта йде під низ.
	 */
	@media (max-width: 560px) {
		.dialog__head {
			grid-template-areas:
				'title close'
				'file  file'
				'api   api';
			grid-template-columns: 1fr auto;
			gap: var(--gap-sm);
		}

		.dialog__api {
			justify-content: center;
			width: 100%;
		}
	}

	.grid {
		display: grid;
		gap: var(--gap);
		grid-template-columns: 1fr;
		/* Колонки різної висоти стоять на своєму місці, а не тягнуться до найвищої. */
		align-items: start;
	}

	/*
	 * Межа в 980px, а не «скільки влізе»: три колонки по 300px плюс проміжки й
	 * відступи — це рівно стільки. Вужче вони починають ламати підписи полів.
	 */
	@media (min-width: 980px) {
		.grid--wide {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	.palette__cell {
		width: 32px;
		height: 32px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--swatch);
		cursor: pointer;
		transition: transform var(--transition-fast);
	}

	.palette__cell--none {
		border-color: var(--border-strong);
		background: var(--bg-sunken);
	}

	.palette__cell:hover,
	.palette__cell:focus-visible {
		border-color: var(--accent);
		transform: scale(1.1);
	}

	.palette__cell[aria-pressed='true'] {
		border-color: var(--text-primary);
		/* Обраний колір видно й тоді, коли він майже збігається з тлом вікна. */
		box-shadow: 0 0 0 2px var(--bg-surface-raised) inset;
	}
</style>
