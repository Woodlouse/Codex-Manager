use tauri::Manager;
use tauri::WebviewWindowBuilder;

use super::state::KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE;

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
    let Some(window) = ensure_main_window(app) else {
        return;
    };
    if let Err(err) = window.show() {
        log::warn!("show main window failed: {}", err);
        return;
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn ensure_main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        return Some(window);
    }

    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .or_else(|| app.config().app.windows.first().cloned())?;
    config.label = MAIN_WINDOW_LABEL.to_string();

    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build()) {
        Ok(window) => Some(window),
        Err(err) => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                return Some(window);
            }
            log::warn!("create main window failed: {}", err);
            None
        }
    }
}
