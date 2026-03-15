use crate::app_storage::apply_runtime_storage_env;

#[tauri::command]
pub async fn service_listen_config_get(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    tauri::async_runtime::spawn_blocking(move || {
        Ok(serde_json::json!({
            "mode": codexmanager_service::current_service_bind_mode(),
            "options": [
                codexmanager_service::SERVICE_BIND_MODE_LOOPBACK,
                codexmanager_service::SERVICE_BIND_MODE_ALL_INTERFACES
            ],
            "requiresRestart": true,
        }))
    })
    .await
    .map_err(|err| format!("service_listen_config_get task failed: {err}"))?
}

#[tauri::command]
pub async fn service_listen_config_set(
    app: tauri::AppHandle,
    mode: String,
) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    tauri::async_runtime::spawn_blocking(move || {
        codexmanager_service::set_service_bind_mode(&mode).map(|applied| {
            serde_json::json!({
                "mode": applied,
                "options": [
                    codexmanager_service::SERVICE_BIND_MODE_LOOPBACK,
                    codexmanager_service::SERVICE_BIND_MODE_ALL_INTERFACES
                ],
                "requiresRestart": true,
            })
        })
    })
    .await
    .map_err(|err| format!("service_listen_config_set task failed: {err}"))?
}
