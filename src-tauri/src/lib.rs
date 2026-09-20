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
    tauri::Builder::default()
        // Порядок має значення: `persisted-scope` відновлює збережені дозволи
        // при старті, тож його плагін мусить стояти після `fs`.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![allow_folder])
        .run(tauri::generate_context!())
        .expect("не вдалося запустити AudioRemote");
}
