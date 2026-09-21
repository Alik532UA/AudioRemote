import { isBoardExpired } from './boardLifetime';
import { forgetBoard, listBoards, type SavedBoard } from './myBoards';
import { mark } from '$lib/services/breadcrumbs';

/**
 * ПРИБРАТИ СВОЇ ПРОСТРОЧЕНІ ДОШКИ — перший із двох автоматичних шарів.
 *
 * ## Що це покриває, а що ні
 *
 * Покриває найчастіший випадок: людина створила дошку для разового заходу,
 * закрила вкладку й повернулася наступного року. Браузер-господар пам'ятає
 * адресу, правило бази дозволяє йому знести СВОЄ (`ownerUid === auth.uid`), і
 * нових прав для цього не потрібно жодних.
 *
 * НЕ покриває дошок тих, хто не повернеться ніколи, — там браузера вже немає,
 * а `boards` не перелічується за побудовою. Це другий шар, і він на сервері:
 * `scripts/sweep-boards.mjs` під сервісним акаунтом, який правила обходить.
 *
 * ## Чому «видаляти чуже» тут не з'являється навіть як спокуса
 *
 * Щоб прибирати чуже, потрібне право видаляти чуже — а це готовий примітив
 * «знести всі дошки» одним циклом із консолі браузера. Сусідній `MindStep`
 * саме через цю зручність тримав свою колекцію відкритою на запис. Тут такої
 * дірки немає й не буде: клієнт чіпає лише те, чим володіє.
 *
 * ## Чому мовчки
 *
 * Прибирання — не подія для людини. Вона відкрила меню, щоб вибрати дошку, а
 * не щоб дізнатися про прибрані. Слід лишається в журналі дій (`mark`), тобто
 * там, куди дивляться, коли щось пішло не так.
 */
export interface SweepResult {
	/** Скільки дощок знесено з бази. */
	removed: number;
	/** Скільки перевірити не вдалося (немає мережі, відмова бази). */
	failed: number;
}

/**
 * Прибрати прострочені дошки, створені в цьому браузері.
 *
 * Не кидає: виклик стоїть на шляху відкриття меню, і збій прибирання не мусить
 * лишати людину без списку.
 */
export async function sweepOwnExpiredBoards(now: number = Date.now()): Promise<SweepResult> {
	const result: SweepResult = { removed: 0, failed: 0 };

	// «Своя» — та, для якої збережений пароль, тобто створена тут. Для чужих
	// (пульт) права немає, та й видаляти їх не наша справа.
	const mine = listBoards().filter((board) => Boolean(board.password));
	if (mine.length === 0) return result;

	const { readInfo } = await import('$lib/net/board');

	for (const board of mine) {
		try {
			const info = await readInfo(board.key);

			/*
			 * Дошки немає в базі — місцевий запис протух. Прибираємо саме
			 * ЗАПИС, а не мовчимо: інакше список роками показує адреси, за
			 * якими нічого немає, і кожне натискання веде в порожнечу.
			 */
			if (!info) {
				forgetBoard(board.key);
				continue;
			}

			if (!isBoardExpired(info, now)) continue;

			await removeBoardEverywhere(board);
			result.removed += 1;
		} catch {
			// Немає мережі або база відмовила. Дошка нікому не заважає й зникне
			// наступного разу — або її забере прибиральний прогін.
			result.failed += 1;
		}
	}

	if (result.removed > 0 || result.failed > 0) {
		mark(`sweep: знесено ${result.removed}, не вдалося ${result.failed}`);
	}
	return result;
}

/**
 * Знести дошку з бази разом з адмінським каналом і місцевим записом.
 *
 * Порядок той самий, що й у кнопки видалення, і з тієї самої причини: канал
 * живе в ОКРЕМІЙ гілці, з видаленням дошки не зникає, а знайти його потім
 * буде нічим — адмінський пароль лежить у місцевому записі, який ми зараз
 * зітремо.
 */
async function removeBoardEverywhere(board: SavedBoard): Promise<void> {
	if (board.adminPassword) {
		const { deriveAdminKey } = await import('./boardPath');
		const { closeChannel } = await import('$lib/net/admin');
		// Саме `key`, а не `id`: канал виведений з АДРЕСИ дошки (`deriveAdminKey`).
		await closeChannel(await deriveAdminKey(board.key, board.adminPassword));
	}

	const { deleteBoard } = await import('$lib/net/board');
	await deleteBoard(board.key);
	forgetBoard(board.key);
}
