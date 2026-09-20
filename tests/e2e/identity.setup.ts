import { expect, test as setup } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * ТОТОЖНІСТЬ ЗБІРКИ НА ПОРТІ (`GATE-E2E-IDENTITY`).
 *
 * Найдорожча помилка браузерного набору — не червоний прогін, а ЗЕЛЕНИЙ не
 * проти того, що перевіряли. Стара тека `build/`, дев-сервер на тому ж порті,
 * забутий процес із минулого тижня — і весь набір чесно проходить, не довівши
 * нічого. Червоного при цьому не буде ніколи: перевірки ж пройшли.
 *
 * Тому це перший проєкт, і решта залежать від нього. Він не питає, чи
 * застосунок працює, — він питає, ЧИ ТОЙ ЦЕ ЗАСТОСУНОК.
 */

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

setup('на порті лежить саме поточна збірка', async ({ request }) => {
	/*
	 * `app-version.json` кладе в `static/` той самий хук, що піднімає версію в
	 * `package.json`. Розбіжність означає одне з двох: `build/` старий або порт
	 * чужий — і обидва варіанти роблять прогін безглуздим.
	 */
	const stamp = await request.get('./app-version.json');
	expect(stamp.ok(), 'порт не віддає app-version.json — це не наша збірка').toBeTruthy();

	const served = (await stamp.json()) as { version: string };
	expect(served.version, 'на порті інша версія: або `build/` старий, або там чужий процес').toBe(
		pkg.version
	);
});

setup('на порті ЗБІРКА, а не дев-сервер', async ({ page }) => {
	await page.goto('./');

	/*
	 * Політика безпеки приїжджає в `<meta>` і зʼявляється лише у зібраному
	 * HTML: у dev її немає. Тобто це найдешевша ознака, яка розрізняє два
	 * режими, і заразом саме те, повз що не можна перевіряти — половина
	 * браузерних перевірок нижче саме про неї.
	 */
	const policy = page.locator('meta[http-equiv="content-security-policy"]');
	await expect(policy, 'у HTML немає CSP — це дев-сервер, а не збірка').toHaveCount(1);

	const content = (await policy.getAttribute('content')) ?? '';
	expect(content, 'у політиці немає хешів — інлайн-скрипт поїде заблокованим').toContain('sha256-');
});
