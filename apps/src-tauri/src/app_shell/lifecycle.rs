use crate::service_runtime::stop_service;

use super::state::{
    should_keep_alive_for_lightweight_close, APP_EXIT_REQUESTED, CLOSE_TO_TRAY_ON_CLOSE,
    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE, LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY, TRAY_AVAILABLE,
};
use super::window::MAIN_WINDOW_LABEL;
#[cfg(target_os = "macos")]
use super::window::show_main_window;

pub(crate) fn handle_main_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if APP_EXIT_REQUESTED.load(std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        if !CLOSE_TO_TRAY_ON_CLOSE.load(std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        if !TRAY_AVAILABLE.load(std::sync::atomic::Ordering::Relaxed) {
            CLOSE_TO_TRAY_ON_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
            return;
        }
        if LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed) {
            KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE
                .store(true, std::sync::atomic::Ordering::Relaxed);
            log::info!(
                "window close intercepted; lightweight mode enabled, closing main window to release webview"
            );
            return;
        }
        api.prevent_close();
        if let Err(err) = window.hide() {
            log::warn!("hide window to tray failed: {}", err);
        } else {
            log::info!("window close intercepted; app hidden to tray");
        }
        return;
    }
    if let tauri::WindowEvent::Destroyed = event {
        if should_keep_alive_for_lightweight_close() {
            log::info!("main window destroyed for lightweight tray mode");
            return;
        }
        stop_service();
    }
}

pub(crate) fn handle_run_event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if should_keep_alive_for_lightweight_close() {
                api.prevent_exit();
                log::info!("prevented app exit for lightweight tray mode");
                return;
            }
            APP_EXIT_REQUESTED.store(true, std::sync::atomic::Ordering::Relaxed);
            KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
            stop_service();
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_main_window(app);
        }
        _ => {}
    }
}
