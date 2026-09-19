<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		IconBack,
		IconEye,
		IconEyeOff,
		IconFolder,
		IconPower,
		IconRefresh,
		IconWarning
	} from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { boardSession } from '$lib/board/session.svelte';
	import { describeError } from '$lib/net/describeError';
	import { PlayerController } from '$lib/player/controller.svelte';

	let controller = $state<PlayerController | null>(null);
	let fatal = $state<string | null>(null);

	const hiddenCount = $derived(
		controller ? Object.values(controller.hidden).filter(Boolean).length : 0
	);

	onMount(() => {
		boardSession.restore();
		const board = boardSession.current;
		if (!board) {
			void goto(resolve('/'));
			return;
		}

		const instance = new PlayerController(board);
		controller = instance;

		let dispose: (() => void) | null = null;
		instance
			.start()
			.then((stop) => {
				dispose = stop;
			})
			.catch((error: unknown) => {
				// Текст із `error.message` тут був би технічним рядком Firebase.
				fatal = t(describeError(error));
			});

		// Знімається ВСЕ: підписки на команди, присутність, приховане й сам
		// програвач. Без цього друге відкриття сторінки виконувало б кожну
		// команду двічі.
		return () => {
			dispose?.();
			instance.stop();
		};
	});
</script>

<div class="stack">
	<a class="back" href={resolve('/')}>
		<IconBack size={18} aria-hidden="true" />
		{t('common.back')}
	</a>

	{#if fatal}
		<p class="error" role="alert">{fatal}</p>
	{:else if controller && boardSession.current}
		{@const board = boardSession.current}
		{@const engine = controller.engine}

		<header class="head card">
			<div>
				<h1 class="head__title">{board.name || t('player.title')}</h1>
				<p class="muted mono">{board.id}</p>
			</div>
			<p class="muted">{t('player.listeners', { count: controller.remotes })}</p>
		</header>

		{#if !controller.supported}
			<p class="note note--warn" data-testid="no-support">
				<IconWarning size={18} aria-hidden="true" />
				<span>{t('player.noSupport')}</span>
			</p>
		{:else}
			<!--
				ОЗБРОЄННЯ СТОЇТЬ ПЕРШИМ І НАЙБІЛЬШИМ.

				Доки його не натиснули, жодна команда з телефона не пролунає, і
				людина біля комп'ютера не має способу про це здогадатися: сторінка
				виглядає робочою, дошка на зв'язку, список треків на місці. Тому
				кнопка тут не «ще одна опція», а те, повз що не пройти.
			-->
			{#if !engine.armed}
				<section class="arm card" data-testid="arm-block">
					<button
						class="btn btn--primary arm__btn"
						type="button"
						onclick={() => controller?.arm()}
						data-testid="arm"
					>
						<IconPower size={22} aria-hidden="true" />
						{t('player.arm')}
					</button>
					<p class="muted">{t('player.armHint')}</p>
				</section>
			{:else}
				<p class="armed" data-testid="armed">
					<IconPower size={18} aria-hidden="true" />
					{t('player.armed')} · {t('player.keepOpen')}
				</p>
			{/if}

			<section class="card stack">
				{#if controller.sourceStatus === 'none'}
					<button
						class="btn btn--primary"
						type="button"
						onclick={() => controller?.pickFolder()}
						data-testid="pick-folder"
					>
						<IconFolder size={18} aria-hidden="true" />
						{t('player.pickFolder')}
					</button>
				{:else if controller.sourceStatus === 'need-permission'}
					<p class="note note--warn">
						<IconWarning size={18} aria-hidden="true" />
						<span>{t('player.folderLost')}</span>
					</p>
					<button
						class="btn btn--primary"
						type="button"
						onclick={() => controller?.restoreFolder()}
						data-testid="restore-folder"
					>
						{t('player.restore')}
					</button>
				{:else}
					<div class="folder">
						<span class="folder__name">{controller.folderName}</span>
						<div class="row">
							<button class="btn" type="button" onclick={() => controller?.rescan()}>
								<IconRefresh size={18} aria-hidden="true" />
								{t('player.rescan')}
							</button>
							<button class="btn" type="button" onclick={() => controller?.pickFolder()}>
								{t('player.changeFolder')}
							</button>
						</div>
					</div>

					{#if controller.scanning}
						<p class="muted">{t('player.scanning')}</p>
					{:else if controller.tracks.length === 0}
						<p class="muted">{t('player.empty')}</p>
					{:else}
						<p class="muted">
							{t('player.found', { count: controller.tracks.length })}
							{#if hiddenCount > 0}
								· {t('player.hiddenCount', { count: hiddenCount })}
							{/if}
						</p>

						<ul class="tracks">
							{#each controller.tracks as track (track.id)}
								{@const isHidden = controller.hidden[track.id] === true}
								<li class="tracks__row" class:tracks__row--hidden={isHidden}>
									<span
										class="tracks__title"
										class:tracks__title--playing={engine.trackId === track.id}
									>
										{track.title}
									</span>
									<button
										class="tracks__toggle"
										type="button"
										title={isHidden ? t('player.show') : t('player.hide')}
										aria-label={isHidden ? t('player.show') : t('player.hide')}
										onclick={() => controller?.toggleHidden(track.id)}
									>
										{#if isHidden}
											<IconEyeOff size={18} aria-hidden="true" />
										{:else}
											<IconEye size={18} aria-hidden="true" />
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			{#if controller.trouble}
				<p class="error" role="alert" data-testid="player-trouble">
					{t(controller.trouble.key as 'error.playback', { name: controller.trouble.name })}
				</p>
			{/if}
		{/if}
	{:else}
		<p class="muted">{t('common.loading')}</p>
	{/if}
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--gap-xs);
		align-self: start;
		min-height: var(--tap);
		color: var(--text-secondary);
		text-decoration: none;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.head__title {
		font-size: 1.2rem;
	}

	.arm {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		border-color: var(--accent);
	}

	.arm__btn {
		min-height: 64px;
		font-size: 1.1rem;
	}

	.armed {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		color: var(--ok);
		font-size: 0.9rem;
	}

	.folder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-sm);
	}

	.folder__name {
		font-weight: 600;
		word-break: break-all;
	}

	.note {
		display: flex;
		gap: var(--gap-sm);
		align-items: start;
		color: var(--text-secondary);
		font-size: 0.85rem;
	}

	.note--warn {
		color: var(--warn);
	}

	.tracks {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 50vh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.tracks__row {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-sm);
	}

	.tracks__row:nth-child(odd) {
		background: var(--bg-sunken);
	}

	.tracks__row--hidden .tracks__title {
		color: var(--text-secondary);
		text-decoration: line-through;
	}

	.tracks__title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tracks__title--playing {
		color: var(--accent);
		font-weight: 700;
	}

	.tracks__toggle {
		display: grid;
		place-items: center;
		width: var(--tap);
		min-height: var(--tap);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.tracks__toggle:hover,
	.tracks__toggle:focus-visible {
		color: var(--accent);
	}
</style>
