<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * ПОЛАМАНА СТОРІНКА — те, що показує межа помилки замість вмісту.
	 *
	 * Своїм файлом, а не всередині оболонки, з простої причини: оболонка
	 * відповідає за те, ЩО показувати (смуга, сторінка, вікна), а це — картина
	 * одного окремого стану, у якому показувати нічого. Вона не ділить з
	 * оболонкою ні стилів, ні даних; спільним був хіба рядок розмітки.
	 *
	 * Два виходи, а не один. «Спробувати ще» повертає до тієї самої сторінки й
	 * часто спрацьовує: межа ловить і збій рендера, і помилку в ефекті, а
	 * повторна спроба після зниклої мережі — звичайна річ. «У меню» потрібне на
	 * випадок, коли ламається саме ця сторінка: без нього людина лишилася б на
	 * екрані з однією кнопкою, яка не допомагає.
	 */
	interface Props {
		/** Повторити рендер. Приходить від `svelte:boundary`. */
		onretry: () => void;
	}

	let { onretry }: Props = $props();
</script>

<div class="crash" role="alert" data-testid="page-crash">
	<h1 class="crash__title">{t('error.crashTitle')}</h1>
	<p class="crash__hint">{t('error.crashHint')}</p>

	<div class="crash__actions">
		<button class="btn btn--primary" type="button" onclick={onretry} data-testid="crash-retry">
			{t('error.retry')}
		</button>
		<a class="btn" href={resolve('/menu')} data-testid="crash-to-menu">{t('error.toMenu')}</a>
	</div>
</div>

<style>
	.crash {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--gap);
		padding: var(--gap-lg) var(--gap);
		text-align: center;
	}

	.crash__title {
		margin: 0;
		font-size: 1.3rem;
	}

	.crash__hint {
		margin: 0;
		max-width: 60ch;
		color: var(--text-secondary);
	}

	.crash__actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap-sm);
	}
</style>
