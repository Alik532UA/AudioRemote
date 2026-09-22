<script lang="ts">
	import { untrack } from 'svelte';
	import { IconClose, IconKeyboard, IconZap } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { MAX_GAP_SEC, MAX_ICON, MAX_PLAYS } from '$lib/audio/boardConfig';
	import { isAssignable, labelForCode, ordinalKey } from '$lib/hotkeys/hotkeys';
	import type { BoardEditor, BoardTrack } from '$lib/board/editor';
	import TriggerEditor from './TriggerEditor.svelte';
	import ColorPalette from '$lib/components/ui/ColorPalette.svelte';
	import NumberStepper from '$lib/components/ui/NumberStepper.svelte';
	import VisibilityPicker from './VisibilityPicker.svelte';

	interface Props {
		track: BoardTrack;
		/*
		 * Саме інтерфейс, а не контролер плеєра: те саме вікно відкриває
		 * адміністратор із пульта, і там за ним стоїть не файл, а команда мережею.
		 */
		controller: BoardEditor;
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
	data-testid="track-modal"
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
				data-testid="open-trigger-btn"
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
				data-testid="track-modal-close-btn"
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

				<!--
					ЗНАЧОК — ОКРЕМЕ ПОЛЕ, і в нього вводять, а не обирають зі списку.
					
					Спершу емодзі вставлявся просто в підпис, і з цього виходило дві біди
					одразу: на телефоні він займав місце в першому з двох рядків назви, а
					вирівняти чи збільшити його було неможливо — він був частиною
					речення. Окремим полем він стає позначкою збоку на всю висоту рядка.
					
					Потім тут стояв набір готових значків, і його прибрано: будь-який
					готовий набір або завеликий, щоб у ньому шукати, або замалий, щоб у
					ньому знайшлося потрібне. Клавіатура емодзі є і в телефоні, і в
					системі (Win+. на комп'ютері), і вона вміє все.
				-->
				<div class="field">
					<label class="field__label" for="track-icon">{t('track.emoji')}</label>
					<input
						id="track-icon"
						class="input input--icon"
						type="text"
						maxlength={MAX_ICON}
						value={track.icon ?? ''}
						placeholder={t('track.emojiHint')}
						data-testid="track-icon"
						oninput={(event) => controller.setIcon(track.id, event.currentTarget.value)}
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
								{t('hotkeys.byOrder', { key: byOrder, nth: t(ordinalKey(byOrder)) })}
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
					<NumberStepper
						id="track-plays"
						label={t('track.plays')}
						value={track.plays}
						min={1}
						max={MAX_PLAYS}
						onchange={(next) => controller.setRepeat(track.id, next, track.gapSec)}
					/>
				</div>

				{#if track.plays > 1}
					<div class="field">
						<label class="field__label" for="track-gap">{t('track.gap')}</label>
						<NumberStepper
							id="track-gap"
							label={t('track.gap')}
							value={track.gapSec}
							min={0}
							max={MAX_GAP_SEC}
							onchange={(next) => controller.setRepeat(track.id, track.plays, next)}
						/>
						<p class="muted">{t('track.gapHint')}</p>
					</div>
				{/if}

				<div class="field">
					<span class="field__label">{t('color.pick')}</span>
					<ColorPalette
						value={track.color ?? null}
						testid="swatch"
						onpick={(slug) => controller.setColor(track.id, slug)}
					/>
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
	/*
	 * Поле значка вузьке навмисно: у ньому один символ, і поле на всю ширину
	 * обіцяло б, що туди кладуть текст. Сам символ показується великим — таким
	 * він і стоятиме в списку.
	 */
	.input--icon {
		width: 5rem;
		font-size: 1.5rem;
		line-height: 1.2;
		text-align: center;
	}

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
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
