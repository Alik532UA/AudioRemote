<script lang="ts">
	import { IconClose, IconLater, IconZap } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		path: string;
		triggerOpen: boolean;
		activeTriggerMode: 'api' | 'schedule';
		ontoggletrigger: (mode: 'api' | 'schedule') => void;
		onclose: () => void;
	}

	let { path, triggerOpen, activeTriggerMode, ontoggletrigger, onclose }: Props = $props();
</script>

<header class="dialog__head">
	<h2 class="dialog__title">{t('track.settings')}</h2>

	<!-- Ім'я файлу лишається тим самим: застосунок нічого не перейменовує. -->
	<p class="muted mono dialog__file">{path}</p>

	<!--
		Перемикач розділу стоїть у шапці, а не внизу списку полів: саме він
		вирішує, наскільки велике це вікно, і шукати його під формою, яку
		він же й відкриває, довелося б згори вниз і назад.
	-->
	<div class="dialog__triggers">
		<button
			class="btn"
			class:btn--primary={triggerOpen && activeTriggerMode === 'schedule'}
			type="button"
			aria-expanded={triggerOpen && activeTriggerMode === 'schedule'}
			onclick={() => ontoggletrigger('schedule')}
			data-testid="open-schedule-btn"
		>
			<IconLater size={18} aria-hidden="true" />
			{t('trigger.modeSchedule')}
		</button>
		<button
			class="btn"
			class:btn--primary={triggerOpen && activeTriggerMode === 'api'}
			type="button"
			aria-expanded={triggerOpen && activeTriggerMode === 'api'}
			onclick={() => ontoggletrigger('api')}
			data-testid="open-trigger-btn"
		>
			<IconZap size={18} aria-hidden="true" />
			{t('trigger.modeApi')}
		</button>
	</div>

	<!-- Круглий вигляд кнопці закриття дає канонний локатор, не цей клас. -->
	<button
		class="dialog__close"
		type="button"
		aria-label={t('common.close')}
		onclick={onclose}
		data-testid="track-modal-close-btn"
	>
		<IconClose size={20} aria-hidden="true" />
	</button>
</header>

<style>
	.dialog__head {
		container-type: inline-size;
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
		word-break: break-all;
		min-width: 0;
	}

	.dialog__triggers {
		grid-area: api;
		display: flex;
		gap: var(--gap-xs);
	}

	.dialog__close {
		grid-area: close;
	}

	@container (max-width: 560px) {
		.dialog__head {
			grid-template-areas:
				'title close'
				'file  file'
				'api   api';
			grid-template-columns: 1fr auto;
			gap: var(--gap-sm);
		}

		.dialog__triggers {
			width: 100%;
		}

		.dialog__triggers .btn {
			flex: 1;
			justify-content: center;
		}
	}
</style>
