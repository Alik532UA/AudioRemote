<script lang="ts">
	import { IconClose } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import SettingsPanel from './SettingsPanel.svelte';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();

	/**
	 * НАЛАШТУВАННЯ ПОВЕРХ СТОРІНКИ, А НЕ ЗАМІСТЬ НЕЇ.
	 *
	 * Перехід на окрему сторінку коштував двох речей, і обидві помічають не
	 * одразу.
	 *
	 * Перша: у браузері сторінка приймача, яку покинули, втрачає дескриптор
	 * теки — дозвіл живе рівно доти, доки живе та сторінка. Тобто «зайшов
	 * подивитися налаштування» закінчувалося «оберіть папку з музикою» й
	 * порожнім списком.
	 *
	 * Друга гірша: приймач ГРАЄ. Піти з нього посеред заняття, щоб змінити
	 * гучність за замовчуванням, — це зупинити музику в залі.
	 *
	 * Вікно не чіпає ні того, ні іншого: сторінка лишається змонтованою, звук
	 * грає, тека на місці.
	 */
	let node = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		node?.showModal();
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="settings-modal"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="settings-modal-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<SettingsPanel />
	</div>
</dialog>

<style>
	.dialog {
		width: min(1100px, calc(100vw - 32px));
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
		background: var(--bg-page);
		color: var(--text-primary);
		box-shadow: 0 10px 25px var(--shadow-strong);
	}

	.dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.dialog__body {
		max-height: inherit;
		overflow: auto;
		padding: var(--gap);
	}

	/*
		Хрестик у кутку над заголовком панелі: власного заголовка у вікна немає
		навмисно — його вже написала панель, і другий поруч читався б як два
		різні вікна.
	*/
	.dialog__head {
		display: flex;
		justify-content: end;
	}
</style>
