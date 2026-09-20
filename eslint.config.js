import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	{
		/*
		 * ІГНОРИ СТОЯТЬ ПЕРШИМИ І ОКРЕМИМ ОБ'ЄКТОМ — інакше вони не глобальні.
		 *
		 * `.claude/` тут не випадково: агент створює в ньому робочі дерева з
		 * повними копіями проєкту, і eslint заходить туди й червоніє на коді
		 * чужої сесії. Виглядає це як помилки у власному проєкті.
		 */
		ignores: [
			'build/',
			'.svelte-kit/',
			'dev-dist/',
			'node_modules/',
			'test-results/',
			'playwright-report/',
			'coverage/',
			'.claude/',
			'.private/',
			/*
			 * Збірка нативної частини. Tauri кладе туди згенерований JS
			 * (`__global-api-script.js`), і eslint падає на ньому розбором —
			 * у tsconfig його немає й бути не може. У CI цього не видно: там
			 * свіжий клон без `target/`, тож червоніє лише локальна машина,
			 * і виглядає це як зламаний лінтер.
			 */
			'src-tauri/target/',
			'src-tauri/gen/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			/*
			 * `__APP_VERSION__` — глобальна, оголошена через `define` у
			 * `vite.config.ts`. Доти замість неї стояло `no-undef: 'off'` на весь
			 * проєкт: одне ім'я коштувало вимкненого правила базового набору, тобто
			 * зелений `lint` більше нічого не доводив про решту імен
			 * (CODE-QUALITY-v9 § 6.4.1, `CQ-ESLINT-BASELINE`). У `.ts` правило й так
			 * вимикає typescript-eslint — там про невідоме ім'я каже компілятор, —
			 * а от у `.svelte` воно єдине, що ловить одруківку в назві глобальної.
			 */
			globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
			parserOptions: {
				/*
				 * `allowDefaultProject` — для файлів поза `tsconfig.json`
				 * (`eslint.config.js`, скрипти в `scripts/`). Без нього
				 * typescript-eslint падає на них із «was not found by the project
				 * service», і це виглядає як зламаний конфіг, а не як файл поза
				 * проєктом.
				 *
				 * `svelte.config.js` у переліку НЕМАЄ навмисно: його імпортує
				 * перевірка хешів CSP, тобто він уже входить у проєкт tsconfig.
				 * Файл, названий в обох місцях, відкидається з «included by
				 * allowDefaultProject but also by the project».
				 *
				 * МЕЖА піднята з типових восьми: восьмий скрипт у `scripts/`
				 * валить ВЕСЬ прогін одним рядком «Too many files (>8) have
				 * matched the default project», причому названий у ньому файл до
				 * справи не причетний. Файли тут дрібні, і платня — частки секунди.
				 */
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'scripts/*.mjs'],
					maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20
				},
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],

			/*
			 * ВИКОНАННЯ РЯДКА ЯК КОДУ. Жодного з цих правил немає в наборах
			 * `recommended` — ні в js, ні в typescript-eslint, — тож доти вони тут
			 * просто не діяли (SECURITY-v9 § 2, CODE-QUALITY-v9 § 6.4.1).
			 *
			 * Тут це не абстракція: застосунок читає ЧУЖУ відповідь із зовнішнього
			 * API за шляхом, який ввела людина (`triggers/trigger.ts`). Шлях до
			 * значення розбирається вручну саме тому, що спокуса зробити це одним
			 * `new Function` існує й виглядає коротшою.
			 */
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-script-url': 'error',

			/*
			 * СВІТ SVELTE 4 НЕ ПОВЕРТАЄТЬСЯ ЧЕРЕЗ ІМПОРТ. Проєкт цілком на рунах, і
			 * жодного такого імпорту зараз немає; правило стереже не сьогоднішній
			 * стан, а наступний фрагмент, узятий із чужої відповіді чи старої
			 * статті (SVELTE-CORE-v9 § 3).
			 */
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'svelte/store',
							message: 'Стан — рунами ($state/$derived), а не сторами Svelte 4.'
						},
						{
							name: '$app/stores',
							message: 'Застаріле: беріть $app/state (page.url замість $page.url).'
						}
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	},
	{
		files: ['scripts/**/*.mjs', '*.config.js'],
		languageOptions: { globals: globals.node }
	}
);
