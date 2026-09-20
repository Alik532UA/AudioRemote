// Без консольного вікна в релізі: приймач відкривають на комп'ютері в залі, і
// чорний прямокутник поруч із застосунком там нічого не пояснює.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    audioremote_lib::run()
}
