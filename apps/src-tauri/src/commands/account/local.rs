use codexmanager_core::storage::Storage;

use crate::app_storage::resolve_db_path_with_legacy_migration;

#[tauri::command]
pub async fn local_account_delete(
    app: tauri::AppHandle,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let db_path = resolve_db_path_with_legacy_migration(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = Storage::open(db_path).map_err(|e| e.to_string())?;
        storage
            .delete_account(&account_id)
            .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "ok": true }))
    })
    .await
    .map_err(|err| format!("local_account_delete task failed: {err}"))?
}
