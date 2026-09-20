<script lang="ts">
	import SettingsPanel from '$lib/components/settings/SettingsPanel.svelte';

	/**
	 * Сторінка налаштувань лишається — як пряме посилання й як запасний шлях,
	 * коли вікно поверх сторінки чомусь не відкрилося. Увесь вміст живе в
	 * компоненті, бо те саме показується у вікні (`SettingsDialog`).
	 */
</script>

<SettingsPanel />
