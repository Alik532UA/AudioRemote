<script lang="ts">
	import { IconClose } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import type { PlayerController } from '$lib/player/controller.svelte';
	import VisibilityPicker from './VisibilityPicker.svelte';

	interface Props {
		controller: PlayerController;
		onclose: () => void;
	}

	let { controller, onclose }: Props = $props();

	/**
	 * ПРИХОВАНІ ЗОВСІМ — ОКРЕМЕ ВІКНО, і без нього стану «ніде» не існувало б.
	 *
	 * Трек, прихований від усіх, зникає зі списку повністю: ні рядка, ні
	 * клавіші. Якби це був єдиний екран, повернути його було б неможливо — а
	 * стан, з якого немає виходу, це не стан, а втрата.
	 *
	 * Тому вікно відкривається з того самого місця, де написано, скільки їх:
	 * лічильник і є входом. Шукати окремий пункт у налаштуваннях застосунку не
	 * треба — і не можна: приховані належать ЦІЙ папці, а налаштування спільні
	 * для всіх дошок.
	 */
	let node = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		node?.showModal();
	});

	/*
	 * Вікно закривається САМЕ, коли повертати нічого. Інакше людина лишалася б
	 * перед порожнім переліком і мусила закривати його руками — при тому, що
	 * єдина дія тут якраз і спорожнює список.
	 */
	$effect(() => {
		if (controller.hiddenTracks.length === 0) node?.close();
	});
</script>

<dialog
	bind:this={node}
	class="dialog"
	data-testid="hidden-modal"
	{onclose}
	onclick={(event) => {
		// Клік по самому <dialog> — це клік по затемненню: вміст лежить усередині.
		if (event.target === node) node?.close();
	}}
>
	<div class="dialog__body">
		<header class="dialog__head">
			<h2 class="dialog__title">{t('player.hiddenOpen')}</h2>
			<button
				type="button"
				aria-label={t('common.close')}
				onclick={() => node?.close()}
				data-testid="hidden-modal-close-btn"
			>
				<IconClose size={20} aria-hidden="true" />
			</button>
		</header>

		<ul class="list">
			{#each controller.hiddenTracks as track (track.id)}
				<li class="list__item">
					<div class="list__title" data-testid="hidden-title-{track.id}">{track.title}</div>
					<p class="muted mono list__path">{track.path}</p>
					<VisibilityPicker
						value={track.visibility}
						trackId={track.id}
						onchange={(next) => controller.setVisibility(track.id, next)}
					/>
				</li>
			{/each}
		</ul>
	</div>
</dialog>

<style>
	.dialog {
		width: min(560px, calc(100vw - 32px));
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.dialog__title {
		font-size: 1.1rem;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list__item {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		padding: var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
	}

	.list__title {
		font-weight: 600;
	}

	.list__path {
		word-break: break-all;
	}
</style>
