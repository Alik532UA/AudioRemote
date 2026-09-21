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

/// Сторінка застосунку. Одне місце, з якого беруть і адресу вікна, і межу.
const APP_URL: &str = "https://alik532ua.github.io/AudioRemote/";

/// Що вважається «всередині застосунку» — за адресою, а не за походженням.
const APP_PREFIX: &str = "https://alik532ua.github.io/AudioRemote/";

/// ЧИ МОЖНА ВЕБВʼЮ ТУДИ ПІТИ — і чому це не те саме, що `remote.urls`.
///
/// `remote.urls` дає дозволи ПОХОДЖЕННЮ, бо більшого на звірку не приходить
/// (див. `remote_scope` нижче). А GitHub Pages віддає з одного походження всі
/// проєкти автора. Отже саме походження не розрізняє «наша сторінка» й
/// «сусідній проєкт», і зробити це там неможливо.
///
/// Зате можна зробити тут. Небезпечним сусід стає лише тоді, коли його
/// сторінка опиняється в ЦЬОМУ вебвʼю — і саме цього не буде: вікно не
/// переходить нікуди, крім `/AudioRemote/`. Зовнішніх посилань у застосунку
/// немає жодного, тож ціна рішення — нуль.
///
/// Схеми, які не є вебом (`about:`, `devtools:`, `blob:`), пропускаються:
/// походженням вони не стають, тож дозволів із `remote.urls` не успадковують,
/// а заборона зламала б службові переходи самого вебвʼю.
fn stays_in_app(url: &url::Url) -> bool {
    match url.scheme() {
        "http" | "https" => url.as_str().starts_with(APP_PREFIX),
        _ => true,
    }
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

    /*
     * АВТОЗАПУСК — лише на компʼютері, і лише як ПРАВО спитати.
     *
     * Плагін нічого не вмикає сам: він додає три команди («чи ввімкнено»,
     * «увімкнути», «вимкнути»), а тисне їх людина в налаштуваннях. Типово
     * вимкнено, і це не обережність заради обережності: застосунок, що
     * зʼявляється сам на чужому екрані, — рішення того, за чиїм компʼютером
     * він стоїть.
     *
     * `None` замість аргументів: при автозапуску застосунок мусить стартувати
     * рівно так само, як від значка. Прапорець «я з автозапуску» знадобився б
     * лише тому, хто хоче стартувати згорнутим, — а згорнутий плеєр, якого не
     * видно в залі, гірший за відсутній.
     */
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
    }

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
        /*
         * ВІКНО БУДУЄТЬСЯ ТУТ, А НЕ В КОНФІГУ, — рівно заради одного рядка.
         *
         * `on_navigation` існує лише в будівника; вікну, оголошеному в
         * `tauri.conf.json`, його потім не додати. Решта полів переїхала слово
         * в слово, і жодне з них не має власної думки: розміри, заголовок,
         * прапорці вебвʼю.
         *
         * `--autoplay-policy=no-user-gesture-required` лишається обовʼязковим:
         * без нього приймач мовчить, доки в нього не клацнуть, — а клацати
         * нікому, комп'ютер стоїть біля колонок.
         */
        .setup(|app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(APP_URL.parse().expect("APP_URL не є адресою")),
            )
            .title("AudioRemote — плеєр")
            .inner_size(1280.0, 860.0)
            .min_inner_size(380.0, 480.0)
            .resizable(true)
            .center()
            .additional_browser_args(
                "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                 --autoplay-policy=no-user-gesture-required",
            )
            .on_navigation(stays_in_app)
            .build()?;

            Ok(())
        })
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

/// ВЕБВʼЮ НЕ ВИХОДИТЬ ЗА МЕЖІ ЗАСТОСУНКУ.
///
/// Це друга половина рішення про межу (перша — `remote_scope` нижче). Дозволи
/// видані ПОХОДЖЕННЮ, бо більшого на звірку не приходить, а походження в
/// GitHub Pages спільне для всіх проєктів автора. Отже єдине місце, де «наша
/// сторінка» ще відрізняється від «сусіднього проєкту», — це рішення, куди
/// вебвʼю взагалі можна піти.
#[cfg(test)]
mod navigation {
    use super::stays_in_app;
    use url::Url;

    fn go(url: &str) -> bool {
        stays_in_app(&Url::parse(url).expect("некоректна адреса в перевірці"))
    }

    #[test]
    fn власні_сторінки_проходять() {
        // Без цього решта була б зеленою на межі, яка не пускає нікуди, —
        // тобто на застосунку з порожнім вікном.
        assert!(go(super::APP_URL), "початкова адреса заблокована — вікно буде порожнє");
        assert!(go("https://alik532ua.github.io/AudioRemote/player"));
        assert!(go("https://alik532ua.github.io/AudioRemote/remote?x=1#y"));
    }

    #[test]
    fn сусідній_проєкт_і_корінь_домену_не_проходять() {
        // САМЕ ЦЕ Й Є МЕЖА: походження в них те саме, що в нас, тож дозволи
        // вони успадкували б цілком.
        for foreign in [
            "https://alik532ua.github.io/Slovko/",
            "https://alik532ua.github.io/MindStep/",
            "https://alik532ua.github.io/",
            "https://alik532ua.github.io/AudioRemoteEvil/",
            "https://example.com/AudioRemote/",
            "http://alik532ua.github.io/AudioRemote/",
        ] {
            assert!(!go(foreign), "{foreign} пускають у вебвʼю застосунку");
        }
    }

    #[test]
    fn службові_схеми_не_чіпаємо() {
        /*
         * Вони не стають веб-походженням, тож дозволів із `remote.urls` не
         * успадковують. Заборона тут не додала б безпеки, зате зламала б
         * службові переходи самого вебвʼю.
         */
        assert!(go("about:blank"));
        assert!(go("devtools://devtools/bundled/inspector.html"));
    }
}

/// МЕЖА, ЗА ЯКОЮ ПОЧИНАЄТЬСЯ ДИСК, — І ЄДИНИЙ СПОСІБ ЇЇ ПЕРЕВІРИТИ.
///
/// `remote.urls` у capability вирішує, чия сторінка дістає `fs:allow-read-file`
/// і `fs:allow-write-text-file` на машині, де стоїть плеєр.
///
/// ## Що тут двічі розуміли неправильно
///
/// Спершу стояло «звіряється ПОХОДЖЕННЯ, а не шлях, точніше обмежити
/// неможливо». Потім це визнали неправдою: `RemoteUrlPattern` справді будує
/// [URLPattern], і `test()` на повній адресі шлях розрізняє. Межу звузили до
/// `https://alik532ua.github.io/AudioRemote/*`, а цей модуль «довів», що
/// сусідні проєкти більше не підпадають.
///
/// Довів він не те. Застосунок звіряє НЕ повну адресу: у
/// `tauri-2.11.6/src/ipc/protocol.rs` адреса для ACL береться із ЗАГОЛОВКА
/// `Origin`, а заголовок `Origin` за означенням не має шляху. Тобто на звірку
/// приходить `https://alik532ua.github.io/`, і патерн зі шляхом не збігається
/// НІКОЛИ — жодна нативна команда не проходить. Журнал застосунку сказав це
/// дослівно: `dialog.open not allowed on window "main", URL:
/// https://alik532ua.github.io/`.
///
/// Висновок, який тепер тримає цей модуль: **межа тут — походження**, і
/// звузити її нижче неможливо не через незнання, а через те, ЩО САМЕ
/// приходить на звірку. Тому перевірка годує патерн ПОХОДЖЕННЯМ — рівно тим,
/// чим його годує застосунок, — і окремо вимагає, щоб у патерні не було шляху:
/// шлях тут не звужує межу, він її ВИМИКАЄ.
///
/// Те, чого ця межа не закриває (сторінка сусіднього проєкту, яка опинилася б
/// у цьому вебвʼю), закривається в іншому місці — забороною вебвʼю виходити за
/// `/AudioRemote/`. Справжнє звуження самої межі коштувало б власного домену.
///
/// [URLPattern]: https://urlpattern.spec.whatwg.org/
#[cfg(test)]
mod remote_scope {
    use std::str::FromStr;
    use tauri_utils::acl::RemoteUrlPattern;
    use url::Url;

    /// Рядки з `capabilities/default.json` — читаємо ФАЙЛ, а не копію.
    ///
    /// Копія рядка в тесті перевіряла б саму себе: правку в capability вона
    /// пережила б зеленою.
    fn raw_urls() -> Vec<String> {
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
                value
                    .as_str()
                    .expect("remote.urls містить не рядок")
                    .to_owned()
            })
            .collect()
    }

    fn patterns() -> Vec<RemoteUrlPattern> {
        raw_urls()
            .iter()
            .map(|text| {
                RemoteUrlPattern::from_str(text)
                    .unwrap_or_else(|_| panic!("{text} не є коректним URLPattern"))
            })
            .collect()
    }

    /// ЗВІРКА ЙДЕ ПОХОДЖЕННЯМ, а не повною адресою — так само, як у застосунку.
    ///
    /// Саме на цій різниці попередня редакція модуля й «довела» звуження,
    /// якого не було: вона подавала сюди `…/AudioRemote/`, а застосунок подає
    /// `…/`.
    fn origin_matches(page: &str) -> bool {
        let parsed = Url::parse(page).expect("некоректна адреса в перевірці");
        let origin = Url::parse(&parsed.origin().ascii_serialization())
            .expect("походження не розібралося назад в адресу");
        patterns().iter().any(|pattern| pattern.test(&origin))
    }

    #[test]
    fn сторінка_застосунку_проходить() {
        // Без цього решта перевірок була б зеленою на порожній межі.
        assert!(
            origin_matches("https://alik532ua.github.io/AudioRemote/"),
            "власна сторінка не підпадає під remote.urls — застосунок не дістане ні \
             діалогу, ні файлів, і виглядатиме це як зламана кнопка «Обрати папку»"
        );
        // SvelteKit ходить маршрутами всередині того самого шляху.
        assert!(
            origin_matches("https://alik532ua.github.io/AudioRemote/player"),
            "внутрішній маршрут не підпадає — команди відмовлять після першого переходу"
        );
    }

    #[test]
    fn шлях_у_патерні_вимикає_застосунок() {
        /*
         * ЦЕ НЕ СТИЛЬ, А ПРАЦЕЗДАТНІСТЬ. Заголовок `Origin` шляху не має, тож
         * патерн зі шляхом не збігається з нічим і мовчки знімає всі дозволи.
         * Перевіряється САМ РЯДОК конфігу: `test()` на походженні тут сказав би
         * лише «не збіглося», не назвавши причини.
         */
        for url in raw_urls() {
            let path = url
                .split_once("://")
                .and_then(|(_, rest)| rest.split_once('/'))
                .map(|(_, path)| path.to_owned())
                .unwrap_or_default();

            assert!(
                path.is_empty() || path == "*",
                "{url}: шлях у remote.urls не звужує межу, а вимикає застосунок — \
                 на звірку приходить лише походження"
            );
        }
    }

    #[test]
    fn чужий_домен_і_http_не_проходять() {
        // Це те, що межа справді ловить, і саме це вона мусить ловити далі.
        for foreign in [
            "https://example.com/AudioRemote/",
            "http://alik532ua.github.io/AudioRemote/",
            "https://alik532ua.github.io.evil.com/AudioRemote/",
            "http://localhost:5173/",
        ] {
            assert!(!origin_matches(foreign), "{foreign} підпадає під remote.urls");
        }
    }

    #[test]
    fn сусідній_проєкт_підпадає_і_це_названо() {
        /*
         * НЕПРИЄМНА ПРАВДА, ЗАПИСАНА ПРОГОНОМ.
         *
         * GitHub Pages віддає всі проєкти автора з одного походження, тож межа
         * capability їх не розрізняє й розрізнити не може. Раніше це намагалися
         * приховати шляхом у патерні — і ціною був непрацездатний застосунок.
         *
         * Опис стоїть тут, щоб наступна спроба «звузити» почалася з падіння на
         * ньому, а не з тижня пошуку, чому не відкривається діалог. Закриває цю
         * діру не capability, а заборона вебвʼю йти за межі `/AudioRemote/`.
         */
        assert!(
            origin_matches("https://alik532ua.github.io/Slovko/"),
            "сусідній проєкт перестав підпадати — якщо це зробили шляхом у \
             remote.urls, то застосунок зараз не працює зовсім; межу тримає \
             on_navigation, а не цей рядок"
        );
    }
}
