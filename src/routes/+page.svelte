<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IconBoard, IconPhone, IconTrash } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { forgetBoard, listBoards, type SavedBoard } from '$lib/board/myBoards';
	import { boardSession, toActive } from '$lib/board/session.svelte';

	let saved = $state<SavedBoard[]>([]);

	onMount(() => {
		saved = listBoards();
	});

	function reopen(board: SavedBoard) {
		boardSession.open(toActive(board));
		// Роль визначає сторінку: плеєр і пульт — різні екрани, а не режими.
		goto(board.role === 'player' ? resolve('/player') : resolve('/remote'));
	}

	function forget(board: SavedBoard) {
		forgetBoard(board.key);
		saved = listBoards();
	}
</script>

<div class="stack">
	<p class="lead">{t('entry.lead')}</p>

	<!--
		ДВІ КНОПКИ, І БІЛЬШЕ НІЧОГО НА ПЕРШОМУ ЕКРАНІ.

		Людина, яка вперше відкрила застосунок, стоїть перед одним питанням: вона
		біля комп'ютера, що гратиме, чи біля пристрою, з якого керуватимуть. Усе
		інше — назва дошки, пароль, тека — має сенс лише після відповіді на це,
		і на першому екрані воно тільки заважає.
	-->
	<div class="choice">
		<a class="choice__card" href={resolve('/create')} data-testid="go-create">
			<IconBoard size={40} aria-hidden="true" />
			<span class="choice__title">{t('entry.create')}</span>
			<span class="choice__hint">{t('entry.createHint')}</span>
		</a>

		<a class="choice__card" href={resolve('/connect')} data-testid="go-connect">
			<IconPhone size={40} aria-hidden="true" />
			<span class="choice__title">{t('entry.connect')}</span>
			<span class="choice__hint">{t('entry.connectHint')}</span>
		</a>
	</div>

	{#if saved.length > 0}
		<section class="card" data-testid="my-boards">
			<h2 class="mine__title">{t('entry.mine')}</h2>
			<ul class="mine">
				{#each saved as board (board.key)}
					<li class="mine__row">
						<button class="mine__open" type="button" onclick={() => reopen(board)}>
							<span class="mine__name">{board.name || board.id}</span>
							<span class="muted mono">{board.id}</span>
							<span class="muted">
								{board.role === 'player' ? t('player.title') : t('remote.title')}
							</span>
						</button>
						<button
							class="mine__forget"
							type="button"
							title={t('entry.forget')}
							aria-label={t('entry.forget')}
							onclick={() => forget(board)}
						>
							<IconTrash size={18} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.lead {
		color: var(--text-secondary);
		text-align: center;
		text-wrap: balance;
	}

	.choice {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--gap);
	}

	.choice__card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--gap-sm);
		min-height: 180px;
		padding: var(--gap-lg);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		box-shadow: 0 1px 2px var(--shadow-weak);
		color: inherit;
		text-align: center;
		text-decoration: none;
		transition:
			border-color 120ms ease,
			transform 120ms ease;
	}

	.choice__card:hover,
	.choice__card:focus-visible {
		border-color: var(--accent);
		transform: translateY(-2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.choice__card {
			transition: none;
		}
		.choice__card:hover,
		.choice__card:focus-visible {
			transform: none;
		}
	}

	.choice__title {
		font-size: 1.15rem;
		font-weight: 600;
	}

	.choice__hint {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.mine__title {
		margin-bottom: var(--gap-sm);
		font-size: 1rem;
	}

	.mine {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.mine__row {
		display: flex;
		gap: var(--gap-xs);
	}

	.mine__open {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--gap-sm);
		min-height: var(--tap);
		padding: 0 var(--gap-sm);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		cursor: pointer;
		text-align: start;
	}

	.mine__open:hover,
	.mine__open:focus-visible {
		border-color: var(--accent);
	}

	.mine__name {
		font-weight: 600;
	}

	.mine__forget {
		display: grid;
		place-items: center;
		width: var(--tap);
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.mine__forget:hover,
	.mine__forget:focus-visible {
		border-color: var(--danger);
		color: var(--danger);
	}
</style>
