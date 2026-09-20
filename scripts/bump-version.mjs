/**
 * ПІДНЯТИ ВЕРСІЮ — АВТОМАТИЧНО, А НЕ КОЛИ ЗГАДАЛОСЯ.
 *
 * Версія стояла на `0.0.1` від першого дня. Показує її сторінка налаштувань і
 * заголовок звіту про помилку — тобто число, яке мало б відповідати на «яка
 * збірка в залі», не відповідало ні на що. Руками цього не роблять ніколи:
 * пам'ятати про номер посеред правки неможливо, і саме тому за канону
 * (VERSIONING-v9 § 1.1) це робить хук.
 *
 * Модель обрана й записана в `PROJECT-CONTEXT.md` § 4: **бамп на коміт**. Канон
 * (§ 1.2) називає її прийнятною для проєкту з одним автором і деплоєм на кожен
 * push, і називає ціну прямо: номер стає лічильником комітів, а не випусків.
 *
 * Розширення `.mjs`, а не `.js`: у проєкті з `"type": "module"` це однаково ESM,
 * але розширення каже про це без читання `package.json`.
 *
 * Запуск:
 *   node scripts/bump-version.mjs               підняти patch
 *   node scripts/bump-version.mjs --sync-only   не чіпати номер, лише файл
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = join(root, 'package.json');
const versionPath = join(root, 'static', 'app-version.json');

const syncOnly = process.argv.includes('--sync-only');

const raw = readFileSync(packagePath, 'utf8');
const pkg = JSON.parse(raw);

if (!syncOnly) {
	const parts = String(pkg.version).split('.');
	if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
		console.error(`bump-version: незрозуміла версія «${pkg.version}» — нічого не міняю`);
		process.exit(1);
	}

	parts[2] = String(Number(parts[2]) + 1);
	pkg.version = parts.join('.');

	/*
	 * Записуємо ТОЧКОВО, регулярним виразом по першому полю `version`, а не
	 * `JSON.stringify` усього обʼєкта. Причина суто практична: `stringify`
	 * переформатував би файл цілком, і коміт, у якому змінилася одна цифра,
	 * виглядав би як переписаний package.json (див. PROJECT-CONTEXT § 4 про два
	 * пробіли в цьому файлі).
	 */
	writeFileSync(packagePath, raw.replace(/"version":\s*"[^"]+"/, `"version": "${pkg.version}"`));
}

/*
 * Тільки номер. `buildTime` і хеш коміту сюди НЕ пишуться (VERSIONING-v9 § 1.4):
 * інакше кожна локальна збірка робила б відстежуваний файл зміненим, і ця зміна
 * раз по раз потрапляла б у чужі коміти як шум.
 */
writeFileSync(versionPath, `${JSON.stringify({ version: pkg.version }, null, '\t')}\n`);

console.log(`версія: ${pkg.version}${syncOnly ? ' (лише синхронізація)' : ''}`);
