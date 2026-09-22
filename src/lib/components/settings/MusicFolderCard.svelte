<script lang="ts">
	import { onMount } from 'svelte';
	import { IconCheck, IconFolder } from '$lib/config/icons';
	import { t } from '$lib/i18n/i18n.svelte';
	import { confirmed } from '$lib/services/confirmed.svelte';
	import { rememberedFolder, rememberFolder, runningInTauri } from '$lib/audio/tauriSource';

	/**
	 * ПАПКА З МУЗИКОЮ — окрема картка, і не лише заради розміру панелі.
	 *
	 * Це ЄДИНЕ налаштування, якого в браузері не буває взагалі: сторінка не може
	 * відкрити файл за шляхом у принципі, хоч би скільки його вводили
	 * (PROJECT-CONTEXT § 5.0). Решта панелі однакова скрізь, і гілка «а тут ще
	 * питаємо, чи ми в застосунку» серед неї читалася як забутий виняток.
	 *
	 * Тут навмисно два шляхи до однієї речі: діалог і поле. Діалог зручніший,
	 * коли папку шукають; поле — коли шлях уже є (скопіювали з провідника,
	 * продиктували, переносять налаштування на другий комп'ютер школи).
	 *
	 * Обидва закінчуються однаково: `rememberFolder` не лише запам'ятовує шлях,
	 * а й видає застосунку право читати саме цю папку. Забути про друге —
	 * означало б зберегти шлях і лишити список порожнім.
	 */
	const onDesktop = runningInTauri();
	let folderPath = $state('');
	const folderSaved = confirmed();
	let folderError = $state(false);

	onMount(() => {
		folderPath = rememberedFolder();
	});

	async function saveFolder() {
		folderError = false;
		if (!(await rememberFolder(folderPath))) {
			folderError = true;
			return;
		}
		folderSaved.show();
	}

	async function pickFolder() {
		const { open } = await import('@tauri-apps/plugin-dialog');
		const picked = await open({
			directory: true,
			multiple: false,
			title: t('settings.folderPick')
		});
		if (typeof picked !== 'string') return;
		folderPath = picked;
		await saveFolder();
	}
</script>

<!--
	Показувати поле, яке нічого не зробить, гірше, ніж не показувати нічого:
	у браузері картки немає зовсім.
-->
{#if onDesktop}
	<section class="card stack">
		<h2 class="subtitle">{t('settings.folderTitle')}</h2>
		<p class="muted">{t('settings.folderLead')}</p>

		<div class="field">
			<label class="field__label" for="music-folder">{t('settings.folderLabel')}</label>
			<input
				id="music-folder"
				class="input mono"
				type="text"
				spellcheck="false"
				placeholder="C:\Users\…\Music\Зал 2"
				bind:value={folderPath}
				data-testid="folder-path"
			/>
		</div>

		<div class="row">
			<button class="btn" type="button" onclick={pickFolder} data-testid="folder-pick">
				<IconFolder size={18} aria-hidden="true" />
				{t('settings.folderPick')}
			</button>

			<button class="btn btn--primary" type="button" onclick={saveFolder} data-testid="folder-save">
				{#if folderSaved.on}
					<IconCheck size={18} aria-hidden="true" />
					{t('settings.saved')}
				{:else}
					{t('settings.save')}
				{/if}
			</button>
		</div>

		{#if folderError}
			<p class="error" data-testid="folder-error">{t('settings.folderMissing')}</p>
		{/if}
	</section>
{/if}

<style>
	/* Той самий зріст підзаголовка, що й в інших карток панелі. */
	.subtitle {
		font-size: 1.05rem;
	}
</style>
