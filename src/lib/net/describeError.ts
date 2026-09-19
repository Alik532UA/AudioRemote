import { InsecureContextError } from '$lib/board/boardPath';
import type { TranslationKey } from '$lib/i18n/i18n.svelte';
import { ConfigMissingError, ConnectionDownError } from './firebase';

/**
 * ПОМИЛКА → ТЕКСТ, ЯКИЙ КАЖЕ, ЩО РОБИТИ.
 *
 * Одне місце на весь застосунок, і не заради стислості. Сторінки ловлять ті
 * самі кілька різновидів відмов, і кожна, що робила б це сама, неминуче
 * показала б людині або `error.message` (тобто `auth/network-request-failed`),
 * або «щось пішло не так» на випадок, у якому дія очевидна.
 *
 * Розрізняються саме ті відмови, у яких дія РІЗНА:
 *
 * | Відмова | Що робити людині |
 * |---|---|
 * | емулятор не піднято | відкрити термінал і запустити його |
 * | бракує змінних | налаштувати проєкт |
 * | сторінка не по https | відкрити з localhost або з бойової адреси |
 * | правила відмовили | правила не викладені |
 * | мережа | перевірити інтернет |
 *
 * Усе інше лишається «щось пішло не так» — і це чесно: якщо ми не знаємо, що
 * сталося, вигадувати пораду гірше, ніж її не давати.
 */
export function describeError(error: unknown): TranslationKey {
	if (error instanceof ConnectionDownError) {
		return error.emulator ? 'error.emulatorDown' : 'error.network';
	}
	if (error instanceof ConfigMissingError) return 'error.configMissing';
	if (error instanceof InsecureContextError) return 'player.insecure';

	const code = (error as { code?: string } | null)?.code ?? '';
	if (code === 'PERMISSION_DENIED' || code === 'permission-denied') return 'error.denied';
	if (code.includes('network')) return 'error.network';

	// Правила RTDB віддають відмову без коду — лише текстом повідомлення.
	const message = error instanceof Error ? error.message : '';
	if (message.includes('permission_denied') || message.includes('Permission denied')) {
		return 'error.denied';
	}

	return 'error.unknown';
}
