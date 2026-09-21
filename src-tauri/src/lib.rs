//! ОБОЛОНКА, А НЕ ЗАСТОСУНОК.
//!
//! Уся видима частина AudioRemote — це та сама сторінка, яку відкривають
//! телефони: вона лежить на GitHub Pages і оновлюється сама (сервісний воркер
//! плюс пропозиція «оновити», див. `src/lib/services/updateCheck.ts`). Сюди
//! вшито рівно те, чого браузер не вміє: читання папки з музикою за шляхом.
//!
//! Через це exe не треба перевстановлювати при кожній зміні коду — він
//! міняється лише тоді, коли міняється оце.
//!
//! ## Чому дозвіл видається окремою командою
//!
//! Плагін файлів працює за областю дії (scope), і за задумом вона описується
//! наперед у `capabilities/`. Але наперед тут не можна: папку називає людина,
//! і в кожній школі вона своя. Альтернатива — дозволити застосунку весь
//! `$HOME`, тобто зняти обмеження й лишити від нього назву.
//!
//! Тому область дії розширюється рівно на ту папку, яку щойно обрали в
//! діалозі, — і тільки на неї. `tauri-plugin-persisted-scope` зберігає цей
//! дозвіл між запусками: без нього шлях у налаштуваннях лишався б записаним, а
//! читати за ним було б не можна.

use tauri_plugin_fs::FsExt;

/// Дозволити читати саме цю папку. Кличеться одразу після вибору в діалозі.
#[tauri::command]
fn allow_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let scope = app.fs_scope();
    scope
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        // Порядок має значення: `persisted-scope` відновлює збережені дозволи
        // при старті, тож його плагін мусить стояти після `fs`.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_process::init());

    let context = tauri::generate_context!();

    /*
     * ОНОВЛЮВАЧ — ЛИШЕ ТАМ, ДЕ НАЛАШТОВАНИЙ ЙОГО КАНАЛ.
     *
     * Умов тут дві, і вони про різне.
     *
     * `cfg(desktop)` — про збірку: крейт підключений під
     * `cfg(not(android|ios))`, тож на мобільних цього рядка не має бути
     * взагалі, інакше падає компіляція.
     *
     * `updater_configured` — про ЗАПУСК, і без нього застосунок не стартував
     * узагалі. Адреса `latest.json` і відкритий ключ живуть в окремій
     * накладці `tauri.conf.release.json`, яку накладає лише робочий процес
     * релізу: інакше кожна локальна збірка вимагала б ключа підпису. Але
     * плагін, зареєстрований без свого розділу в конфігу, не пропускає `null`
     * повз себе — він валить старт:
     *
     *     PluginInitialization("updater", "Error deserializing
     *     'plugins.updater' … invalid type: null, expected struct Config")
     *
     * Тобто `npm run tauri:dev`, `rebuild-exe.mjs` і вже зібраний exe
     * відкривалися рівно ніколи, а `cargo build` при цьому був зелений:
     * ламалося не збирання, а перший рядок виконання.
     */
    #[cfg(desktop)]
    if updater_configured(context.config()) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![allow_folder])
        .run(context)
        .expect("не вдалося запустити AudioRemote");
}

/// Чи є в конфігу розділ `plugins.updater` — тобто чи вміє ця збірка оновлюватися.
///
/// Рішення винесене у функцію, а не написане рядком на місці, рівно щоб його
/// можна було перевірити прогоном на справжніх файлах конфігу.
#[cfg(desktop)]
fn updater_configured(config: &tauri::utils::config::Config) -> bool {
    config.plugins.0.contains_key("updater")
}

/// КАНАЛ ОНОВЛЕННЯ ЖИВЕ В НАКЛАДЦІ — А ПЛАГІН РЕЄСТРУВАВСЯ ЗАВЖДИ.
///
/// Розбіжність між цими двома реченнями коштувала повної непрацездатності
/// застосунку: `cargo build` зелений, а exe не відкривається зовсім і падає
/// першим рядком виконання з `PluginInitialization("updater", … invalid type:
/// null …)`. Перевірити це читанням коду складно — рішення «реєструвати чи ні»
/// було написане рядком на місці, а конфіг, якого воно стосується, лежить у
/// сусідньому файлі й застосовується лише в CI.
///
/// Тому рішення винесене у `updater_configured`, а тут воно звіряється з
/// ОБОМА справжніми файлами: базовим конфігом (каналу немає — плагін не
/// реєструється) і накладкою релізу (канал є — реєструється).
#[cfg(all(test, desktop))]
mod updater_channel {
    use tauri::utils::config::Config;

    fn read(name: &str) -> serde_json::Value {
        let raw =
            std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(name))
                .unwrap_or_else(|_| panic!("{name} не прочитано"));
        serde_json::from_str(&raw).unwrap_or_else(|_| panic!("{name} не розібрано"))
    }

    /// Конфіг із розділом плагіна або без нього — тим самим типом, що в застосунку.
    fn config(plugins: serde_json::Value) -> Config {
        serde_json::from_value(serde_json::json!({
            "identifier": "проба",
            "plugins": plugins
        }))
        .expect("конфіг проби не розібрано")
    }

    #[test]
    fn рішення_читає_саме_розділ_плагіна() {
        assert!(!super::updater_configured(&config(serde_json::json!({}))));
        assert!(super::updater_configured(&config(
            serde_json::json!({ "updater": { "endpoints": [] } })
        )));
    }

    #[test]
    fn плагін_реєструється_лише_під_умовою() {
        /*
         * Два описи вище перевіряють ФАЙЛИ, і обидва лишилися б зеленими, якби
         * хтось прибрав саму умову — а саме її відсутність і не давала
         * застосунку відкритися. Тому тут перевіряється РЯДОК, що реєструє
         * плагін: він мусить стояти під `if updater_configured(...)`, а не сам
         * по собі.
         */
        let source = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs"),
        )
        .expect("src/lib.rs не прочитано");

        let guard = source
            .find("if updater_configured(")
            .expect("умову реєстрації прибрано — застосунок не відкриється взагалі");
        let register = source
            .find(".plugin(tauri_plugin_updater::Builder::new()")
            .expect("рядок реєстрації оновлювача не знайдено — перевірка шукає не те");

        assert!(
            guard < register && register - guard < 200,
            "реєстрація оновлювача не під умовою: плагін без розділу в конфігу              валить старт із PluginInitialization(\"updater\", … invalid type: null …)"
        );
    }

    #[test]
    fn базовий_конфіг_каналу_не_має() {
        // Саме тому реєстрація й мусить бути умовною: кожна локальна збірка
        // (`tauri:dev`, `rebuild-exe.mjs`, зібраний exe) бере лише цей файл.
        let base = read("tauri.conf.json");
        assert!(
            base["plugins"]["updater"].is_null(),
            "у базовому конфігу зʼявився канал оновлення — тоді ключ підпису              став потрібен на кожній локальній збірці"
        );
    }

    #[test]
    fn накладка_релізу_канал_має() {
        // Інакше опублікований застосунок ніколи не оновиться, і помітити це
        // можна було б лише через місяць на живій машині.
        let release = read("tauri.conf.release.json");
        assert!(
            release["plugins"]["updater"]["endpoints"]
                .as_array()
                .is_some_and(|list| !list.is_empty()),
            "у накладці релізу немає адреси latest.json"
        );
    }
}

/// МЕЖА, ЗА ЯКОЮ ПОЧИНАЄТЬСЯ ДИСК, — І ЄДИНИЙ СПОСІБ ЇЇ ПЕРЕВІРИТИ.
///
/// `remote.urls` у capability вирішує, чия сторінка дістає `fs:allow-read-file`
/// і `fs:allow-write-text-file` на машині, де стоїть плеєр. Довго вважалося,
/// що звузити це можна лише до домену: у самій capability так і було написано
/// («звіряється ПОХОДЖЕННЯ, а не шлях»). Це НЕПРАВДА, і ціна помилки була
/// висока — `https://alik532ua.github.io/*` це весь GitHub Pages автора, тобто
/// XSS у будь-якому сусідньому проєкті отримував доступ до файлів.
///
/// Насправді рядок тлумачиться як [URLPattern], і шлях у ньому працює. Але
/// перевіряти це читанням не можна через одну тиху деталь реалізації
/// (`tauri-utils/src/acl/mod.rs`, `RemoteUrlPattern::from_str`): якщо шлях у
/// патерні порожній або дорівнює `/`, він МОВЧКИ замінюється на `*`. Тобто
/// `https://host` і `https://host/` означають «весь домен», а виглядають як
/// точна адреса.
///
/// Тому межа перевіряється прогоном, тим самим типом, що судитиме в застосунку.
///
/// [URLPattern]: https://urlpattern.spec.whatwg.org/
#[cfg(test)]
mod remote_scope {
    use std::str::FromStr;
    use tauri_utils::acl::RemoteUrlPattern;
    use url::Url;

    /// Патерни з `capabilities/default.json` — читаємо ФАЙЛ, а не копію.
    ///
    /// Копія рядка в тесті перевіряла б саму себе: правку в capability вона
    /// пережила б зеленою.
    fn patterns() -> Vec<RemoteUrlPattern> {
        let raw = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json"),
        )
        .expect("capabilities/default.json не прочитано");

        let json: serde_json::Value = serde_json::from_str(&raw).expect("capability не розібрано");
        let urls = json["remote"]["urls"]
            .as_array()
            .expect("у capability немає remote.urls — форма файлу змінилася");

        assert!(
            !urls.is_empty(),
            "remote.urls порожній — перевіряти нема що"
        );

        urls.iter()
            .map(|value| {
                let text = value.as_str().expect("remote.urls містить не рядок");
                RemoteUrlPattern::from_str(text)
                    .unwrap_or_else(|_| panic!("{text} не є коректним URLPattern"))
            })
            .collect()
    }

    fn matches(url: &str) -> bool {
        let parsed = Url::parse(url).expect("некоректна адреса в перевірці");
        patterns().iter().any(|pattern| pattern.test(&parsed))
    }

    #[test]
    fn сторінка_застосунку_проходить() {
        // Без цього решта перевірок була б зеленою на порожній межі.
        assert!(
            matches("https://alik532ua.github.io/AudioRemote/"),
            "власна сторінка не підпадає під remote.urls — застосунок не дістане доступу до тек"
        );
        // SvelteKit ходить маршрутами всередині того самого шляху.
        assert!(
            matches("https://alik532ua.github.io/AudioRemote/board/abc"),
            "внутрішній маршрут не підпадає — команди відмовлять після першого переходу"
        );
    }

    #[test]
    fn сусідні_проєкти_на_тому_самому_домені_не_проходять() {
        // САМЕ ЦЕ Й БУЛО ДІРКОЮ. GitHub Pages віддає всі проєкти автора з
        // одного домену, тож поки межа була доменом, XSS у будь-якому з них
        // отримував читання й запис файлів на машині з плеєром.
        for foreign in [
            "https://alik532ua.github.io/Slovko/",
            "https://alik532ua.github.io/MindStep/",
            "https://alik532ua.github.io/HotPaste/",
            "https://alik532ua.github.io/",
            "https://alik532ua.github.io/AudioRemoteEvil/",
        ] {
            assert!(
                !matches(foreign),
                "{foreign} підпадає під remote.urls — межа ширша за застосунок"
            );
        }
    }

    #[test]
    fn чужий_домен_і_http_не_проходять() {
        for foreign in [
            "https://example.com/AudioRemote/",
            "http://alik532ua.github.io/AudioRemote/",
            "https://alik532ua.github.io.evil.com/AudioRemote/",
        ] {
            assert!(!matches(foreign), "{foreign} підпадає під remote.urls");
        }
    }
}
