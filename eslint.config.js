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
			'.private/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				/*
				 * `allowDefaultProject` -- для файлів поза `tsconfig.json`
				 * (`svelte.config.js`, `eslint.config.js`). Без нього
				 * typescript-eslint падає на них із «was not found by the
				 * project service», і це виглядає як зламаний конфіг, а не як
				 * файл поза проєктом.
				 */
				projectService: { allowDefaultProject: ['*.js', 'scripts/*.mjs'] },
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			// Версія збірки приходить через `define` у vite.config.ts.
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
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
