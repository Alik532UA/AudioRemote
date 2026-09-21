<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { runningInTauri } from '$lib/audio/tauriSource';

	/**
	 * ЗАПУСКАТИСЯ РАЗОМ ІЗ СИСТЕМОЮ — лише у застосунку на компʼютері.
	 *
	 * У браузері такого не буває в принципі, і показувати перемикач, який
	 * нічого не зробить, гірше, ніж не показувати нічого. Те саме рішення й з
	 * тієї ж причини, що в картці папки з музикою.
	 *
	 * ## Стан питається в СИСТЕМИ, а не зберігається в нас
	 *
	 * Запис в автозапуску — це стан ОС, і другого джерела правди в нього бути
	 * не може: людина могла прибрати застосунок із автозапуску засобами самої
	 * системи, і наш збережений прапорець після цього брехав би. Тому при
	 * відкритті налаштувань питаємо `isEnabled()`, а перемикач показує
	 * відповідь.
	 *
	 * ## Типово вимкнено
	 *
	 * Плагін сам нічого не вмикає: він лише дає право спитати й перемкнути.
	 * Застосунок, що зʼявляється сам на чужому екрані, — рішення того, за чиїм
	 * компʼютером він стоїть.
	 *
	 * ## Плагін вантажиться на вимогу
	 *
	 * Динамічним імпортом, як і решта нативного: статичний рядок тягнув би код
	 * плагіна у кожну сторінку, зокрема й у браузері, де він не знадобиться
	 * ніколи.
	 */
	const onDesktop = runningInTauri();

	/** `null` — ще не спитали або система не відповіла. */
	let enabled = $state<boolean | null>(null);
	let busy = $state(false);

	onMount(() => {
		if (!onDesktop) return;
		void (async () => {
			try {
				const { isEnabled } = await import('@tauri-apps/plugin-autostart');
				enabled = await isEnabled();
			} catch {
				// Немає відповіді — немає перемикача: краще нічого, ніж навмання.
				enabled = null;
			}
		})();
	});

	async function set(next: boolean) {
		if (busy) return;
		busy = true;
		try {
			const { disable, enable, isEnabled } = await import('@tauri-apps/plugin-autostart');
			if (next) await enable();
			else await disable();
			// Питаємо систему ще раз, а не віримо власному наміру: відмову вона
			// повертає не завжди, а перемикач мусить показувати те, що є насправді.
			enabled = await isEnabled();
		} catch {
			enabled = null;
		} finally {
			busy = false;
		}
	}
</script>

{#if onDesktop && enabled !== null}
	<div class="field">
		<Switch
			checked={enabled}
			label={t('settings.autoStart')}
			testid="settings-auto-start"
			onchange={(next) => void set(next)}
		/>
		<p class="muted">{t('settings.autoStartHint')}</p>
	</div>
{/if}
