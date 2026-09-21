<script lang="ts">
	import { IconFolder } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';

	/**
	 * ПОПЕРЕДЖЕННЯ ПЕРЕД ВИБОРОМ ПАПКИ — бо вікно вибору лякає мовчки.
	 *
	 * Системний діалог вибору ПАПКИ не показує файлів: ні в Chrome, ні в
	 * провіднику Windows. Людина, яка щойно поклала туди тридцять треків,
	 * відкриває його, бачить порожньо — і робить єдиний доступний висновок:
	 * «файли зникли». Далі вона йде шукати їх, а не обирати папку.
	 *
	 * Сказати це можна лише ДО того, як діалог відкрився: усередині нього ми не
	 * малюємо нічого й підписати його нічим.
	 *
	 * ## Чому вікно, а не рядок поруч із кнопкою
	 *
	 * Бо рядок поруч читають після того, як щось пішло не так, а це
	 * попередження мусить бути прочитане ПЕРЕД. Вікно затримує на один дотик
	 * саме там, де затримка й потрібна.
	 *
	 * ## Чому є «більше не показувати»
	 *
	 * Бо папку міняють: новий концерт — нова папка. Те саме попередження на
	 * дванадцятий раз перетворюється на кнопку, яку тиснуть не читаючи, — і
	 * тоді воно не працює вже й для першого разу, бо звичка «тиснути далі»
	 * переноситься на всі вікна застосунку.
	 *
	 * ЗГОДА ТУТ НЕ ЗБЕРІГАЄТЬСЯ САМА. Вікно лише каже, чим натиснули «Зрозумів»;
	 * записує це той, хто відкривав, — інакше компонент мусив би знати про
	 * налаштування, яких він не показує.
	 */
	interface Props {
		/** Людина зрозуміла. `hide` — більше не показувати цього вікна. */
		onaccept: (hide: boolean) => void;
		onclose: () => void;
	}

	let { onaccept, onclose }: Props = $props();

	let node = $state<HTMLDialogElement | null>(null);
	let hide = $state(false);

	$effect(() => {
		node?.showModal();
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="folder-hint-modal"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<h2 class="dialog__title">{t('player.folderHintTitle')}</h2>
		<p>{t('player.folderHintLead')}</p>
		<p class="muted">{t('player.folderHintHint')}</p>

		<Switch
			checked={hide}
			label={t('player.folderHintHide')}
			testid="folder-hint-hide"
			onchange={(next) => (hide = next)}
		/>

		<!--
			КНОПКА САМА Й ВІДКРИВАЄ ВИБІР ПАПКИ, а не просто закриває вікно.

			Браузер дає право показати вибір папки лише під натисканням людини, і
			право це живе мить. Якби вікно спершу закривалося, а вибір відкривався
			десь потім, браузер мав би повне право відмовити — і кнопка «Обрати
			папку» не робила б нічого, рівно як у тій вадi, через яку зʼявився
			застосунок для компʼютера.
		-->
		<button
			class="btn btn--primary"
			type="button"
			onclick={() => {
				onaccept(hide);
				node?.close();
			}}
			data-testid="folder-hint-accept-btn"
		>
			<IconFolder size={18} aria-hidden="true" />
			{t('player.folderHintAccept')}
		</button>
	</div>
</dialog>

<style>
	.dialog {
		width: min(460px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		/* Прокручується ВМІСТ, а не саме вікно — так само, як у решті вікон. */
		overflow: hidden;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
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

	.dialog__title {
		font-size: 1.1rem;
	}
</style>
