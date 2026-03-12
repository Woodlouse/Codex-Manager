use tauri::Manager;

mod app_shell;
mod app_storage;
mod commands;
mod rpc_client;
mod service_runtime;

use app_shell::{
    handle_main_window_event, handle_run_event, load_env_from_exe_dir, notify_existing_instance_focused,
    setup_tray, show_main_window, sync_startup_window_state, CLOSE_TO_TRAY_ON_CLOSE, TRAY_AVAILABLE,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log::info!(
                "secondary instance intercepted; focusing main window (args: {:?}, cwd: {})",
                args,
                cwd
            );
            show_main_window(app);
            notify_existing_instance_focused();
        }))
        .setup(|app| {
            load_env_from_exe_dir();
            app_storage::apply_runtime_storage_env(app.handle());
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir { file_name: None },
                    )])
                    .build(),
            )?
            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("log dir: {}", log_dir.display());
            }
            if let Err(err) = setup_tray(app.handle()) {
                TRAY_AVAILABLE.store(false, std::sync::atomic::Ordering::Relaxed);
                CLOSE_TO_TRAY_ON_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
                log::warn!("tray setup unavailable, continue without tray: {}", err);
            }
            codexmanager_service::sync_runtime_settings_from_storage();
            sync_startup_window_state();
            Ok(())
        })
        .on_window_event(|window, event| {
            handle_main_window_event(window, event);
        })
        .invoke_handler(commands::invoke_handler!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        handle_run_event(app_handle, &event);
    });
}

#[cfg(test)]
#[path = "tests/lib_tests.rs"]
mod tests;
