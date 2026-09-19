<script lang="ts">
	import { IconInfo, IconKeyboard, IconPower } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		/** Показати «не закривайте вкладку». Правда лише для приймача. */
		keepOpen?: boolean;
		/** Власний `id`: на сторінці буває лише одна підказка, але дві вкладки — ні. */
		id?: string;
	}

	let { keepOpen = false, id = 'hotkey-tips' }: Props = $props();

	/**
	 * ПІДКАЗКА КЛАВІШ — ОДИН КОМПОНЕНТ НА ПРИЙМАЧ І ПУЛЬТ.
	 *
	 * Клавіші однакові з обох боків — у цьому й був задум: пультом буває ноутбук,
	 * і людина не мусить пам'ятати, на якому з екранів вона зараз. Два списки
	 * клавіш у двох файлах розійшлися б при першій же зміні, і розійшлися б тихо.
	 *
	 * Тултіп, а не блок у картці: перелік читають один раз, а місце під кнопками
	 * він займав би завжди. Розкриваючись усередині картки, він ще й зсував усе
	 * нижче — тобто рухав те, на що людина щойно дивилася.
	 *
	 * Показ на наведення, натискання й Tab: на дотиковому екрані наведення не
	 * буває, і сама лише `:hover` лишила б підказку недосяжною з телефона.
	 */
	let open = $state(false);
</script>

<div class="tip" class:tip--open={open}>
	<button
		class="tip__btn"
		type="button"
		aria-expanded={open}
		aria-describedby={id}
		aria-label={t('player.tips')}
		onclick={() => (open = !open)}
		data-testid="toggle-tips"
	>
		<IconInfo size={18} aria-hidden="true" />
	</button>

	<div class="tip__panel" {id} role="tooltip" data-testid="tips">
		<p class="tip__title">
			<IconKeyboard size={16} aria-hidden="true" />
			{t('hotkeys.tipTitle')}
		</p>

		<!--
			РЯДОК НА ДІЮ, а не суцільне речення.

			Перелік клавіш читають не так, як текст: шукають очима свою клавішу й
			зупиняються. У рядку через кому шукати нема за що — доводиться прочитати
			все, щоб знайти одне.
		-->
		<dl class="keys">
			<dt><kbd>Space</kbd></dt>
			<dd>{t('hotkeys.actPlayPause')}</dd>

			<dt><kbd>0</kbd></dt>
			<dd>{t('hotkeys.actStop')}</dd>

			<dt><kbd>1</kbd>–<kbd>9</kbd></dt>
			<dd>{t('hotkeys.actTrack')}</dd>

			<dt><kbd>←</kbd><kbd>→</kbd></dt>
			<dd>{t('hotkeys.actSeek')}</dd>

			<dt><kbd>↑</kbd><kbd>↓</kbd></dt>
			<dd>{t('hotkeys.actVolume')}</dd>

			<dt><kbd>M</kbd></dt>
			<dd>{t('hotkeys.actMute')}</dd>
		</dl>

		<p class="tip__foot">{t('hotkeys.tipFoot')}</p>

		{#if keepOpen}
			<p class="armed" data-testid="armed">
				<IconPower size={16} aria-hidden="true" />
				{t('player.keepOpen')}
			</p>
		{/if}
	</div>
</div>

<style>
	.tip {
		position: absolute;
		top: var(--gap-sm);
		right: var(--gap-sm);
	}

	/*
	 * Значок без кнопки навколо: рамка читалася б як ще один орган керування
	 * поруч із транспортом, хоч це підпис, а не дія над звуком. Сенсорна зона
	 * все одно повні 44px — вона просто не намальована.
	 */
	.tip__btn {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: color var(--transition-fast);
	}

	.tip__btn:hover,
	.tip__btn:focus-visible {
		color: var(--accent);
	}

	.tip__panel {
		position: absolute;
		top: calc(100% + var(--gap-xs));
		right: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		width: max-content;
		max-width: min(300px, calc(100vw - 48px));
		padding: var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-surface-raised);
		box-shadow: 0 8px 20px var(--shadow-strong);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--transition-fast),
			visibility var(--transition-fast);
	}

	/*
	 * `:focus-visible`, а не `:focus-within`.
	 *
	 * Натискання лишає фокус на кнопці, тож із `:focus-within` підказка вже не
	 * закривалася повторним натисканням: стан перемикався, а фокус тримав її
	 * відкритою. Клавіатурі це не шкодить — Tab дає саме `:focus-visible`.
	 */
	.tip:hover .tip__panel,
	.tip:has(.tip__btn:focus-visible) .tip__panel,
	.tip--open .tip__panel {
		opacity: 1;
		visibility: visible;
	}

	@media (prefers-reduced-motion: reduce) {
		.tip__btn,
		.tip__panel {
			transition: none;
		}
	}

	.tip__title {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	/*
	 * Клавіші рівним стовпчиком праворуч, дії — лівим краєм ліворуч. Око
	 * проходить по одній вертикалі, а не шукає початок кожного рядка заново.
	 */
	.keys {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--gap-xs) var(--gap-sm);
		margin: 0;
	}

	.keys dt {
		display: flex;
		gap: 2px;
		justify-content: end;
		white-space: nowrap;
	}

	.keys dd {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.keys kbd {
		display: inline-grid;
		place-items: center;
		min-width: 1.65rem;
		padding: 0.1rem 0.3rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.tip__foot {
		padding-top: var(--gap-xs);
		border-top: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	.armed {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
		color: var(--ok);
		font-size: 0.8rem;
	}
</style>
