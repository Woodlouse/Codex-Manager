use crate::app_storage::apply_runtime_storage_env;

use super::tray_state::{
    effective_close_to_tray_requested, sync_window_runtime_state_from_settings, tray_available,
};

#[tauri::command]
pub fn app_close_to_tray_on_close_get(app: tauri::AppHandle) -> bool {
    apply_runtime_storage_env(&app);
    if let Ok(mut settings) = codexmanager_service::app_settings_get() {
        sync_window_runtime_state_from_settings(&mut settings);
    }
    codexmanager_service::current_close_to_tray_on_close_setting() && tray_available()
}

#[tauri::command]
pub fn app_close_to_tray_on_close_set(app: tauri::AppHandle, enabled: bool) -> bool {
    apply_runtime_storage_env(&app);
    let payload = serde_json::json!({
        "closeToTrayOnClose": enabled
    });
    if let Ok(mut settings) = codexmanager_service::app_settings_set(Some(&payload)) {
        sync_window_runtime_state_from_settings(&mut settings);
    }
    codexmanager_service::current_close_to_tray_on_close_setting() && tray_available()
}

#[tauri::command]
pub async fn app_settings_get(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    let mut settings = tauri::async_runtime::spawn_blocking(move || {
        codexmanager_service::app_settings_get_with_overrides(
            Some(effective_close_to_tray_requested()),
            Some(tray_available()),
        )
    })
    .await
    .map_err(|err| format!("app_settings_get task failed: {err}"))??;
    sync_window_runtime_state_from_settings(&mut settings);
    Ok(settings)
}

#[tauri::command]
pub async fn app_settings_set(
    app: tauri::AppHandle,
    patch: serde_json::Value,
) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    let mut settings = tauri::async_runtime::spawn_blocking(move || {
        codexmanager_service::app_settings_set(Some(&patch))
    })
    .await
    .map_err(|err| format!("app_settings_set task failed: {err}"))??;
    sync_window_runtime_state_from_settings(&mut settings);
    Ok(settings)
}
