// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * КАНАЛ ОНОВЛЕННЯ ОБОЛОНКИ — ланцюг із пʼяти ланок, і кожна рветься ТИХО.
 *
 * ## Чому цей канал узагалі зʼявився
 *
 * Доти його не було, і це випливало з архітектури, а не з недогляду: видима
 * частина AudioRemote приходить із мережі й оновлюється сама, тож exe
 * міняється рідко. Але «рідко» не означає «ніколи», і ціна цього виявилася
 * конкретною: коміт, який звузив `remote.urls` з усього домену до самого
 * застосунку, доїжджає до залу лише з новим exe. Тобто без каналу виправлення
 * БЕЗПЕКИ лишалося б на машинах школи невстановленим, доки хтось не обійде їх
 * з інсталятором.
 *
 * ## Що саме перевіряється й чому по файлах
 *
 * Оновлення працює, лише коли зійшлося все:
 *
 *   1. плагін зареєстрований у Rust;
 *   2. `updater:default` і `process:allow-restart` є у дозволах вікна —
 *      інакше виклик із вебвʼю відкидає ACL, а помилка читається як
 *      «оновлень немає»;
 *   3. у релізній збірці є адреса `latest.json` і ВІДКРИТИЙ ключ;
 *   4. релізний workflow справді кладе `latest.json` у реліз;
 *   5. у застосунку є код, який питає й ставить.
 *
 * Жодна з цих ланок при поломці нічого не ламає ВИДИМО. Застосунок
 * запускається, працює, просто ніколи не оновлюється — і дізнатися про це
 * можна лише через місяці. Поведінкою це не відтворити без живого релізу, тож
 * перевірка по файлах.
 *
 * Перевірити НЕ можна одного — що відкритий ключ відповідає приватному з
 * секретів. Це видно лише на машині, яка приймає оновлення.
 */

const CONF = 'src-tauri/tauri.conf.json';
const RELEASE_CONF = 'src-tauri/tauri.conf.release.json';
const CAPABILITY = 'src-tauri/capabilities/default.json';
const WORKFLOW = '.github/workflows/release.yml';
const LIB_RS = 'src-tauri/src/lib.rs';
const CARGO = 'src-tauri/Cargo.toml';
const SERVICE = 'src/lib/services/desktopUpdate.ts';
const PROMPT = 'src/lib/components/ui/DesktopUpdatePrompt.svelte';
const LAYOUT = 'src/routes/+layout.svelte';

const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const conf = JSON.parse(read(CONF));
const releaseConf = JSON.parse(read(RELEASE_CONF));
const capability = JSON.parse(read(CAPABILITY));
const workflow = read(WORKFLOW);
const libRs = read(LIB_RS);

describe('плагін оновлення підʼєднаний', () => {
	it('зареєстрований у Rust', () => {
		expect(
			libRs,
			'tauri_plugin_updater не зареєстрований — команди оновлення не існує, ' +
				"і виклик із вебвʼю падає з «unknown command»"
		).toContain('tauri_plugin_updater::Builder::new()');
	});

	it('перезапуск теж підʼєднаний', () => {
		// `relaunch()` живе в плагіні процесів, а не в оновлювачі: без нього
		// оновлення встановиться й не застосується до наступного ручного запуску.
		expect(libRs, 'tauri_plugin_process не зареєстрований').toContain(
			'tauri_plugin_process::init()'
		);
		expect(read(CARGO), 'tauri-plugin-updater немає в залежностях').toContain(
			'tauri-plugin-updater'
		);
	});

	it('дозволений у можливостях вікна', () => {
		expect(
			capability.permissions,
			'без updater:default виклик check() відкидає ACL, а помилка читається ' +
				'як «оновлень немає»'
		).toContain('updater:default');
		expect(
			capability.permissions,
			'без process:allow-restart перезапуск після встановлення не відбудеться'
		).toContain('process:allow-restart');
	});
});

describe('релізна збірка знає, звідки брати оновлення', () => {
	it('накладка існує окремо від основного конфігу', () => {
		expect(existsSync(RELEASE_CONF)).toBe(true);
		/*
		 * Налаштування оновлення НЕ в основному конфігу навмисно: разом із
		 * `createUpdaterArtifacts` вони вимагають ключ підпису на КОЖНІЙ
		 * збірці, тобто локальна збірка перестала б працювати без секрету.
		 */
		expect(
			conf.plugins?.updater,
			'налаштування оновлення переїхали в основний конфіг — тоді локальна ' +
				'збірка вимагатиме ключа підпису'
		).toBeUndefined();
	});

	it('адреса latest.json указана й веде в цей репозиторій', () => {
		const endpoints: string[] = releaseConf.plugins?.updater?.endpoints ?? [];
		expect(endpoints.length, 'без endpoints застосунок не має куди питати').toBeGreaterThan(0);
		expect(endpoints.some((e) => e.endsWith('latest.json'))).toBe(true);
		expect(
			endpoints.every((e) => e.startsWith('https://github.com/Alik532UA/AudioRemote/')),
			`адреса оновлення веде не в цей репозиторій: ${endpoints.join(', ')}`
		).toBe(true);
	});

	it('оновлювані артефакти вмикаються саме тут', () => {
		expect(releaseConf.bundle?.createUpdaterArtifacts).toBe(true);
	});

	it('відкритий ключ є — хоч би й заглушкою, але названою', () => {
		/*
		 * Заглушку тут ДОЗВОЛЕНО, і це свідомо: пару генерує людина, приватна
		 * половина живе в секретах репозиторію, і покласти її сюди неможливо.
		 *
		 * Заборонено інше — щоб заглушка доїхала до релізу. Це ловить перший
		 * крок `release.yml`, і саме його наявність перевіряє тест нижче.
		 */
		const pubkey: string = releaseConf.plugins?.updater?.pubkey ?? '';
		expect(pubkey.length, 'поля pubkey немає — плагін не знає, чий підпис приймати').toBeGreaterThan(
			0
		);
	});
});

describe('реліз доставляє те, що читає застосунок', () => {
	it('workflow кладе latest.json у реліз', () => {
		expect(
			workflow,
			'без includeUpdaterJson реліз виглядає повним, а оновлення не приходить нікому'
		).toContain('includeUpdaterJson: true');
	});

	it('workflow накладає саме релізний конфіг', () => {
		expect(workflow).toContain('--config src-tauri/tauri.conf.release.json');
	});

	it('заглушка ключа спиняє випуск, а не їде в реліз', () => {
		expect(
			workflow,
			'у workflow немає перевірки заглушки — застосунок опублікується й не ' +
				'прийме жодного оновлення, а помітити це можна буде лише через місяць'
		).toContain('ЗАМІНІТЬ_ЦЕ_НА_ВІДКРИТИЙ_КЛЮЧ');
		expect(workflow, 'секрет приватного ключа не перевіряється до збірки').toContain(
			'TAURI_SIGNING_PRIVATE_KEY'
		);
	});

	it('межу capability перевіряють перед випуском', () => {
		/*
		 * Що саме пропускає `remote.urls`, доводить лише `cargo test`. Випуск —
		 * останній момент, коли зайву адресу ще можна спинити: далі exe поїде
		 * на машини школи, і відкотити його людина не зможе.
		 */
		expect(workflow, 'релізна збірка не ганяє cargo test — межа диска не перевірена').toContain(
			'cargo test --lib'
		);
	});
});

describe('у застосунку є що показати людині', () => {
	it('служба перевірки існує й розрізняє три стани', () => {
		const service = read(SERVICE);
		expect(service).toContain("kind: 'none'");
		expect(
			service,
			'немає стану «перевірити не вдалося» — тоді збірка без каналу каже ' +
				'«у вас найновіша версія», і це неправда'
		).toContain("kind: 'unavailable'");
		expect(service).toContain("kind: 'ready'");
	});

	it('пропозиція змонтована й окрема від оновлення сторінки', () => {
		const layout = read(LAYOUT);
		expect(layout, 'DesktopUpdatePrompt не змонтований — служба нікому не показує').toContain(
			'<DesktopUpdatePrompt />'
		);
		expect(
			layout,
			'пропозиція оновити СТОРІНКУ зникла — лишилася б лише та, що перезапускає застосунок'
		).toContain('<ReloadPrompt />');
	});

	it('оновлення не ставиться саме', () => {
		/*
		 * Головне правило цього застосунку: вкладка приймача — єдине, що грає
		 * звук у залі. Оновлення оболонки перезапускає вікно, тобто обриває
		 * звук, і рішення про це не має права ухвалювати програма.
		 */
		const prompt = read(PROMPT);
		expect(prompt, 'немає кнопки — значить, ставиться саме').toContain('onclick={apply}');
		expect(
			prompt,
			'немає попередження про тишу: людина за плеєром мусить бачити ціну до натискання'
		).toContain("t('shell.warning')");
	});
});
